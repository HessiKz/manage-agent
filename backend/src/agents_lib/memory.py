"""Conversation memory — Redis-backed with in-memory fallback."""

from __future__ import annotations

import json
from typing import Any

from src.config import settings

_redis_client = None
_MAX_MESSAGES = 40


class _InMemoryFallback:
    _store: dict[str, list[dict[str, Any]]] = {}

    @classmethod
    def append(cls, thread_id: str, message: dict) -> None:
        cls._store.setdefault(thread_id, []).append(message)

    @classmethod
    def history(cls, thread_id: str) -> list[dict]:
        return cls._store.get(thread_id, [])

    @classmethod
    def clear(cls, thread_id: str) -> None:
        cls._store.pop(thread_id, None)


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client if _redis_client is not False else None
    try:
        import redis

        client = redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        _redis_client = client
        return client
    except Exception:
        _redis_client = False
        return None


class ConversationMemory:
    """Thread-scoped chat history. Uses Redis when available."""

    @classmethod
    def _key(cls, thread_id: str) -> str:
        return f"chat:{thread_id}"

    @classmethod
    def append(cls, thread_id: str, message: dict[str, Any]) -> None:
        r = _get_redis()
        if r:
            key = cls._key(thread_id)
            r.rpush(key, json.dumps(message, ensure_ascii=False))
            r.ltrim(key, -_MAX_MESSAGES, -1)
            r.expire(key, 60 * 60 * 24 * 7)
            return
        _InMemoryFallback.append(thread_id, message)

    @classmethod
    def history(cls, thread_id: str) -> list[dict[str, Any]]:
        r = _get_redis()
        if r:
            raw = r.lrange(cls._key(thread_id), 0, -1)
            return [json.loads(x) for x in raw]
        return _InMemoryFallback.history(thread_id)

    @classmethod
    def clear(cls, thread_id: str) -> None:
        r = _get_redis()
        if r:
            r.delete(cls._key(thread_id))
        _InMemoryFallback.clear(thread_id)


# Backward-compatible alias used by invoke_service
InMemoryStore = ConversationMemory
