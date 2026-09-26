import os
import json
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, date

GROQ_API_KEY = os.environ["GROQ_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# RSS feeds — direct XML, no JS needed
SOURCES = [
    {
        "type": "GST",
        "url": "https://www.gst.gov.in/newsandupdates/rss",
        "name": "GST Portal",
        "mode": "rss"
    },
    {
        "type": "Income Tax",
        "url": "https://www.incometax.gov.in/iec/foportal/rss-feed/news-media-feed",
        "name": "Income Tax Portal",
        "mode": "rss"
    },
    {
        "type": "MCA/ROC",
        "url": "https://www.mca.gov.in/bin/ebook/dms/getdocument?doc=MjgzMjc=&docCategory=Notifications&type=open",
        "name": "MCA Portal",
        "mode": "html"
    },
    {
        "type": "EPFO/PF",
        "url": "https://www.epfindia.gov.in/site_en/Notifications.php",
        "name": "EPFO Portal",
        "mode": "html"
    },
    {
        "type": "CBIC/GST Circulars",
        "url": "https://taxguru.in/feed/?cat=goods-and-service-tax",
        "name": "TaxGuru GST",
        "mode": "rss"
    },
    {
        "type": "Income Tax Circulars",
        "url": "https://taxguru.in/feed/?cat=income-tax",
        "name": "TaxGuru Income Tax",
        "mode": "rss"
    },
    {
        "type": "MCA Circulars",
        "url": "https://taxguru.in/feed/?cat=company-law",
        "name": "TaxGuru MCA",
        "mode": "rss"
    },
    {
        "type": "EPFO/PF Updates",
        "url": "https://taxguru.in/feed/?cat=employees-provident-fund",
        "name": "TaxGuru EPFO",
        "mode": "rss"
    },
]

def fetch_rss(url: str) -> str:
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; ComplianceBot/1.0)"}
        r = httpx.get(url, timeout=20, follow_redirects=True, 
                      headers=headers, verify=False)
        
        # Parse RSS XML
        root = ET.fromstring(r.text)
        items = []
        
        for item in root.iter("item"):
            title = item.findtext("title", "").strip()
            desc = item.findtext("description", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            link = item.findtext("link", "").strip()
            
            if title:
                items.append(f"TITLE: {title}\nDATE: {pub_date}\nSUMMARY: {desc[:300]}")
        
        if not items:
            return "No items found in RSS feed"
            
        # Return last 10 items
        return "\n\n---\n\n".join(items[:10])
        
    except ET.ParseError:
        # Not XML — return raw text
        try:
            return r.text[:5000]
        except:
            return "Parse error"
    except Exception as e:
        return f"Error: {e}"

def fetch_html(url: str) -> str:
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; ComplianceBot/1.0)"}
        r = httpx.get(url, timeout=25, follow_redirects=True,
                      headers=headers, verify=False)
        return r.text[:5000]
    except Exception as e:
        return f"Error: {e}"

def ask_groq(content: str, compliance_type: str) -> list:
    if content.startswith("Error") or content == "No items found in RSS feed":
        print(f"  SKIP: {content[:80]}")
        return []

    prompt = f"""You are a compliance expert for Indian CA firms.

Below are recent updates from {compliance_type} regulatory portal.
Extract updates that are relevant to Indian businesses — new circulars, 
deadline changes, rate changes, new forms, compliance requirements.

Return ONLY a valid JSON array (no markdown):
[{{"title":"short title","summary":"2-3 line plain English summary relevant to businesses","effective_from":"YYYY-MM-DD or null","important":true}}]

If nothing relevant, return: []

Recent updates:
{content[:3500]}"""

    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "openai/gpt-oss-20b",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 1000
            },
            timeout=30
        )

        data = response.json()

        if "choices" not in data:
            print(f"  Groq error: {data.get('error', {}).get('message', str(data))[:100]}")
            return []

        text = data["choices"][0]["message"]["content"].strip()

        if "```" in text:
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else parts[0]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        result = json.loads(text)
        return result if isinstance(result, list) else []

    except json.JSONDecodeError:
        print(f"  JSON parse error")
        return []
    except Exception as e:
        print(f"  Exception: {e}")
        return []

def save_to_supabase(updates: list, compliance_type: str, source: str):
    if not updates:
        return
    rows = []
    for u in updates:
        rows.append({
            "compliance_type": compliance_type,
            "update_text": f"{u.get('title','')}: {u.get('summary','')}",
            "effective_from": u.get("effective_from") or None,
            "source": source,
            "created_at": datetime.utcnow().isoformat()
        })
    try:
        r = httpx.post(
            f"{SUPABASE_URL}/rest/v1/compliance_updates",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            json=rows,
            timeout=15
        )
        print(f"  Supabase: {r.status_code} — {len(rows)} rows saved")
    except Exception as e:
        print(f"  Supabase error: {e}")

def main():
    print(f"Starting compliance check — {date.today()}")
    total = 0

    for source in SOURCES:
        print(f"\nChecking {source['type']}...")
        
        if source["mode"] == "rss":
            content = fetch_rss(source["url"])
        else:
            content = fetch_html(source["url"])
        
        updates = ask_groq(content, source["type"])
        print(f"  Found: {len(updates)} updates")
        
        if updates:
            save_to_supabase(updates, source["type"], source["name"])
            total += len(updates)

    print(f"\n✅ Done! Total updates saved: {total}")

if __name__ == "__main__":
    main()
