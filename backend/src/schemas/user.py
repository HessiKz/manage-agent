"""User schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None = None


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = Field(None, max_length=512)


class UserBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    locale: str = "fa"
    department: str | None = None
    title: str | None = None
    phone: str | None = Field(None, max_length=32)
    address: str | None = Field(None, max_length=512)


class UserCreate(UserBase):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    is_superuser: bool = False


class UserAdminCreate(UserBase):
    """Superuser-only user provisioning (support agent + admin panel)."""

    email: EmailStr
    password: str | None = Field(None, min_length=8, max_length=128)
    is_superuser: bool = False
    role_name: str | None = Field(None, max_length=100)


class UserUpdate(BaseModel):
    full_name: str | None = None
    locale: str | None = None
    department: str | None = None
    title: str | None = None
    avatar_url: str | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    """ORM read shape — email is not re-validated (legacy/dev rows may use .local)."""

    model_config = ConfigDict(from_attributes=True)
    email: str
    id: UUID
    avatar_url: str | None = None
    is_active: bool
    is_superuser: bool
    mfa_enabled: bool
    roles: list[RoleRead] = []
    preferences_json: dict = {}
    support_autonomy_level: int = 1
    created_at: datetime
    updated_at: datetime


class UserPreferencesUpdate(BaseModel):
    """Update the current user's durable preferences (Phase 1 M3)."""

    support_autonomy_level: int | None = Field(None, ge=0, le=3)
