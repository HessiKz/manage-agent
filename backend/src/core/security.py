"""Security primitives: password hashing + JWT tokens."""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from src.config import settings

# ─── Password hashing ───────────────────────────────────
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return _pwd_context.verify(plain, hashed)


# ─── JWT tokens ─────────────────────────────────────────
ACCESS_TYPE = "access"
REFRESH_TYPE = "refresh"


def _create_token(subject: str | UUID, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(subject: str | UUID) -> tuple[str, int]:
    """Returns (token, expires_in_seconds)."""
    delta = timedelta(minutes=settings.access_token_expire_minutes)
    return _create_token(subject, ACCESS_TYPE, delta), int(delta.total_seconds())


def create_refresh_token(subject: str | UUID) -> str:
    delta = timedelta(days=settings.refresh_token_expire_days)
    return _create_token(subject, REFRESH_TYPE, delta)


def decode_token(token: str) -> dict[str, Any]:
    """Decode + validate a JWT. Raises JWTError on invalid/expired."""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


__all__ = [
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "JWTError",
    "ACCESS_TYPE",
    "REFRESH_TYPE",
]
