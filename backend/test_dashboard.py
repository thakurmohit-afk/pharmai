
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
    print(f"Login Status: {response.status_code}")
    
    if response.status_code == 200:
        dash_url = f"{base_url}/api/user/me/dashboard"
        print(f"Requesting {dash_url}...")
        dash_resp = session.get(dash_url)
        print(f"Dashboard Status: {dash_resp.status_code}")
        if dash_resp.status_code != 200:
            print("Dashboard failed")
            print(dash_resp.text)
        else:
            print("Dashboard loaded.")
            # print(json.dumps(dash_resp.json(), indent=2))
            
    else:
        print("Login failed")
        print(response.text)

except Exception as e:
    print(f"Request failed: {e}")
