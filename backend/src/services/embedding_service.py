"""Embedding generation with Redis cache."""

from __future__ import annotations

import httpx

from src.config import settings
from src.services.cache_service import CacheService


class EmbeddingService:
    MODEL = "text-embedding-3-small"
    CACHE_NS = "embed"
    TTL = 60 * 60 * 24 * 7  # 7 days

    @classmethod
    async def embed_text(cls, text: str) -> list[float]:
        key = CacheService.hash_key(f"{cls.MODEL}:{text}")
        cached = CacheService.get_json(cls.CACHE_NS, key)
        if cached and isinstance(cached, list):
            return cached

        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY required for embeddings")

        base = (settings.openai_base_url or "https://api.openai.com/v1").rstrip("/")
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{base}/embeddings",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": cls.MODEL, "input": text[:8000]},
            )
            r.raise_for_status()
            vector = r.json()["data"][0]["embedding"]

        CacheService.set_json(cls.CACHE_NS, key, vector, cls.TTL)
        return vector

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = sum(x * x for x in a) ** 0.5
        nb = sum(x * x for x in b) ** 0.5
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)
