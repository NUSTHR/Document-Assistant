import pytest
from fastapi import HTTPException, status

from app.api import dependencies


class FakeSettings:
    ragflow_allow_service_api_key_fallback = False


def test_missing_authorization_rejects_ragflow_config_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dependencies, "get_settings", lambda: FakeSettings())

    with pytest.raises(HTTPException) as exc_info:
        dependencies.get_ragflow_config_adapter(authorization=None)

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.detail == "missing RAGFlow authorization"


def test_missing_authorization_rejects_knowledge_base_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(dependencies, "get_settings", lambda: FakeSettings())

    with pytest.raises(HTTPException) as exc_info:
        dependencies.get_knowledge_base_service(authorization=None)

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_missing_authorization_rejects_conversation_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(dependencies, "get_settings", lambda: FakeSettings())

    with pytest.raises(HTTPException) as exc_info:
        dependencies.get_conversation_service(authorization=None)

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_authorized_ragflow_config_access_uses_request_authorization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str | None] = {}

    def fake_create_ragflow_client(
        authorization: str | None = None,
        use_service_api_key: bool = False,
    ) -> object:
        captured["authorization"] = authorization
        captured["use_service_api_key"] = str(use_service_api_key)
        return object()

    monkeypatch.setattr(dependencies, "create_ragflow_client", fake_create_ragflow_client)

    adapter = dependencies.get_ragflow_config_adapter(authorization="Bearer user-token")

    assert adapter is not None
    assert captured == {
        "authorization": "Bearer user-token",
        "use_service_api_key": "False",
    }
