"""Redis caching layer — responses, embeddings, orchestration state."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from src.config import settings

_redis = None


def _client():
    global _redis
    if _redis is not None:
        return _redis if _redis is not False else None
    try:
        import redis

        c = redis.from_url(settings.redis_url, decode_responses=True)
        c.ping()
        _redis = c
        return c
    except Exception:
        _redis = False
        return None


class CacheService:
  PREFIX = "ma:cache:"

  @classmethod
  def _key(cls, namespace: str, key: str) -> str:
      return f"{cls.PREFIX}{namespace}:{key}"

  @classmethod
  def get_json(cls, namespace: str, key: str) -> Any | None:
      r = _client()
      if not r:
          return None
      raw = r.get(cls._key(namespace, key))
      return json.loads(raw) if raw else None

  @classmethod
  def set_json(cls, namespace: str, key: str, value: Any, ttl_seconds: int = 3600) -> None:
      r = _client()
      if not r:
          return
      r.setex(cls._key(namespace, key), ttl_seconds, json.dumps(value, ensure_ascii=False))

  @classmethod
  def delete(cls, namespace: str, key: str) -> None:
      r = _client()
      if r:
          r.delete(cls._key(namespace, key))

  @classmethod
  def hash_key(cls, text: str) -> str:
      return hashlib.sha256(text.encode()).hexdigest()
