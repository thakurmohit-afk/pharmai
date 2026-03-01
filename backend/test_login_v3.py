
import requests
import json

base_url = "http://127.0.0.1:8000"
login_url = f"{base_url}/api/auth/login"
payload = {
    "email": "aarav@demo.com",
    "password": "Demo@1234"
}
headers = {"Content-Type": "application/json"}

try:
    print(f"Logging in to {login_url}...")
    response = requests.post(login_url, json=payload, headers=headers)
    print(f"Login Status: {response.status_code}")
    
    data = response.json()
    print("Login Response Keys:", list(data.keys()))
    
    if "access_token" in data:
        token = data["access_token"]
        print(f"Token received (len={len(token)})")
        
        # Test /api/users/me
        me_url = f"{base_url}/api/users/me"
        auth_headers = {"Authorization": f"Bearer {token}"}
        print(f"Requesting {me_url}...")
        me_resp = requests.get(me_url, headers=auth_headers)
        print(f"Me Status: {me_resp.status_code}")
        print("Me Response:", me_resp.text)
    else:
        print("No access_token found in response!")
        print(json.dumps(data, indent=2))

except Exception as e:
    print(f"Request failed: {e}")
