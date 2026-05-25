from typing import Any

from app.api.routes import auth


class FakeRagflowClient:
    def __init__(self) -> None:
        self.posts: list[tuple[str, dict[str, Any] | None]] = []
        self.gets: list[str] = []

    def get(self, path: str) -> dict[str, Any]:
        self.gets.append(path)
        if path == "/system/config":
            return {
                "data": {
                    "registerEnabled": 0,
                    "disablePasswordLogin": True,
                }
            }
        if path == "/users/me":
            return {
                "data": {
                    "id": "user-1",
                    "email": "user@example.com",
                    "nickname": "Example User",
                    "avatar": "",
                }
            }
        return {"data": {}}

    def post_with_headers(
        self,
        path: str,
        json_body: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], dict[str, str]]:
        self.posts.append((path, json_body))
        return (
            {
                "data": {
                    "id": "user-1",
                    "email": "user@example.com",
                    "nickname": "Example User",
                    "avatar": "",
                }
            },
            {"Authorization": "Bearer ragflow-session-token"},
        )


class FakeRegisteredUserClient(FakeRagflowClient):
    pass


class FakeAuthorizedUserClient:
    def __init__(self) -> None:
        self.posts: list[tuple[str, dict[str, Any] | None]] = []

    def post(
        self,
        path: str,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.posts.append((path, json_body))
        return {"data": {"id": "chat-1"}}


def test_auth_config_maps_ragflow_system_config(monkeypatch) -> None:
    client = FakeRagflowClient()
    monkeypatch.setattr(auth, "create_ragflow_client", lambda *args, **kwargs: client)

    response = auth.get_auth_config()

    assert response.register_enabled is False
    assert response.disable_password_login is True
    assert client.gets == ["/system/config"]


def test_login_returns_ragflow_authorization_header(monkeypatch) -> None:
    client = FakeRagflowClient()
    monkeypatch.setattr(auth, "create_ragflow_client", lambda *args, **kwargs: client)

    response = auth.login(
        auth.AuthLoginRequest(
            email="user@example.com",
            password="encrypted-password",
        )
    )

    assert response.authorization == "Bearer ragflow-session-token"
    assert response.user.email == "user@example.com"
    assert client.posts == [
        (
            "/auth/login",
            {
                "email": "user@example.com",
                "password": "encrypted-password",
            },
        )
    ]


def test_register_creates_default_chat_agent_for_new_user(monkeypatch) -> None:
    registered_user_client = FakeRegisteredUserClient()
    authorized_user_client = FakeAuthorizedUserClient()
    created_clients: list[tuple[str | None, object]] = []

    def fake_create_ragflow_client(*args, **kwargs):
        authorization = kwargs.get("authorization")
        if authorization:
            created_clients.append((authorization, authorized_user_client))
            return authorized_user_client
        created_clients.append((None, registered_user_client))
        return registered_user_client

    monkeypatch.setattr(auth, "create_ragflow_client", fake_create_ragflow_client)

    response = auth.register(
        auth.AuthRegisterRequest(
            email="user@example.com",
            nickname="Example User",
            password="encrypted-password",
        )
    )

    assert response.authorization == "Bearer ragflow-session-token"
    assert registered_user_client.posts == [
        (
            "/users",
            {
                "email": "user@example.com",
                "nickname": "Example User",
                "password": "encrypted-password",
            },
        )
    ]
    assert created_clients[-1][0] == "Bearer ragflow-session-token"
    assert authorized_user_client.posts == [
        (
            "/chats",
            {
                "name": "Documentation Assistant",
                "description": "A helpful assistant for documentation analysis.",
                "icon": "",
                "dataset_ids": [],
                "similarity_threshold": 0.1,
                "vector_similarity_weight": 0.3,
                "top_k": 1024,
                "top_n": 6,
                "prompt_config": auth.load_default_chat_agent_config().prompt_config,
            },
        )
    ]
