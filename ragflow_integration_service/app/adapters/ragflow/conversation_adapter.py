from collections.abc import Iterator
from typing import Any

from app.adapters.ragflow.anti_corruption import (
    clean_model_answer,
    to_reference_result,
)
from app.adapters.ragflow.client import RagflowHttpClient
from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.adapters.ragflow.identity import make_biz_id, resolve_raw_id
from app.core.constants import DEFAULT_SESSION_NAME
from app.dto.commands import StreamChatCommand
from app.dto.results import ChatStreamResult
from app.ports.conversation import ConversationPort


class RagflowConversationAdapter(ConversationPort):
    def __init__(self, client: RagflowHttpClient) -> None:
        self._client = client

    def stream_chat(self, command: StreamChatCommand) -> Iterator[ChatStreamResult]:
        try:
            chat = self._require_chat(
                assistant_name=command.assistant_name,
                biz_chat_id=command.biz_chat_id,
                biz_session_id=command.biz_session_id,
            )
            chat_id = str(chat.get("id") or "")
            session = self._get_or_create_session(
                chat_id=chat_id,
                session_id=command.biz_session_id,
                session_name=command.session_name or DEFAULT_SESSION_NAME,
            )
            session_id = str(session.get("id") or "")
            if not session_id:
                raise RagflowIntegrationError("chat session response was empty")
            accumulated_answer = ""
            latest_references = []
            completion_messages = [
                *self._read_completion_history(session),
                {
                    "role": "user",
                    "content": command.question,
                },
            ]

            for event_payload in self._client.stream_post(
                "/chat/completions",
                {
                    "chat_id": chat_id,
                    "stream": True,
                    "session_id": session_id,
                    "messages": completion_messages,
                },
            ):
                if event_payload.get("code") not in (0, None):
                    raise RagflowIntegrationError(
                        str(event_payload.get("message") or "chat completion failed")
                    )
                data = event_payload.get("data")
                if data is True:
                    return
                if not isinstance(data, dict):
                    continue

                answer_delta = str(data.get("answer", ""))
                if answer_delta.startswith(accumulated_answer):
                    accumulated_answer = answer_delta
                else:
                    accumulated_answer += answer_delta
                raw_references = self._read_reference_chunks(data)
                if raw_references:
                    latest_references = [
                        to_reference_result(
                            raw_reference,
                            reference_number=index,
                        )
                        for index, raw_reference in enumerate(raw_references)
                    ]

                yield ChatStreamResult(
                    answer=clean_model_answer(accumulated_answer),
                    references=latest_references,
                )
        except RagflowIntegrationError:
            raise
        except Exception as exc:
            raise RagflowIntegrationError(f"failed to stream chat: {exc}") from exc

    def _require_chat(
        self,
        assistant_name: str,
        biz_chat_id: str | None,
        biz_session_id: str | None,
    ) -> dict[str, Any]:
        chats = self._list_chats()
        if not chats:
            raise RagflowIntegrationError(
                "no RAGFlow chat assistant is available"
            )
        if biz_chat_id:
            chat = self._find_chat_by_biz_id(chats, biz_chat_id)
            self._validate_chat_binding(chat)
            return chat

        chats = [
            chat
            for chat in chats
            if str(chat.get("name") or "") == assistant_name
        ]
        if not chats:
            raise RagflowIntegrationError(
                f"chat assistant '{assistant_name}' is no longer available"
            )
        if biz_session_id:
            for chat in chats:
                chat_id = str(chat.get("id") or "")
                if self._list_sessions(chat_id=chat_id, session_id=biz_session_id):
                    self._validate_chat_binding(chat)
                    return chat
            raise RagflowIntegrationError(
                f"chat session '{biz_session_id}' not found"
            )

        chat = chats[0]
        self._validate_chat_binding(chat)
        return chat

    def _find_chat_by_biz_id(
        self,
        chats: list[dict[str, Any]],
        biz_chat_id: str,
    ) -> dict[str, Any]:
        try:
            chat_id = resolve_raw_id(
                "chat",
                biz_chat_id,
                [str(chat.get("id") or "") for chat in chats],
            )
        except RagflowIntegrationError as exc:
            raise RagflowIntegrationError(
                "selected RAGFlow chat assistant is no longer available"
            ) from exc

        for chat in chats:
            if str(chat.get("id") or "") == chat_id:
                return chat

        raise RagflowIntegrationError(
            "selected RAGFlow chat assistant is no longer available"
        )

    def _validate_chat_binding(self, chat: dict[str, Any]) -> None:
        dataset_ids = chat.get("dataset_ids") or []
        kb_names = chat.get("kb_names") or []
        if not dataset_ids and not kb_names:
            raise RagflowIntegrationError(
                "selected RAGFlow chat assistant is not bound to any knowledge base"
            )

    def _list_chats(self) -> list[dict[str, Any]]:
        payload = self._client.get(
            "/chats",
            params={
                "page": 1,
                "page_size": 100,
                "orderby": "create_time",
                "desc": True,
            },
        )
        return self._read_items(payload, "chats")

    def _get_or_create_session(
        self,
        chat_id: str,
        session_id: str | None,
        session_name: str,
    ) -> dict[str, Any]:
        if session_id:
            sessions = self._list_sessions(chat_id=chat_id, session_id=session_id)
            if not sessions:
                raise RagflowIntegrationError(
                    f"chat session '{session_id}' not found"
                )
            return sessions[0]

        sessions = self._list_sessions(chat_id=chat_id, session_name=session_name)
        if sessions:
            return sessions[0]

        payload = self._client.post(
            f"/chats/{chat_id}/sessions",
            json_body={"name": session_name},
        )
        session = payload.get("data")
        if not isinstance(session, dict):
            raise RagflowIntegrationError(
                f"failed to create chat session '{session_name}'"
            )
        return session

    def _list_sessions(
        self,
        chat_id: str,
        session_id: str | None = None,
        session_name: str | None = None,
    ) -> list[dict[str, Any]]:
        payload = self._client.get(
            f"/chats/{chat_id}/sessions",
            params={
                "page": 1,
                "page_size": 50,
                "orderby": "create_time",
                "desc": True,
            },
        )
        sessions = self._read_items(payload, "sessions")
        if session_id:
            sessions = [
                session
                for session in sessions
                if make_biz_id("session", str(session.get("id") or "")) == session_id
            ]
        if session_name:
            sessions = [
                session
                for session in sessions
                if str(session.get("name") or "") == session_name
            ]
        return sessions

    def _read_items(self, payload: dict[str, Any], collection_key: str) -> list[dict[str, Any]]:
        data = payload.get("data")
        if isinstance(data, dict):
            items = data.get(collection_key, [])
        elif isinstance(data, list):
            items = data
        else:
            items = []
        return [item for item in items if isinstance(item, dict)]

    def _read_reference_chunks(self, data: dict[str, Any]) -> list[Any]:
        reference = data.get("reference") or {}
        if isinstance(reference, dict):
            chunks = reference.get("chunks", [])
            return chunks if isinstance(chunks, list) else []
        return []

    def _read_completion_history(self, session: dict[str, Any]) -> list[dict[str, str]]:
        raw_messages = session.get("messages")
        if not isinstance(raw_messages, list):
            return []

        messages: list[dict[str, str]] = []
        for raw_message in raw_messages:
            if not isinstance(raw_message, dict):
                continue
            role = str(raw_message.get("role") or "").strip()
            if role not in {"user", "assistant"}:
                continue
            content = raw_message.get("content")
            if content is None:
                content = raw_message.get("answer")
            normalized_content = clean_model_answer(str(content or "")).strip()
            if not normalized_content:
                continue
            messages.append(
                {
                    "role": role,
                    "content": normalized_content,
                }
            )
        return messages
