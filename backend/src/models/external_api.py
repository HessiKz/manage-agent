"""External API service definitions — user-configured integrations."""

from __future__ import annotations

import enum
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class AuthType(str, enum.Enum):
    NONE = "none"
    BEARER = "bearer"
    API_KEY = "api_key"
    BASIC = "basic"


class HttpMethod(str, enum.Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


class ExternalApiService(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "external_api_services"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    auth_type: Mapped[AuthType] = mapped_column(
        SAEnum(
            AuthType,
            name="auth_type",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=AuthType.NONE,
        nullable=False,
    )
    auth_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    default_headers: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    endpoints: Mapped[list["ExternalApiEndpoint"]] = relationship(
        "ExternalApiEndpoint",
        back_populates="service",
        cascade="all, delete-orphan",
    )


class ExternalApiEndpoint(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "external_api_endpoints"

    service_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("external_api_services.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    method: Mapped[HttpMethod] = mapped_column(
        SAEnum(HttpMethod, name="http_method"),
        default=HttpMethod.GET,
        nullable=False,
    )
    query_params_schema: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    body_schema: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    register_as_tool: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    service: Mapped["ExternalApiService"] = relationship("ExternalApiService", back_populates="endpoints")
