"""LangFuse observability — singleton client + trace helpers.

Gracefully handles missing LangFuse keys (logs warning, returns no-op).
"""

import logging
from functools import wraps

logger = logging.getLogger("pharmacy.langfuse")

try:
    from langfuse import Langfuse
    from langfuse.decorators import observe as _observe
    _has_langfuse = True
except ImportError:
    _has_langfuse = False

from app.config import get_settings

settings = get_settings()

# ── Singleton ────────────────────────────────────────────────────────────
_langfuse = None


def get_langfuse():
    """Return (and lazily create) the global LangFuse client."""
    global _langfuse
    if not _has_langfuse:
        return _NullLangfuse()
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return _NullLangfuse()
    if _langfuse is None:
        try:
            _langfuse = Langfuse(
                public_key=settings.langfuse_public_key,
                secret_key=settings.langfuse_secret_key,
                host=settings.langfuse_host,
            )
        except Exception as e:
            logger.warning(f"LangFuse init failed: {e}")
            return _NullLangfuse()
    return _langfuse


class _NullLangfuse:
    """No-op LangFuse replacement when keys are missing."""
    def trace(self, **kwargs): pass
    def flush(self): pass
    def generation(self, **kwargs): return self
    def end(self, **kwargs): pass


def observe(name: str = ""):
    """Decorator that traces with LangFuse if available, else passes through."""
    def decorator(func):
        if _has_langfuse and settings.langfuse_public_key:
            return _observe(name=name)(func)
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await func(*args, **kwargs)
        return wrapper
    return decorator


def flush_langfuse() -> None:
    """Flush pending events — call on app shutdown."""
    lf = get_langfuse()
    lf.flush()


__all__ = ["get_langfuse", "flush_langfuse", "observe"]
