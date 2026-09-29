"""
CA CRM Regulatory Update Pipeline v2 — Rule-Based, No AI
Improvements: context-aware filtering, better date extraction,
dynamic FY/AY, deduplication, dry-run mode, event_id, publisher tracking
"""

import feedparser
import os
import hashlib
import re
import time
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

# ─── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"
LOOKBACK_DAYS = 10
RELEVANCE_THRESHOLD = 4
DEADLINE_EXPIRY_BUFFER_DAYS = 2
DEFAULT_TEMPORARY_RETENTION_DAYS = 90
SUPERSEDED_RETENTION_DAYS = 30
MAX_ARTICLES_PER_FEED = 10

IST = ZoneInfo("Asia/Kolkata")

# ─── Dynamic FY / AY ──────────────────────────────────────────────────────────
def get_financial_year():
    today = datetime.now(IST)
    if today.month >= 4:
        return f"{today.year}-{str(today.year + 1)[2:]}"
    return f"{today.year - 1}-{str(today.year)[2:]}"

def get_current_year():
    return datetime.now(IST).year

FY = get_financial_year()         # e.g. "2026-27"
CY = get_current_year()           # e.g. 2026

# ─── Source Priority ──────────────────────────────────────────────────────────
TRUSTED_PUBLISHERS = {
    "incometaxindia.gov.in": 3,
    "cbic.gov.in": 3,
    "mca.gov.in": 3,
    "icai.org": 2,
    "pib.gov.in": 2,
    "taxscan.in": 1,
    "taxmann.com": 1,
    "caclubindia.com": 1,
    "a2ztaxcorp.com": 1,
    "economictimes.com": 1,
    "livemint.com": 1,
    "business-standard.com": 1,
}

def get_publisher_score(url: str) -> int:
    if not url:
        return 0
    for domain, score in TRUSTED_PUBLISHERS.items():
        if domain in url:
            return score
    return 0

# ─── RSS Feeds ────────────────────────────────────────────────────────────────
RSS_FEEDS = [
    {
        "query_source": "CBDT Income Tax",
        "url": f"https://news.google.com/rss/search?q=CBDT+income+tax+notification+India+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 3,
    },
    {
        "query_source": "Income Tax Deadline",
        "url": f"https://news.google.com/rss/search?q=income+tax+deadline+extension+India+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 3,
    },
    {
        "query_source": "Tax Audit",
        "url": f"https://news.google.com/rss/search?q=tax+audit+due+date+extension+India+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 3,
    },
    {
        "query_source": "TDS TCS",
        "url": f"https://news.google.com/rss/search?q=TDS+TCS+notification+India+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 2,
    },
    {
        "query_source": "CBIC GST",
        "url": f"https://news.google.com/rss/search?q=CBIC+GST+notification+circular+India+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 3,
    },
    {
        "query_source": "GST Deadline",
        "url": f"https://news.google.com/rss/search?q=GST+deadline+extension+return+India+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 3,
    },
    {
        "query_source": "MCA ROC",
        "url": f"https://news.google.com/rss/search?q=MCA+ROC+compliance+notification+India+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 2,
    },
    {
        "query_source": "ICAI Professional",
        "url": f"https://news.google.com/rss/search?q=ICAI+professional+member+announcement+India+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 1,
    },
    {
        "query_source": "Accounting Standards",
        "url": f"https://news.google.com/rss/search?q=accounting+standard+auditing+standard+India+ICAI+{CY}&hl=en-IN&gl=IN&ceid=IN:en",
        "base_score": 2,
    },
]

# ─── Blacklist: Reject PHRASES (context-aware) ────────────────────────────────
# These are PHRASES not single words — safe to match
BLACKLIST_PHRASES = [
    r"\bca\s+foundation\s+exam",
    r"\bca\s+intermediate\s+exam",
    r"\bca\s+final\s+exam",
    r"\bca\s+student\b",
    r"\bca\s+students\b",
    r"\bstudent\s+exam",
    r"\bexam\s+result",
    r"\badmit\s+card",
    r"\bhall\s+ticket",
    r"\bca\s+result\b",
    r"\bicai\s+result",
    r"\bicai\s+exam",
    r"\bicai\s+timetable",
    r"\bfoundation\s+result",
    r"\bintermediate\s+result",
    r"\bscholarship",
    r"\bconvocation",
    r"\bcampus\s+placement",
    r"\bstock\s+market\b",
    r"\bnifty\b",
    r"\bsensex\b",
    r"\bshare\s+price",
    r"\bcricket\b",
    r"\bbollywood\b",
    r"\bweather\b",
    r"\brecipe\b",
    r"\blifestyle\b",
    r"\bbeauty\b",
    r"\bfashion\b",
    r"\bjob\s+vacancy",
    r"\bjob\s+opening",
    r"\bhiring\s+now",
    r"\bsalary\s+hike\b",
    r"\bmotivational\b",
    r"\binspiration\b",
    r"\bopinion\s*:\s",
    r"\beditorial\s*:\s",
    r"\bipo\b(?!\s+compliance)",  # IPO alone = reject, but "IPO compliance" = keep
]

def is_blacklisted(text: str) -> tuple[bool, str]:
    text_lower = text.lower()
    for pattern in BLACKLIST_PHRASES:
        if re.search(pattern, text_lower):
            return True, f"Matched blacklist pattern: {pattern}"
    return False, ""

# ─── Category Scoring ─────────────────────────────────────────────────────────
CATEGORY_SIGNALS = {
    "Direct Tax": {
        "HIGH": [
            r"\bcbdt\b", r"\bincome\s+tax\s+notification", r"\bincome\s+tax\s+circular",
            r"\btax\s+audit\b", r"\bitr\s+filing", r"\bitr\s+deadline",
            r"\bincome\s+tax\s+deadline", r"\bincome\s+tax\s+extension",
            r"\btds\b", r"\btcs\b", r"\badvance\s+tax\b",
            r"\btax\s+audit\s+due\s+date", r"\bincome\s+tax\s+due\s+date",
        ],
        "MEDIUM": [
            r"\bincome\s+tax\s+rules", r"\bincome\s+tax\s+act",
            r"\bform\s+26as\b", r"\bain\b", r"\bais\b",
            r"\bsection\s+\d+\w*\b",
        ],
        "LOW": [
            r"\bincome\s+tax\b", r"\bdirect\s+tax\b",
        ],
    },
    "GST": {
        "HIGH": [
            r"\bgst\s+notification", r"\bgst\s+circular", r"\bgst\s+deadline",
            r"\bgst\s+extension", r"\bgstr[-\s]\d+", r"\bgst\s+return",
            r"\bgst\s+rate\s+change", r"\be-invoice\b", r"\be-way\s+bill\b",
            r"\bcbic\b",
        ],
        "MEDIUM": [
            r"\bgst\s+portal", r"\bgst\s+registration", r"\bgst\s+refund",
            r"\bgst\s+compliance",
        ],
        "LOW": [
            r"\bgst\b",
        ],
    },
    "Corporate Law": {
        "HIGH": [
            r"\bmca\s+notification", r"\bmca\s+circular", r"\broc\s+filing",
            r"\bcompanies\s+act\b", r"\bmca\s+compliance", r"\bmca\s+extension",
            r"\bmca\s+scheme\b", r"\bdpt-3\b", r"\baoc-4\b", r"\bmgt-7\b",
        ],
        "MEDIUM": [
            r"\bannual\s+return\s+filing", r"\bdirector\s+kyc\b",
            r"\bllp\s+filing", r"\bllp\s+compliance",
        ],
        "LOW": [
            r"\bmca\b", r"\broc\b",
        ],
    },
    "Audit & Accounting": {
        "HIGH": [
            r"\baccounting\s+standard\b", r"\bauditing\s+standard\b",
            r"\bind\s+as\b", r"\bsa\s+\d+\b",
            r"\bstatutory\s+audit\b", r"\btax\s+audit\s+report\b",
        ],
        "MEDIUM": [
            r"\baudit\s+requirement", r"\bfinancial\s+reporting\b",
        ],
        "LOW": [],
    },
    "ICAI": {
        "HIGH": [
            r"\bicai\s+professional", r"\bicai\s+member", r"\bicai\s+notification",
            r"\bicai\s+guideline", r"\bicai\s+standard",
        ],
        "MEDIUM": [
            r"\bicai\s+announcement", r"\bicai\s+circular",
        ],
        "LOW": [],
    },
    "Compliance": {
        "HIGH": [
            r"\bdue\s+date\s+extended", r"\bdeadline\s+extended",
            r"\bextension\s+granted", r"\blate\s+fee\s+waiver",
            r"\bpenalty\s+waiver", r"\bcompliance\s+deadline",
        ],
        "MEDIUM": [
            r"\bcompliance\s+calendar", r"\bfiling\s+deadline",
        ],
        "LOW": [],
    },
}

IMPORTANCE_SCORE = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}

def classify(title: str, summary: str) -> dict:
    combined = (title + " " + (summary or "")).lower()
    category_scores: dict[str, int] = {}
    importance_by_cat: dict[str, str] = {}
    matched_signals = []

    for cat, levels in CATEGORY_SIGNALS.items():
        score = 0
        best_imp = "LOW"
        for imp, patterns in levels.items():
            for pat in patterns:
                if re.search(pat, combined):
                    score += IMPORTANCE_SCORE[imp]
                    matched_signals.append(f"{cat}/{imp}: {pat}")
                    if IMPORTANCE_SCORE[imp] > IMPORTANCE_SCORE.get(best_imp, 0):
                        best_imp = imp
        if score > 0:
            category_scores[cat] = score
            importance_by_cat[cat] = best_imp

    if not category_scores:
        return {
            "score": 0, "category": "General", "importance": "LOW",
            "client_impact": False, "action_required": False,
            "relevance_reason": "No relevant CA/compliance signals found.",
        }

    primary_cat = max(category_scores, key=lambda c: category_scores[c])
    importance = importance_by_cat[primary_cat]
    total_score = sum(category_scores.values())

    # Action required detection
    action_phrases = [
        r"\bextended\b", r"\bdeadline\b", r"\bdue\s+date\b", r"\blast\s+date\b",
        r"\bfiling\s+required\b", r"\bmandatory\b", r"\bcomply\b",
        r"\blast\s+day\b", r"\bpenalty\b", r"\bwaiver\b",
    ]
    action_required = any(re.search(p, combined) for p in action_phrases)

    # Client impact
    client_impact_cats = {"Direct Tax", "GST", "Corporate Law", "Compliance", "Audit & Accounting"}
    client_impact = primary_cat in client_impact_cats and importance in ("HIGH", "MEDIUM")

    reason = f"{primary_cat} ({importance}): matched [{', '.join(matched_signals[:3])}]"

    return {
        "score": total_score,
        "category": primary_cat,
        "importance": importance,
        "client_impact": client_impact,
        "action_required": action_required,
        "relevance_reason": reason,
    }

# ─── Date Extraction ──────────────────────────────────────────────────────────
MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
}

DEADLINE_CONTEXT = [
    r"extended?\s+to", r"extended?\s+till", r"extended?\s+until",
    r"due\s+date\s+(?:is\s+)?(?:now\s+)?(?:is\s+)?",
    r"last\s+date\s+(?:is\s+)?", r"deadline\s+(?:is\s+)?(?:now\s+)?",
    r"till\b", r"until\b", r"by\b",
    r"last\s+day\b",
]

EFFECTIVE_FROM_CONTEXT = [
    r"effective\s+from", r"applicable\s+from", r"comes?\s+into\s+effect",
    r"with\s+effect\s+from", r"w\.e\.f\.?\s*",
    r"notified\s+(?:on\s+)?(?:with\s+effect\s+from\s+)?",
]

def parse_date_match(groups) -> datetime | None:
    """Parse a regex groups tuple into a date"""
    try:
        g = [x.strip() for x in groups if x]
        if len(g) == 3:
            # Try day-month-year
            if g[0].isdigit() and not g[1].isdigit() and g[2].isdigit():
                day, month_str, year = int(g[0]), g[1][:3].lower(), int(g[2])
                month = MONTH_MAP.get(month_str, 0)
            elif not g[0].isdigit() and g[1].isdigit() and g[2].isdigit():
                month_str, day, year = g[0][:3].lower(), int(g[1]), int(g[2])
                month = MONTH_MAP.get(month_str, 0)
            elif g[0].isdigit() and g[1].isdigit() and g[2].isdigit():
                if int(g[0]) > 31:
                    year, month, day = int(g[0]), int(g[1]), int(g[2])
                else:
                    day, month, year = int(g[0]), int(g[1]), int(g[2])
            else:
                return None

            if 1 <= month <= 12 and 1 <= day <= 31 and 2024 <= year <= 2030:
                return datetime(year, month, day, tzinfo=IST)
    except (ValueError, IndexError):
        pass
    return None


DATE_PATTERNS = [
    r'(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})',
    r'(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})[,]?\s+(\d{4})',
    r'(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,.]?\s+(\d{4})',
    r'(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})',
]


def extract_dates_with_context(text: str) -> dict:
    """Extract deadline_date and effective_from from text using context"""
    text_lower = text.lower()
    all_dates_with_pos = []

    for pattern in DATE_PATTERNS:
        for m in re.finditer(pattern, text_lower):
            dt = parse_date_match(m.groups())
            if dt:
                all_dates_with_pos.append((m.start(), dt))

    if not all_dates_with_pos:
        return {"deadline_date": None, "effective_from": None}

    # Find deadline dates
    deadline_date = None
    effective_from = None

    for ctx_pattern in DEADLINE_CONTEXT:
        for cm in re.finditer(ctx_pattern, text_lower):
            # Find the nearest date after this context
            for pos, dt in sorted(all_dates_with_pos, key=lambda x: x[0]):
                if pos >= cm.end() and pos <= cm.end() + 60:
                    if not deadline_date or dt > deadline_date:
                        deadline_date = dt
                    break

    for ctx_pattern in EFFECTIVE_FROM_CONTEXT:
        for cm in re.finditer(ctx_pattern, text_lower):
            for pos, dt in sorted(all_dates_with_pos, key=lambda x: x[0]):
                if pos >= cm.end() and pos <= cm.end() + 60:
                    if not effective_from:
                        effective_from = dt
                    break

    return {
        "deadline_date": deadline_date.date() if deadline_date else None,
        "effective_from": effective_from.date() if effective_from else None,
    }

# ─── Retention Logic ──────────────────────────────────────────────────────────
TEMPORARY_SIGNALS = [
    r"\bextended?\b", r"\bextension\b", r"\bdeadline\b",
    r"\bdue\s+date\b", r"\blast\s+date\b", r"\btemporary\b",
    r"\bone.time\b", r"\brelief\b", r"\bwaiver\b",
    r"\bportal\s+down\b", r"\bmaintenance\b",
    r"\bfy\s*" + str(CY), r"\bay\s*" + str(CY),
]

EVERGREEN_SIGNALS = [
    r"\bnew\s+rule\b", r"\bnew\s+notification\b", r"\bnew\s+circular\b",
    r"\bamendment\b", r"\beffective\s+from\b", r"\bapplicable\s+from\b",
    r"\bnewly\s+notified\b", r"\baccounting\s+standard\b",
    r"\bauditing\s+standard\b", r"\bact\s+amended\b",
]


def determine_retention(title: str, summary: str, deadline_date) -> tuple[str, datetime | None]:
    combined = (title + " " + (summary or "")).lower()

    is_temporary = any(re.search(p, combined) for p in TEMPORARY_SIGNALS)
    is_evergreen = any(re.search(p, combined) for p in EVERGREEN_SIGNALS)

    if is_evergreen and not is_temporary:
        return "EVERGREEN", None

    if is_temporary and deadline_date:
        expires = datetime.combine(
            deadline_date + timedelta(days=DEADLINE_EXPIRY_BUFFER_DAYS),
            datetime.min.time()
        ).replace(tzinfo=timezone.utc)
        return "TEMPORARY", expires

    if is_temporary:
        expires = datetime.now(timezone.utc) + timedelta(days=DEFAULT_TEMPORARY_RETENTION_DAYS)
        return "TEMPORARY", expires

    # Uncertain
    expires = datetime.now(timezone.utc) + timedelta(days=DEFAULT_TEMPORARY_RETENTION_DAYS)
    return "REVIEW_REQUIRED", expires

# ─── Hashing & Dedup ──────────────────────────────────────────────────────────
def make_entry_id(url: str, title: str) -> str:
    """Stable ID based on URL if available, else title"""
    raw = url.strip() if url else title.lower().strip()
    return hashlib.md5(raw.encode()).hexdigest()


def make_content_hash(title: str) -> str:
    """Normalized title hash for dedup"""
    cleaned = re.sub(r'[^a-z0-9 ]', '', title.lower())
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    # Remove common noise words for better matching
    noise = r'\b(the|a|an|in|on|to|for|of|and|or|is|are|has|have|by|at|from|with)\b'
    cleaned = re.sub(noise, '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return hashlib.md5(cleaned.encode()).hexdigest()


def make_event_id(category: str, title: str, deadline_date) -> str:
    """Deterministic event ID for grouping similar events"""
    # Normalize title — keep important words
    t = re.sub(r'[^a-z0-9 ]', '', title.lower())
    t = re.sub(r'\s+', ' ', t).strip()
    words = t.split()[:6]  # first 6 meaningful words
    cat_code = category.upper().replace(" ", "")[:6]
    date_part = str(deadline_date) if deadline_date else str(CY)
    raw = f"{cat_code}:{' '.join(words)}:{date_part}"
    return f"{cat_code}-{hashlib.md5(raw.encode()).hexdigest()[:8].upper()}"

# ─── Publisher extraction ─────────────────────────────────────────────────────
def get_publisher(entry) -> tuple[str, str]:
    """Extract publisher name and article URL from feedparser entry"""
    publisher = ""
    article_url = getattr(entry, "link", "") or ""

    # feedparser source
    source = getattr(entry, "source", None)
    if source:
        publisher = getattr(source, "title", "") or ""

    # Try to extract from URL
    if not publisher and article_url:
        m = re.search(r'https?://(?:www\.)?([^/]+)', article_url)
        if m:
            publisher = m.group(1)

    return publisher, article_url

# ─── Main ─────────────────────────────────────────────────────────────────────
def fetch_and_save():
    now_utc = datetime.now(timezone.utc)
    cutoff_date = now_utc - timedelta(days=LOOKBACK_DAYS)

    if DRY_RUN:
        print("\n🔵 DRY RUN MODE — nothing will be written to Supabase\n")

    print(f"Financial Year: {FY} | Year: {CY}")
    print(f"Lookback: {LOOKBACK_DAYS} days | Cutoff: {cutoff_date.strftime('%Y-%m-%d')}")

    if not DRY_RUN:
        from supabase import create_client
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
            return
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

        # Cleanup expired records
        print("\n--- Cleanup: expired records ---")
        try:
            supabase.table("regulatory_updates").delete()\
                .lt("expires_at", now_utc.isoformat())\
                .neq("retention_type", "EVERGREEN")\
                .execute()
            print("  Done.")
        except Exception as e:
            print(f"  Cleanup error: {e}")

        # Fetch existing
        print("\n--- Loading existing entries ---")
        existing_ids = set()
        existing_content_hashes = set()
        try:
            result = supabase.table("regulatory_updates")\
                .select("id, content_hash").execute()
            for row in (result.data or []):
                existing_ids.add(row["id"])
                if row.get("content_hash"):
                    existing_content_hashes.add(row["content_hash"])
            print(f"  {len(existing_ids)} existing entries")
        except Exception as e:
            print(f"  Error: {e}")
            existing_ids, existing_content_hashes = set(), set()
    else:
        existing_ids, existing_content_hashes = set(), set()

    # Stats
    stats = {"added": 0, "updated": 0, "duplicate": 0,
             "blacklisted": 0, "low_score": 0, "too_old": 0, "error": 0}

    print("\n--- Fetching feeds ---")

    for feed_config in RSS_FEEDS:
        print(f"\n[{feed_config['query_source']}]")
        try:
            feed = feedparser.parse(feed_config["url"])

            if hasattr(feed, 'status') and feed.status >= 400:
                print(f"  HTTP {feed.status} — skipping")
                continue

            entries = feed.entries[:MAX_ARTICLES_PER_FEED]
            print(f"  {len(entries)} entries found")

            for entry in entries:
                title = getattr(entry, "title", "").strip()
                if not title:
                    continue

                # Clean summary
                raw_summary = getattr(entry, "summary", "") or ""
                summary = re.sub(r"<[^>]+>", "", raw_summary).strip()[:400]

                publisher, article_url = get_publisher(entry)

                # Published date check
                pub_parsed = getattr(entry, "published_parsed", None)
                if pub_parsed:
                    pub_dt = datetime(*pub_parsed[:6], tzinfo=timezone.utc)
                    if pub_dt < cutoff_date:
                        stats["too_old"] += 1
                        continue
                    published_at = pub_dt.isoformat()
                else:
                    published_at = now_utc.isoformat()

                # Blacklist check
                blacklisted, bl_reason = is_blacklisted(title + " " + summary)
                if blacklisted:
                    stats["blacklisted"] += 1
                    print(f"  BLACKLIST: {title[:55]} | {bl_reason}")
                    continue

                # Classify
                classification = classify(title, summary)
                pub_score = get_publisher_score(article_url)
                total_score = classification["score"] + feed_config["base_score"] + pub_score

                # Reject LOW importance
                if total_score < RELEVANCE_THRESHOLD or classification["importance"] == "LOW":
                    stats["low_score"] += 1
                    print(f"  LOW_SCORE ({total_score}): {title[:55]}")
                    continue

                # Deduplication
                entry_id = make_entry_id(article_url, title)
                content_hash = make_content_hash(title)

                if entry_id in existing_ids or content_hash in existing_content_hashes:
                    stats["duplicate"] += 1
                    print(f"  DUPLICATE: {title[:55]}")
                    # Update last_seen_at
                    if not DRY_RUN and entry_id in existing_ids:
                        try:
                            supabase.table("regulatory_updates")\
                                .update({"last_seen_at": now_utc.isoformat()})\
                                .eq("id", entry_id).execute()
                            stats["updated"] += 1
                        except Exception:
                            pass
                    continue

                # Date extraction
                dates = extract_dates_with_context(title + " " + summary)
                deadline_date = dates["deadline_date"]
                effective_from = dates["effective_from"]

                # Retention
                retention_type, expires_at = determine_retention(title, summary, deadline_date)

                # Event ID
                event_id = make_event_id(
                    classification["category"], title, deadline_date
                )

                row = {
                    "id": entry_id,
                    "source": feed_config["query_source"],
                    "query_source": feed_config["query_source"],
                    "publisher": publisher or None,
                    "title": title,
                    "summary": summary or None,
                    "url": article_url or None,
                    "article_url": article_url or None,
                    "published_at": published_at,
                    "is_approved": False,
                    "affects_compliance": [],
                    "category": classification["category"],
                    "importance": classification["importance"],
                    "client_impact": classification["client_impact"],
                    "action_required": classification["action_required"],
                    "relevance_reason": classification["relevance_reason"],
                    "deadline_date": deadline_date.isoformat() if deadline_date else None,
                    "effective_from": effective_from.isoformat() if effective_from else None,
                    "effective_until": None,  # only set when text explicitly says so
                    "expires_at": expires_at.isoformat() if expires_at else None,
                    "retention_type": retention_type,
                    "content_hash": content_hash,
                    "event_id": event_id,
                    "status": "active",
                    "first_seen_at": now_utc.isoformat(),
                    "last_seen_at": now_utc.isoformat(),
                }

                tag = f"[{classification['importance']}][{classification['category']}]"
                print(f"  ADD {tag}: {title[:50]}")
                if deadline_date:
                    print(f"    → deadline: {deadline_date} | expires: {expires_at}")

                if not DRY_RUN:
                    try:
                        supabase.table("regulatory_updates").upsert(
                            row, on_conflict="id", ignore_duplicates=True
                        ).execute()
                        stats["added"] += 1
                        existing_ids.add(entry_id)
                        existing_content_hashes.add(content_hash)
                    except Exception as e:
                        stats["error"] += 1
                        print(f"  DB ERROR: {e}")
                else:
                    stats["added"] += 1
                    existing_ids.add(entry_id)
                    existing_content_hashes.add(content_hash)

        except Exception as e:
            stats["error"] += 1
            print(f"  FEED ERROR [{feed_config['query_source']}]: {e}")

        time.sleep(0.5)  # polite delay

    # Summary
    print(f"\n{'='*55}")
    print(f"Summary:")
    for k, v in stats.items():
        print(f"  {k:<15}: {v}")
    print(f"{'='*55}")


if __name__ == "__main__":
    fetch_and_save()