
import os
import sys

try:
    from dotenv import load_dotenv
except ImportError:
    print("Error: python-dotenv is not installed.")
    print("Please run: pip install python-dotenv")
    sys.exit(1)

import razorpay

# Force load .env from the same directory as this script
env_path = os.path.join(os.path.dirname(__file__), '.env')
print(f"Loading .env from: {env_path}")
load_dotenv(env_path)

key_id = os.getenv("RAZORPAY_KEY_ID")
key_secret = os.getenv("RAZORPAY_KEY_SECRET")

print(f"Key ID loaded: {key_id}")

try:
    if not key_id or not key_secret:
        print("ERROR: Keys are missing!")
        exit(1)

    client = razorpay.Client(auth=(key_id, key_secret))

    data = {
        "amount": 100, # 1 rupee
        "currency": "INR",
        "receipt": "test_receipt_1",
        "notes": {"purpose": "test_connection"}
    }
    
    print("Attempting to create order...")
    order = client.order.create(data=data)
    print("SUCCESS! Order created:")
    print(order)

except Exception as e:
    print("FAILURE!")
    print(e)
