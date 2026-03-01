import requests
import json

base_url = "http://127.0.0.1:8000"
login_url = f"{base_url}/api/auth/dev-login"

payload = {"email": "aarav@demo.com"}
headers = {"Content-Type": "application/json"}

try:
    print(f"Testing {login_url}...")
    response = requests.post(login_url, json=payload, headers=headers)
    print(f"Status: {response.status_code}")
    print("Response:", response.text)
except Exception as e:
    print(f"Request failed: {e}")
