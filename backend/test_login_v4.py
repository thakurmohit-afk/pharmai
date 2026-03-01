
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
        # Test /api/chat/threads
        threads_url = f"{base_url}/api/chat/threads"
        print(f"Requesting {threads_url}...")
        threads_resp = session.get(threads_url)
        print(f"Threads Status: {threads_resp.status_code}")
        
        if threads_resp.status_code == 200:
            threads = threads_resp.json()
            print(f"Found {len(threads)} threads.")
            if threads:
                first_id = threads[0]["conversation_id"]
                msgs_url = f"{base_url}/api/chat/threads/{first_id}/messages"
                print(f"Requesting {msgs_url}...")
                msgs_resp = session.get(msgs_url)
                print(f"Messages Status: {msgs_resp.status_code}")
                # print("Messages Response:", msgs_resp.text)
        else:
            print("Threads failed")
            print(threads_resp.text)

    else:
        print("Login failed")
        print(response.text)

except Exception as e:
    print(f"Request failed: {e}")
