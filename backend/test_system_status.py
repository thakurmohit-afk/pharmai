
import requests
import json

base_url = "http://127.0.0.1:8000"
login_url = f"{base_url}/api/auth/login"
payload = {
    "email": "aarav@demo.com",
    "password": "Demo@1234"
}
headers = {"Content-Type": "application/json"}

session = requests.Session()

try:
    print(f"Logging in to {login_url}...")
    response = session.post(login_url, json=payload, headers=headers)
    
    if response.status_code == 200:
        llm_url = f"{base_url}/api/system/llm-status"
        print(f"Requesting {llm_url}...")
        llm_resp = session.get(llm_url)
        print(f"LLM Status: {llm_resp.status_code}")
        if llm_resp.status_code != 200:
            print("LLM Status failed")
            print(llm_resp.text)
            
        cache_url = f"{base_url}/api/system/cache-status"
        print(f"Requesting {cache_url}...")
        cache_resp = session.get(cache_url)
        print(f"Cache Status: {cache_resp.status_code}")
    else:
        print("Login failed")

except Exception as e:
    print(f"Request failed: {e}")
