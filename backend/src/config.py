"""
Application configuration.

Loaded from environment variables / `.env` file via pydantic-settings.
All settings are accessible as `settings.X` after importing `get_settings()`.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SYNC_DB = "postgresql+psycopg2://admin:admin@localhost:5432/manage_agent"


class Settings(BaseSettings):
    """Typed application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── App ────────────────────────────────────────────
    app_name: str = "manage-agent"
    app_env: Literal["development", "staging", "production", "test"] = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    api_v1_prefix: str = "/api/v1"

    # ─── Security ───────────────────────────────────────
    secret_key: str = Field(default="change-me", min_length=8)
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"

    # ─── CORS ───────────────────────────────────────────
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # Allow *.vercel.app preview deployments (set true when frontend is on Vercel)
    cors_allow_vercel_previews: bool = False

    # Allow *.up.railway.app public URLs (set true when frontend is on Railway)
    cors_allow_railway_domains: bool = False

    # ─── Database ───────────────────────────────────────
    database_url: str = "postgresql+asyncpg://admin:admin@localhost:5432/manage_agent"
    database_sync_url: str = "postgresql+psycopg2://admin:admin@localhost:5432/manage_agent"
    db_echo: bool = False
    db_pool_size: int = 10
    db_max_overflow: int = 20

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_async_db_url(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("database_sync_url", mode="before")
    @classmethod
    def normalize_sync_db_url(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg2://", 1)
        return v

    @model_validator(mode="after")
    def derive_sync_db_url_from_async(self) -> "Settings":
        """Hosted platforms (Railway, Render) often inject only DATABASE_URL."""
        async_url = self.database_url
        if not async_url.startswith("postgresql+asyncpg://"):
            return self
        derived = async_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
        sync = self.database_sync_url
        if sync == _DEFAULT_SYNC_DB or sync.startswith("postgresql+asyncpg://"):
            self.database_sync_url = derived
        return self

    # ─── Redis ──────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ─── LLM ────────────────────────────────────────────
    openai_api_key: str | None = None
    openai_base_url: str | None = None  # for OpenAI-compatible gateways (e.g. gapgpt)
    openai_default_model: str = "claude-opus-4-8"
    available_models_csv: str = (
        "claude-opus-4-8,claude-sonnet-4-6,gpt-4.1,gpt-4.1-mini,gemini-2.5-flash"
    )
    anthropic_api_key: str | None = None
    agent_validation_timeout_seconds: int = 180

    # ─── cursor-to-api provider (Cursor agent CLI via OpenAI-compatible proxy) ──
    # The active provider is toggled at runtime from the admin panel and stored
    # in the `platform_settings` table; these are just the defaults / seed values.
    llm_provider: Literal["gateway", "cursor"] = "gateway"
    cursor_api_base_url: str = "http://127.0.0.1:9191/api/v1"
    cursor_api_key: str | None = None
    cursor_api_model: str = "auto"

    # ─── Logging ──────────────────────────────────────
    log_level: str = "INFO"
    log_json: bool = False
    log_file: str | None = None
    log_file_max_bytes: int = 10_485_760
    log_file_backup_count: int = 5
    log_client_errors: bool = True

    # ─── Rate limiting ──────────────────────────────────
    rate_limit_per_minute: int = 120

    # ─── Seed admin ─────────────────────────────────────
    first_admin_email: str = "admin@example.com"
    first_admin_password: str = "admin123"
    first_admin_name: str = "System Admin"

    @field_validator("secret_key")
    @classmethod
    def warn_default_secret(cls, v: str) -> str:
        if v == "change-me":
            # Don't crash in dev, but make it obvious.
            import warnings

            warnings.warn(
                "SECRET_KEY is using the default value. "
                "Generate a strong key with `openssl rand -hex 32` for production.",
                stacklevel=2,
            )
        return v


@lru_cache
def get_settings() -> Settings:
    """Cached singleton accessor."""
    return Settings()


settings = get_settings()
