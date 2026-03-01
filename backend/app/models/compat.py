"""Cross-database type compatibility.

SQLite doesn't support JSONB or PostgreSQL UUID. This module provides
type aliases that work across both SQLite and PostgreSQL.
"""

from sqlalchemy import JSON, String, TypeDecorator
import uuid


class CompatUUID(TypeDecorator):
    """UUID type that stores as String(36) on SQLite and native UUID on PostgreSQL."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return uuid.UUID(value) if not isinstance(value, uuid.UUID) else value
        return value


# Export compatible types
DBJSON = JSON      # Works on both SQLite and PostgreSQL
DBUUID = CompatUUID  # Stores as string on SQLite
