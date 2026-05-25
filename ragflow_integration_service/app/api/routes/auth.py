from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.adapters.ragflow.client import create_ragflow_client
from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.api.dependencies import get_ragflow_authorization
from app.api.schemas import (
    AuthConfigResponse,
    AuthLoginRequest,
    AuthRegisterRequest,
    AuthSessionResponse,
    AuthUserResponse,
)
from app.core.default_chat_agent import load_default_chat_agent_config


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _to_auth_user(payload: dict) -> AuthUserResponse:
    return AuthUserResponse(
        id=str(payload.get("id") or ""),
        email=str(payload.get("email") or ""),
        nickname=str(payload.get("nickname") or payload.get("name") or ""),
        avatar=str(payload.get("avatar") or ""),
    )


def _read_ragflow_auth_header(headers: dict[str, str]) -> str:
    for key, value in headers.items():
        if key.lower() == "authorization" and value.strip():
            return value.strip()
    raise RagflowIntegrationError("ragflow did not return an authorization header")


def _login_response(path: str, request: AuthLoginRequest | AuthRegisterRequest) -> AuthSessionResponse:
    payload, headers = create_ragflow_client().post_with_headers(
        path,
        json_body=request.model_dump(),
    )
    data = payload.get("data")
    if not isinstance(data, dict):
        raise RagflowIntegrationError("ragflow returned an invalid auth response")
    return AuthSessionResponse(
        authorization=_read_ragflow_auth_header(headers),
        user=_to_auth_user(data),
    )


def _create_default_chat_agent(authorization: str) -> None:
    config = load_default_chat_agent_config()
    if not config.enabled:
        return
    create_ragflow_client(authorization=authorization).post(
        "/chats",
        json_body=config.to_ragflow_create_payload(),
    )


@router.get("/config", response_model=AuthConfigResponse)
def get_auth_config() -> AuthConfigResponse:
    payload = create_ragflow_client().get("/system/config")
    data = payload.get("data")
    if not isinstance(data, dict):
        return AuthConfigResponse()
    return AuthConfigResponse(
        register_enabled=data.get("registerEnabled", 1) != 0,
        disable_password_login=bool(data.get("disablePasswordLogin", False)),
    )


@router.post("/login", response_model=AuthSessionResponse)
def login(request: AuthLoginRequest) -> AuthSessionResponse:
    return _login_response("/auth/login", request)


@router.post("/register", response_model=AuthSessionResponse)
def register(request: AuthRegisterRequest) -> AuthSessionResponse:
    response = _login_response("/users", request)
    _create_default_chat_agent(response.authorization)
    return response


@router.post("/logout")
def logout(authorization: str | None = Depends(get_ragflow_authorization)) -> dict[str, bool]:
    if authorization:
        create_ragflow_client(authorization=authorization).post("/auth/logout")
    return {"ok": True}


@router.get("/me", response_model=AuthUserResponse)
def me(authorization: str | None = Header(default=None)) -> AuthUserResponse:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing authorization",
        )
    payload = create_ragflow_client(authorization=authorization).get("/users/me")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise RagflowIntegrationError("ragflow returned an invalid profile response")
    return _to_auth_user(data)
