import httpx
from app.config import settings

groq_key = settings.GROQ_API_KEY.strip('"').strip("'")
print(f"GROQ_API_KEY length: {len(groq_key)}")

response = httpx.post(
    "https://api.groq.com/openai/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json",
    },
    json={
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": "Respond with strictly: OK"}],
        "max_tokens": 50,
    },
    timeout=15.0,
)
print("STATUS CODE:", response.status_code)
if response.status_code == 200:
    print("RESPONSE:", response.json()["choices"][0]["message"]["content"])
else:
    print("ERROR:", response.text)
