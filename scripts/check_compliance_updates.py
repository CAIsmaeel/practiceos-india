import os
import json
import httpx
import time
import xml.etree.ElementTree as ET
from datetime import datetime, date

GROQ_API_KEY = os.environ["GROQ_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# Sirf TaxGuru RSS — reliable aur fast
SOURCES = [
    {"type": "GST", "url": "https://taxguru.in/feed/?cat=goods-and-service-tax", "name": "TaxGuru GST"},
    {"type": "Income Tax", "url": "https://taxguru.in/feed/?cat=income-tax", "name": "TaxGuru IT"},
    {"type": "MCA/ROC", "url": "https://taxguru.in/feed/?cat=company-law", "name": "TaxGuru MCA"},
]

def fetch_rss(url: str) -> str:
    try:
        r = httpx.get(url, timeout=20, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0"}, verify=False)
        root = ET.fromstring(r.text)
        items = []
        for item in root.iter("item"):
            title = item.findtext("title", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            if title:
                items.append(f"- {title} ({pub_date})")
        return "\n".join(items[:8]) if items else "No items"
    except Exception as e:
        return f"Error: {e}"

def ask_groq(content: str, compliance_type: str) -> list:
    if content.startswith("Error") or content == "No items":
        print(f"  SKIP: {content[:60]}")
        return []

    prompt = f"""Indian CA compliance expert. These are recent {compliance_type} updates.
Pick the 2-3 most important ones for businesses.

Return ONLY this exact JSON array format with no other text:
[{{"title":"short title","summary":"one line summary","effective_from":null,"important":true}}]

If nothing important, return exactly: []

Updates:
{content}"""

    try:
        time.sleep(3)  # Rate limit avoid
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 500
            },
            timeout=30
        )
        data = response.json()
        if "choices" not in data:
            print(f"  Groq error: {str(data)[:100]}")
            return []

        text = data["choices"][0]["message"]["content"].strip()
        # Extract JSON from response
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
            save_to_supabase(updates, source["type"], source["name"])
            total += len(updates)
    print(f"\n✅ Done! Total: {total}")

if __name__ == "__main__":
    main()
