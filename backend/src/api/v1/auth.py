"""Auth endpoints."""

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm

from src.api.dependencies import DB, CurrentUser
from src.schemas.auth import LoginRequest, RefreshRequest, TokenPair
from src.schemas.user import UserCreate, UserRead
from src.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: DB):
    user = await AuthService(db).register(payload)
    return user


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: DB):
    svc = AuthService(db)
    user = await svc.authenticate(payload.email, payload.password)
    return svc.make_token_pair(user)


@router.post("/token", response_model=TokenPair, include_in_schema=False)
async def token_form(
    db: DB,
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    """OAuth2 password-flow endpoint (for /docs `Authorize` button)."""
    svc = AuthService(db)
    user = await svc.authenticate(form_data.username, form_data.password)
    return svc.make_token_pair(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: DB):
    return await AuthService(db).refresh(payload.refresh_token)


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser):
    return user
