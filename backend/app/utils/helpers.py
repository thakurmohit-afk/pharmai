"""Shared helpers and utilities."""

import uuid
from datetime import datetime, timezone


def utc_now() -> datetime:
    """Timezone-aware UTC now."""
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    """Generate a UUID4 string."""
    return str(uuid.uuid4())
