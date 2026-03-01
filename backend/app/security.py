"""Authentication and token utilities."""

from datetime import datetime, timedelta, timezone
import hashlib
import uuid

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

ACCESS_COOKIE_NAME = "pharm_access_token"
REFRESH_COOKIE_NAME = "pharm_refresh_token"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc_datetime(value: datetime | None) -> datetime | None:
    """Normalize naive/aware datetimes to UTC-aware datetimes."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode_token(payload: dict, expires_delta: timedelta) -> str:
    settings = get_settings()
    data = payload.copy()
    data["exp"] = now_utc() + expires_delta
    return jwt.encode(data, settings.secret_key, algorithm="HS256")


def create_access_token(user_id: str, role: str, session_id: str) -> str:
    settings = get_settings()
    return _encode_token(
        {"sub": user_id, "role": role, "sid": session_id, "typ": "access"},
        timedelta(minutes=settings.access_token_ttl_min),
    )


def create_refresh_token(user_id: str, role: str, session_id: str) -> str:
    settings = get_settings()
    return _encode_token(
        {"sub": user_id, "role": role, "sid": session_id, "typ": "refresh"},
        timedelta(days=settings.refresh_token_ttl_days),
    )


def create_voice_token(user_id: str, session_id: str | None = None) -> str:
    settings = get_settings()
    sid = session_id or str(uuid.uuid4())
    return _encode_token(
        {"sub": user_id, "sid": sid, "typ": "voice"},
        timedelta(seconds=settings.voice_token_ttl_sec),
    )


def decode_token(token: str, expected_type: str | None = None) -> dict | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError:
        return None
    token_type = payload.get("typ")
    if expected_type and token_type != expected_type:
        return None
    return payload


def decode_voice_token(token: str) -> dict | None:
    return decode_token(token, expected_type="voice")


def cookie_settings() -> dict:
    settings = get_settings()
    kwargs = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite_value,
    }
    if settings.cookie_domain:
        kwargs["domain"] = settings.cookie_domain
    return kwargs
