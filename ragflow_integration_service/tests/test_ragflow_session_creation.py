from typing import Any

from app.adapters.ragflow.conversation_adapter import RagflowConversationAdapter
from app.adapters.ragflow.identity import make_biz_id
from app.adapters.ragflow.session_naming import SESSION_NAME_MAX_LENGTH
from app.dto.commands import StreamChatCommand


class FakeRagflowClient:
    def __init__(self) -> None:
        self.posts: list[tuple[str, dict[str, Any]]] = []
        self.stream_posts: list[tuple[str, dict[str, Any]]] = []
        self.sessions: list[dict[str, Any]] = []
        self.chat_id = "chat-1"

    def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if path == "/chats":
            return {
                "data": {
                    "chats": [
                        {
                            "id": self.chat_id,
                            "name": "Assistant",
                            "dataset_ids": ["dataset-1"],
                        },
                    ],
                },
            }

        if path == f"/chats/{self.chat_id}/sessions":
            return {"data": {"sessions": self.sessions}}

        return {"data": {}}

    def post(
        self,
        path: str,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body = dict(json_body or {})
        self.posts.append((path, body))
        session = {
            "id": f"session-{len(self.posts)}",
            "name": str(body.get("name") or ""),
            "chat_id": self.chat_id,
            "messages": [],
        }
        self.sessions.insert(0, session)
        return {"data": session}

    def stream_post(
        self,
        path: str,
        json_body: dict[str, Any],
    ):
        self.stream_posts.append((path, dict(json_body)))
        yield {
            "code": 0,
            "data": {
                "answer": "ok",
                "reference": {"chunks": []},
            },
        }
        yield {"code": 0, "data": True}


def test_chat_without_session_names_session_from_first_question() -> None:
    client = FakeRagflowClient()
    adapter = RagflowConversationAdapter(client)  # type: ignore[arg-type]

    results = list(
        adapter.stream_chat(
            StreamChatCommand(
                assistant_name="Assistant",
                question="What is high risk AI?",
                biz_chat_id=make_biz_id("chat", client.chat_id),
            ),
        )
    )

    assert client.posts == [
        (
            f"/chats/{client.chat_id}/sessions",
            {"name": "What is high risk AI?"},
        ),
    ]
    assert client.stream_posts[0][1]["session_id"] == "session-1"
    assert results[0].biz_session_id == make_biz_id("session", "session-1")
    assert results[0].session_name == "What is high risk AI?"


def test_chat_without_session_truncates_first_question_to_100_characters() -> None:
    client = FakeRagflowClient()
    adapter = RagflowConversationAdapter(client)  # type: ignore[arg-type]
    long_question = "x" * (SESSION_NAME_MAX_LENGTH + 20)

    list(
        adapter.stream_chat(
            StreamChatCommand(
                assistant_name="Assistant",
                question=long_question,
                biz_chat_id=make_biz_id("chat", client.chat_id),
            ),
        )
    )

    assert client.posts == [
        (
            f"/chats/{client.chat_id}/sessions",
            {"name": "x" * SESSION_NAME_MAX_LENGTH},
        ),
    ]


def test_chat_without_session_does_not_reuse_same_named_session() -> None:
    client = FakeRagflowClient()
    client.sessions.append(
        {
            "id": "existing-session",
            "name": "Repeated question",
            "chat_id": client.chat_id,
            "messages": [],
        }
    )
    adapter = RagflowConversationAdapter(client)  # type: ignore[arg-type]

    list(
        adapter.stream_chat(
            StreamChatCommand(
                assistant_name="Assistant",
                question="Repeated question",
                biz_chat_id=make_biz_id("chat", client.chat_id),
            ),
        )
    )

    assert client.posts == [
        (
            f"/chats/{client.chat_id}/sessions",
            {"name": "Repeated question"},
        ),
    ]
    assert client.stream_posts[0][1]["session_id"] == "session-1"


def test_chat_with_existing_session_does_not_create_new_session() -> None:
    client = FakeRagflowClient()
    client.sessions.append(
        {
            "id": "existing-session",
            "name": "Existing conversation",
            "chat_id": client.chat_id,
            "messages": [],
        }
    )
    adapter = RagflowConversationAdapter(client)  # type: ignore[arg-type]

    results = list(
        adapter.stream_chat(
            StreamChatCommand(
                assistant_name="Assistant",
                question="Follow up",
                biz_chat_id=make_biz_id("chat", client.chat_id),
                biz_session_id=make_biz_id("session", "existing-session"),
            ),
        )
    )

    assert client.posts == []
    assert client.stream_posts[0][1]["session_id"] == "existing-session"
    assert results[0].biz_session_id == make_biz_id("session", "existing-session")
    assert results[0].session_name == "Existing conversation"
