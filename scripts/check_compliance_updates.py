import os
import json
import httpx
from datetime import datetime, date

GROQ_API_KEY = os.environ["GROQ_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

SOURCES = [
    {
        "type": "GST",
        "url": "https://www.gst.gov.in/newsandupdates",
        "name": "GST Portal"
    },
    {
        "type": "Income Tax",
        "url": "https://www.incometax.gov.in/iec/foportal/news-media",
        "name": "Income Tax Portal"
    },
    {
        "type": "MCA/ROC",
        "url": "https://www.mca.gov.in/content/mca/global/en/notifications.html",
        "name": "MCA Portal"
    },
    {
        "type": "EPFO/PF",
        "url": "https://www.epfindia.gov.in/site_en/Notifications.php",
        "name": "EPFO Portal"
    },
    {
        "type": "ESIC",
        "url": "https://www.esic.gov.in/notifications",
        "name": "ESIC Portal"
    },
    {
        "type": "CBIC/Customs",
        "url": "https://www.cbic.gov.in/htdocs-cbec/whats-new",
        "name": "CBIC Portal"
    },
]

def fetch_page(url: str) -> str:
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; ComplianceBot/1.0)"}
        r = httpx.get(url, timeout=20, follow_redirects=True, headers=headers)
        # Return first 8000 chars — enough for AI to read
        return r.text[:8000]
    except Exception as e:
        return f"Error fetching {url}: {e}"

def ask_groq(content: str, compliance_type: str) -> dict:
    prompt = f"""You are a compliance expert for Indian businesses. 
Analyze this webpage content from the {compliance_type} portal.

Extract any NEW updates, circulars, notifications, or deadline changes 
that would be relevant to a CA firm's clients in India.

Return ONLY a JSON array (no markdown, no explanation) in this format:
[
  {{
    "title": "Short title of the update",
    "summary": "2-3 line plain English summary",
    "effective_from": "YYYY-MM-DD or null if unknown",
    "important": true/false
  }}
]

If no significant updates found, return empty array: []

Webpage content:
{content[:4000]}"""

    response = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 1000
        },
        timeout=30
    )
    
    text = response.json()["choices"][0]["message"]["content"]
    
    # Clean JSON
    text = text.strip()
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    
    try:
        return json.loads(text)
    except:
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
    
    response = httpx.post(
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
    
    print(f"  Saved {len(rows)} updates for {compliance_type}: {response.status_code}")

def main():
    print(f"Starting compliance check — {date.today()}")
    total_updates = 0
    
    for source in SOURCES:
        print(f"\nChecking {source['type']}...")
        content = fetch_page(source["url"])
        
        if content.startswith("Error"):
            print(f"  SKIP: {content}")
            continue
        
        updates = ask_groq(content, source["type"])
        print(f"  Found {len(updates)} updates")
        
        if updates:
            save_to_supabase(updates, source["type"], source["name"])
            total_updates += len(updates)
    
    print(f"\nDone! Total updates saved: {total_updates}")

if __name__ == "__main__":
    main()
