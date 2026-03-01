"""Live end-to-end order + mock-payment validation for local development.

This script intentionally hits running backend APIs and mutates local dev data.
It validates:
- confirmation progression to request_payment
- payment verification success/idempotence
- invalid signature and wrong-owner access
- inventory decrement exactly once (when sqlite checks are available)
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import os
import sqlite3
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / ".env"


def _configure_console_encoding() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _ensure(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def _load_env() -> None:
    if ENV_PATH.exists():
        load_dotenv(dotenv_path=ENV_PATH, override=True)


def _sqlite_path_from_database_url(database_url: str) -> str | None:
    prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
    for prefix in prefixes:
        if database_url.startswith(prefix):
            raw_path = database_url[len(prefix) :]
            path = Path(raw_path)
            if not path.is_absolute():
                path = (ROOT_DIR / raw_path).resolve()
            return str(path)
    return None


@dataclass
class Scenario:
    name: str
    turns: list[str]
    expect_payment: bool


class ApiClient:
    def __init__(self, base_url: str, email: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.email = email
        self.password = password
        self.user_id = ""

    def login(self) -> None:
        resp = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"email": self.email, "password": self.password},
            timeout=15,
        )
        _ensure(resp.status_code == 200, f"Login failed for {self.email}: {resp.status_code} {resp.text}")
        data = resp.json()
        self.user_id = str((data.get("user") or {}).get("user_id") or "")
        _ensure(bool(self.user_id), f"Login response missing user_id for {self.email}")

    def create_thread(self, title: str) -> str:
        resp = self.session.post(
            f"{self.base_url}/api/chat/threads",
            json={"title": title},
            timeout=15,
        )
        _ensure(resp.status_code == 200, f"Create thread failed: {resp.status_code} {resp.text}")
        return str(resp.json().get("conversation_id") or "")

    def send(self, conversation_id: str, message: str) -> dict[str, Any]:
        resp = self.session.post(
            f"{self.base_url}/api/chat",
            json={"message": message, "conversation_id": conversation_id},
            timeout=30,
        )
        _ensure(resp.status_code == 200, f"Chat failed: {resp.status_code} {resp.text}")
        return resp.json()

    def verify_payment(self, payload: dict[str, str]) -> requests.Response:
        return self.session.post(f"{self.base_url}/api/payment/verify", json=payload, timeout=20)


class SqliteChecks:
    def __init__(self, sqlite_path: str) -> None:
        self.sqlite_path = sqlite_path

    def _fetchone(self, query: str, params: tuple[Any, ...]) -> tuple[Any, ...] | None:
        con = sqlite3.connect(self.sqlite_path)
        try:
            cur = con.cursor()
            return cur.execute(query, params).fetchone()
        finally:
            con.close()

    def inventory_stock(self, medicine_id: str) -> int | None:
        row = self._fetchone(
            "SELECT stock_quantity FROM inventory WHERE medicine_id=?",
            (medicine_id,),
        )
        return int(row[0]) if row else None

    def order_history_count(self, user_id: str, medicine_id: str) -> int:
        row = self._fetchone(
            "SELECT COUNT(*) FROM order_history WHERE user_id=? AND medicine_id=?",
            (user_id, medicine_id),
        )
        return int(row[0]) if row else 0

    def order_status(self, order_id: str) -> tuple[str, str | None]:
        row = self._fetchone(
            "SELECT status, razorpay_payment_id FROM orders WHERE order_id=?",
            (order_id,),
        )
        _ensure(bool(row), f"Order {order_id} not found in DB")
        return str(row[0]), (str(row[1]) if row[1] is not None else None)


def _sign(razorpay_order_id: str, razorpay_payment_id: str, key_secret: str) -> str:
    message = f"{razorpay_order_id}|{razorpay_payment_id}"
    return hmac.new(key_secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def _run_scenario(client: ApiClient, scenario: Scenario, verbose: bool) -> tuple[dict[str, Any] | None, list[str]]:
    thread_id = client.create_thread(f"e2e-{scenario.name}")
    actions: list[str] = []
    last_response: dict[str, Any] | None = None

    for turn in scenario.turns:
        last_response = client.send(thread_id, turn)
        action = str(last_response.get("action") or "chat")
        actions.append(action)
        if verbose:
            msg = str(last_response.get("message", "")).replace("\n", " ")
            print(f"  turn='{turn}' -> action={action} trace={last_response.get('trace_id')} msg={msg[:140]}")
        if action == "request_payment":
            break

    if scenario.expect_payment:
        _ensure(last_response is not None, f"{scenario.name}: no response received")
        _ensure(
            str(last_response.get("action")) == "request_payment",
            f"{scenario.name}: expected request_payment, got actions={actions}",
        )
        _ensure(bool(last_response.get("payment")), f"{scenario.name}: missing payment payload")
    else:
        _ensure(
            "request_payment" not in actions,
            f"{scenario.name}: expected cancel/no-payment path, got actions={actions}",
        )

    return last_response, actions


def _verify_payment_flow(
    owner: ApiClient,
    other: ApiClient,
    payment_payload: dict[str, Any],
    key_secret: str,
    sqlite_checks: SqliteChecks | None,
    *,
    include_owner_checks: bool,
) -> None:
    order_id = str(payment_payload.get("order_id") or "")
    razorpay_order_id = str(payment_payload.get("razorpay_order_id") or "")
    items = payment_payload.get("items") or []
    _ensure(order_id and razorpay_order_id, "Payment payload missing order identifiers")

    medicine_id = ""
    billing_qty = 0
    if items and isinstance(items[0], dict):
        medicine_id = str(items[0].get("medicine_id") or "")
        billing_qty = int(items[0].get("billing_qty") or 0)

    before_stock = None
    before_history = None
    if sqlite_checks and medicine_id:
        before_stock = sqlite_checks.inventory_stock(medicine_id)
        before_history = sqlite_checks.order_history_count(owner.user_id, medicine_id)

    fake_payment_id = f"pay_e2e_{uuid.uuid4().hex[:10]}"
    valid_signature = _sign(razorpay_order_id, fake_payment_id, key_secret)
    valid_payload = {
        "razorpay_order_id": razorpay_order_id,
        "razorpay_payment_id": fake_payment_id,
        "razorpay_signature": valid_signature,
    }

    if include_owner_checks:
        other_resp = other.verify_payment(valid_payload)
        _ensure(
            other_resp.status_code == 403,
            f"Wrong-owner verify expected 403, got {other_resp.status_code}: {other_resp.text}",
        )

        invalid_payload = dict(valid_payload)
        invalid_payload["razorpay_signature"] = "invalid_signature"
        invalid_resp = owner.verify_payment(invalid_payload)
        _ensure(
            invalid_resp.status_code == 400,
            f"Invalid-signature verify expected 400, got {invalid_resp.status_code}: {invalid_resp.text}",
        )

    first = owner.verify_payment(valid_payload)
    _ensure(first.status_code == 200, f"First verify failed: {first.status_code} {first.text}")
    first_body = first.json()
    _ensure(first_body.get("status") == "success", f"First verify expected success, got: {first_body}")

    second = owner.verify_payment(valid_payload)
    _ensure(second.status_code == 200, f"Second verify failed: {second.status_code} {second.text}")
    second_body = second.json()
    _ensure(
        second_body.get("status") == "already_confirmed",
        f"Second verify expected already_confirmed, got: {second_body}",
    )

    if sqlite_checks:
        status, payment_id = sqlite_checks.order_status(order_id)
        _ensure(status == "confirmed", f"Order {order_id} expected confirmed, got {status}")
        _ensure(payment_id == fake_payment_id, f"Order {order_id} payment id mismatch")

        if medicine_id and billing_qty > 0 and before_stock is not None and before_history is not None:
            after_stock = sqlite_checks.inventory_stock(medicine_id)
            after_history = sqlite_checks.order_history_count(owner.user_id, medicine_id)
            _ensure(after_stock is not None, "Missing inventory row after verify")
            _ensure(
                before_stock - int(after_stock) == billing_qty,
                f"Inventory decrement mismatch: before={before_stock} after={after_stock} expected={billing_qty}",
            )
            _ensure(
                after_history - before_history == 1,
                f"Order history should increment once, before={before_history} after={after_history}",
            )


def main() -> None:
    _configure_console_encoding()
    _load_env()
    parser = argparse.ArgumentParser(description="Live dev E2E check for order confirmation and payment flow.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--owner-email", default="aarav@demo.com")
    parser.add_argument("--owner-password", default="Demo@1234")
    parser.add_argument("--other-email", default="priya@demo.com")
    parser.add_argument("--other-password", default="Demo@1234")
    parser.add_argument("--razorpay-secret", default=os.getenv("RAZORPAY_KEY_SECRET", ""))
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./pharmacy.db"))
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    _ensure(bool(args.razorpay_secret), "RAZORPAY_KEY_SECRET is required for payment signature checks.")

    sqlite_checks: SqliteChecks | None = None
    sqlite_path = _sqlite_path_from_database_url(args.database_url)
    if sqlite_path and Path(sqlite_path).exists():
        sqlite_checks = SqliteChecks(sqlite_path)
    else:
        print("DB assertions: skipped (non-sqlite DATABASE_URL or DB file missing).")

    owner = ApiClient(args.base_url, args.owner_email, args.owner_password)
    other = ApiClient(args.base_url, args.other_email, args.other_password)
    owner.login()
    other.login()

    scenarios = [
        Scenario("direct-order", ["order 2 strips of crocin", "yes"], expect_payment=True),
        Scenario("two-step", ["i want crocin", "3 strips", "yes"], expect_payment=True),
        Scenario("colloquial-yessir", ["need dolo 650", "5 strips", "yessir"], expect_payment=True),
        Scenario("colloquial-obv-yes", ["i want some crocin", "3 strips", "obv yes"], expect_payment=True),
        Scenario("unclear-then-confirm", ["i want crocin", "3 strips", "hmm", "yes proceed"], expect_payment=True),
        Scenario("cancel", ["i want crocin", "3 strips", "nah leave it"], expect_payment=False),
    ]

    payment_checks_done = 0
    for scenario in scenarios:
        print(f"\n[SCENARIO] {scenario.name}")
        last, actions = _run_scenario(owner, scenario, verbose=args.verbose)
        print(f"  actions={actions}")
        if scenario.expect_payment:
            _ensure(last is not None, f"{scenario.name}: missing response")
            payment_payload = last.get("payment") or {}
            _verify_payment_flow(
                owner,
                other,
                payment_payload,
                args.razorpay_secret,
                sqlite_checks,
                include_owner_checks=(payment_checks_done == 0),
            )
            payment_checks_done += 1
            print("  payment verify checks: PASS")

    print("\nE2E validation completed: PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"\nE2E validation failed: {err}")
        sys.exit(1)
