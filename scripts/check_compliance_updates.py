import os
import json
import httpx
import time
import xml.etree.ElementTree as ET
from datetime import datetime, date

GROQ_API_KEY = os.environ["GROQ_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

SOURCES = [
    {"type": "GST", "url": "https://taxguru.in/feed/?cat=goods-and-service-tax", "name": "TaxGuru GST"},
    {"type": "Income Tax", "url": "https://taxguru.in/feed/?cat=income-tax", "name": "TaxGuru IT"},
    {"type": "MCA/ROC", "url": "https://taxguru.in/feed/?cat=company-law", "name": "TaxGuru MCA"},
    {"type": "Tax Audit", "url": "https://taxguru.in/feed/?cat=income-tax", "name": "TaxGuru Tax Audit"},
    {"type": "TDS", "url": "https://taxguru.in/feed/?cat=tds", "name": "TaxGuru TDS"},
]

# Keywords jo due date changes indicate karte hain
DUE_DATE_KEYWORDS = [
    "extended", "extension", "due date", "last date", "deadline",
    "postponed", "relaxation", "relief", "time limit", "section 44AB",
    "tax audit", "ITR", "GSTR", "TDS", "ROC", "annual return",
    "Form 3CA", "Form 3CB", "Form 3CD", "October", "November",
    "31st", "30th", "15th", "due date extended"
]

def fetch_rss(url: str) -> str:
    try:
        r = httpx.get(url, timeout=20, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0"}, verify=False)
        root = ET.fromstring(r.text)
        items = []
        for item in root.iter("item"):
            title = item.findtext("title", "").strip()
            desc = item.findtext("description", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            
            # Sirf relevant items rakho
            combined = (title + " " + desc).lower()
            if any(kw.lower() in combined for kw in DUE_DATE_KEYWORDS):
                items.append(f"TITLE: {title}\nDATE: {pub_date}\nDETAILS: {desc[:200]}")
        
        return "\n\n---\n\n".join(items[:6]) if items else "No relevant updates"
    except Exception as e:
        return f"Error: {e}"

def ask_groq(content: str, compliance_type: str) -> list:
    if content in ["No relevant updates"] or content.startswith("Error"):
        print(f"  SKIP: {content[:60]}")
        return []

    today = date.today().strftime("%d %B %Y")
    
    prompt = f"""You are an Indian CA compliance expert. Today is {today}.

These are recent {compliance_type} news articles. 
FOCUS ONLY on:
- Due date extensions or changes
- Deadline postponements  
- New compliance deadlines
- Rate changes
- Important circulars affecting filing dates

Return ONLY this JSON array, nothing else:
[{{"title":"short title","summary":"exact new due date and what changed in one line","effective_from":"YYYY-MM-DD or null","compliance_type":"{compliance_type}","important":true}}]

If no due date changes found, return exactly: []

Articles:
{content}"""

    try:
        time.sleep(4)
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 600
            },
            timeout=30
        )
        data = response.json()
        if "choices" not in data:
            print(f"  Groq error: {str(data)[:100]}")
            return []

        text = data["choices"][0]["message"]["content"].strip()
        start = text.find("[")
        end = text.rfind("]") + 1
        if start == -1 or end == 0:
            return []
        return json.loads(text[start:end])

    except Exception as e:
        print(f"  Exception: {e}")
        return []

def save_to_supabase(updates: list, compliance_type: str, source: str):
    if not updates:
        return
    rows = [{"compliance_type": compliance_type,
             "update_text": f"{u.get('title','')}: {u.get('summary','')}",
             "effective_from": u.get("effective_from") or None,
             "source": source,
             "created_at": datetime.utcnow().isoformat()} for u in updates]
    try:
        r = httpx.post(
            f"{SUPABASE_URL}/rest/v1/compliance_updates",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                     "Content-Type": "application/json", "Prefer": "return=minimal"},
            json=rows, timeout=15)
        print(f"  Saved {len(rows)} rows → {r.status_code}")
    except Exception as e:
        print(f"  Supabase error: {e}")

def main():
    print(f"Compliance check — {date.today()}")
    total = 0
    for source in SOURCES:
        print(f"\nChecking {source['type']}...")
        content = fetch_rss(source["url"])
        updates = ask_groq(content, source["type"])
        print(f"  Found: {len(updates)}")
        if updates:
            for u in updates:
                print(f"  → {u.get('title','')[:60]}")
            save_to_supabase(updates, source["type"], source["name"])
            total += len(updates)
    print(f"\n✅ Done! Total: {total}")

if __name__ == "__main__":
    main()
