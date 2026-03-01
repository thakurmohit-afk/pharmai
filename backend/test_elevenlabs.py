import requests

payload = {
    "model": "gpt-4o",
    "messages": [
        {"role": "user", "content": "I am feeling a little cold. What should I do?"}
    ],
    "dynamic_variables": {
        "auth_token": "dummy_token"
    }
}
r = requests.post("http://localhost:8000/v1/chat/completions", json=payload, stream=True)
print("Status Code:", r.status_code)
for line in r.iter_lines():
    if line:
        print(line.decode("utf-8"))
