"""Redis client with resilient in-memory fallback.

Behavior in this phase:
- Prefer Redis when available.
- Fall back to in-memory cache on Redis errors.
- Persist fallback cache to disk only when DEV_CACHE_PERSIST=true.
- Namespace all keys with CACHE_NAMESPACE to avoid stale collisions.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import redis.asyncio as redis

from app.config import get_settings

logger = logging.getLogger("pharmacy.redis")


class RedisClientWrapper:
    """Small async cache wrapper with Redis-primary and memory fallback."""

    def __init__(self) -> None:
        self._client: redis.Redis | None = None
        self._backend: str = "memory"
        self._fallback_cache: dict[str, dict[str, Any]] = {}
        self._persist_enabled: bool = False
        self._persist_path: Path = Path(__file__).resolve().parents[1] / "dev_cache.json"
        self._namespace: str = "v1"
        self._initialized: bool = False

    async def initialize(self) -> dict[str, Any]:
        """Initialize cache backend and return backend status."""
        settings = get_settings(force_refresh=True)
        self._namespace = settings.cache_namespace.strip() or "v1"
        self._persist_enabled = bool(settings.dev_cache_persist)

        if self._persist_enabled:
            self._load_persisted_fallback()
        else:
            self._fallback_cache = {}

        if self._client is not None:
            await self._close_client()

        try:
            client = redis.from_url(settings.redis_url, decode_responses=True)
            await client.ping()
            self._client = client
            self._backend = "redis"
            logger.info("Cache backend: redis (%s)", settings.redis_url)
        except Exception as err:
            self._client = None
            self._backend = "memory"
            logger.warning("Redis unavailable; using in-memory cache fallback: %s", err)

        self._initialized = True
        return self.status()

    async def close(self) -> None:
        """Close Redis client and flush fallback cache if persistence enabled."""
        await self._close_client()
        if self._persist_enabled:
            self._save_persisted_fallback()

    async def get(self, key: str) -> Any:
        await self._ensure_initialized()
        namespaced_key = self._ns(key)
        if self._client is not None:
            try:
                return await self._client.get(namespaced_key)
            except Exception as err:
                logger.warning("Redis GET failed; switching to memory fallback: %s", err)
                await self._switch_to_memory()
        return self._memory_get(namespaced_key)

    async def set(self, key: str, value: Any, ex: int | None = None) -> bool:
        await self._ensure_initialized()
        namespaced_key = self._ns(key)
        if self._client is not None:
            try:
                await self._client.set(namespaced_key, value, ex=ex)
                return True
            except Exception as err:
                logger.warning("Redis SET failed; switching to memory fallback: %s", err)
                await self._switch_to_memory()

        self._memory_set(namespaced_key, value, ex)
        return True

    async def delete(self, key: str) -> int:
        await self._ensure_initialized()
        namespaced_key = self._ns(key)
        deleted = 0
        if self._client is not None:
            try:
                deleted = int(await self._client.delete(namespaced_key) or 0)
            except Exception as err:
                logger.warning("Redis DELETE failed; switching to memory fallback: %s", err)
                await self._switch_to_memory()
        if namespaced_key in self._fallback_cache:
            self._fallback_cache.pop(namespaced_key, None)
            deleted = max(deleted, 1)
            self._save_if_persisted()
        return deleted

    async def clear_namespace(self) -> dict[str, Any]:
        """Clear all cache entries for active namespace across active/fallback backends."""
        await self._ensure_initialized()
        prefix = f"{self._namespace}:"
        removed_redis = 0
        removed_memory = 0

        if self._client is not None:
            try:
                cursor = 0
                while True:
                    cursor, keys = await self._client.scan(
                        cursor=cursor,
                        match=f"{prefix}*",
                        count=200,
                    )
                    if keys:
                        removed_redis += int(await self._client.delete(*keys) or 0)
                    if cursor == 0:
                        break
            except Exception as err:
                logger.warning("Redis namespace clear failed; switching to memory fallback: %s", err)
                await self._switch_to_memory()

        for key in list(self._fallback_cache.keys()):
            if key.startswith(prefix):
                self._fallback_cache.pop(key, None)
                removed_memory += 1

        self._save_if_persisted()
        return {
            "status": "cleared",
            "namespace": self._namespace,
            "backend": self._backend,
            "removed_redis": removed_redis,
            "removed_memory": removed_memory,
        }

    def status(self) -> dict[str, Any]:
        self._prune_expired_memory()
        return {
            "backend": self._backend,
            "namespace": self._namespace,
            "persist_enabled": self._persist_enabled,
            "memory_entries": len(self._fallback_cache),
            "redis_connected": bool(self._client is not None and self._backend == "redis"),
        }

    async def _ensure_initialized(self) -> None:
        if not self._initialized:
            await self.initialize()

    async def _switch_to_memory(self) -> None:
        await self._close_client()
        self._backend = "memory"

    async def _close_client(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None

    def _ns(self, key: str) -> str:
        key = str(key or "")
        prefix = f"{self._namespace}:"
        if key.startswith(prefix):
            return key
        return f"{prefix}{key}"

    def _memory_get(self, namespaced_key: str) -> Any:
        self._prune_expired_memory()
        entry = self._fallback_cache.get(namespaced_key)
        if not entry:
            return None
        return entry.get("value")

    def _memory_set(self, namespaced_key: str, value: Any, ex: int | None) -> None:
        expires_at = (time.time() + max(int(ex or 0), 0)) if ex else None
        self._fallback_cache[namespaced_key] = {"value": value, "expires_at": expires_at}
        self._save_if_persisted()

    def _prune_expired_memory(self) -> None:
        now = time.time()
        stale_keys = []
        for key, entry in self._fallback_cache.items():
            expires_at = entry.get("expires_at")
            if expires_at is not None and expires_at <= now:
                stale_keys.append(key)
        for key in stale_keys:
            self._fallback_cache.pop(key, None)
        if stale_keys:
            self._save_if_persisted()

    def _load_persisted_fallback(self) -> None:
        if not self._persist_path.exists():
            self._fallback_cache = {}
            return
        try:
            data = json.loads(self._persist_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                self._fallback_cache = {}
                return

            # Backward-compat with previous flat {key: value} format.
            normalized: dict[str, dict[str, Any]] = {}
            now = time.time()
            for key, value in data.items():
                if isinstance(value, dict) and "value" in value:
                    expires_at = value.get("expires_at")
                    if isinstance(expires_at, (int, float)) and expires_at <= now:
                        continue
                    normalized[str(key)] = {
                        "value": value.get("value"),
                        "expires_at": expires_at if isinstance(expires_at, (int, float)) else None,
                    }
                else:
                    normalized[str(key)] = {"value": value, "expires_at": None}
            self._fallback_cache = normalized
        except Exception as err:
            logger.warning("Unable to read persisted fallback cache: %s", err)
            self._fallback_cache = {}

    def _save_persisted_fallback(self) -> None:
        try:
            self._prune_expired_memory()
            payload = json.dumps(self._fallback_cache, ensure_ascii=True)
            self._persist_path.write_text(payload, encoding="utf-8")
        except Exception as err:
            logger.warning("Unable to persist fallback cache: %s", err)

    def _save_if_persisted(self) -> None:
        if self._persist_enabled:
            self._save_persisted_fallback()


redis_client = RedisClientWrapper()


async def check_redis_and_fallback() -> dict[str, Any]:
    """Initialize cache backend and return cache status."""
    return await redis_client.initialize()


async def close_redis() -> None:
    """Close cache backend resources."""
    await redis_client.close()


def get_cache_status() -> dict[str, Any]:
    """Return active cache backend status."""
    return redis_client.status()


async def clear_runtime_cache() -> dict[str, Any]:
    """Clear current namespace cache entries."""
    return await redis_client.clear_namespace()
