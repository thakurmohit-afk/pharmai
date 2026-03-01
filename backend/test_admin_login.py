
import requests
import json

base_url = "http://127.0.0.1:8000"
login_url = f"{base_url}/api/auth/login"
payload = {
    "email": "admin@demo.com",
    "password": "Demo@1234"
}
headers = {"Content-Type": "application/json"}

session = requests.Session()

try:
    print(f"Logging in as ADMIN to {login_url}...")
    response = session.post(login_url, json=payload, headers=headers)
    print(f"Login Status: {response.status_code}")
    
    if response.status_code == 200:
        me_url = f"{base_url}/api/auth/me"
        print(f"Requesting {me_url}...")
        me_resp = session.get(me_url)
        print(f"Me Status: {me_resp.status_code}")
        
        # Admin might load stats
        # Check for stats endpoint?
        # I'll just check threads for now
        threads_url = f"{base_url}/api/chat/threads"
        print(f"Requesting {threads_url}...")
        threads_resp = session.get(threads_url)
        print(f"Threads Status: {threads_resp.status_code}")
    else:
        print("Login failed")
        print(response.text)

except Exception as e:
    print(f"Request failed: {e}")
