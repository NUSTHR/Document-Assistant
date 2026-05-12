import json
from collections.abc import Iterator

from ragflow_sdk import RAGFlow
from ragflow_sdk.modules.chat import Chat

from app.adapters.ragflow.anti_corruption import (
    clean_inline_references,
    to_reference_result,
)
from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.core.constants import DEFAULT_SESSION_NAME
from app.dto.commands import StreamChatCommand
from app.dto.results import ChatStreamResult
from app.ports.conversation import ConversationPort


class RagflowConversationAdapter(ConversationPort):
    def __init__(self, client: RAGFlow) -> None:
        self._client = client

    def stream_chat(self, command: StreamChatCommand) -> Iterator[ChatStreamResult]:
        try:
            chat = self._require_chat(command.assistant_name)
            session = chat.create_session(
                name=command.session_name or DEFAULT_SESSION_NAME
            )
            accumulated_answer = ""
            latest_references = []
            response = self._client.post(
                "/chat/completions",
                json={
                    "chat_id": chat.id,
                    "session_id": session.id,
                    "messages": [
                        {
                            "role": "user",
                            "content": command.question,
                        }
                    ],
                    "stream": True,
                },
                stream=True,
            )
            if not response.ok:
                raise RagflowIntegrationError(
                    f"chat completion request failed with status {response.status_code}"
                )

            for payload in self._iter_chat_payloads(response):
                accumulated_answer += str(payload.get("answer", ""))
                cleaned_answer = clean_inline_references(accumulated_answer)
                raw_reference = payload.get("reference") or {}
                raw_references = []
                if isinstance(raw_reference, dict):
                    raw_references = raw_reference.get("chunks", []) or []
                if raw_references:
                    latest_references = [
                        to_reference_result(raw_reference)
                        for raw_reference in raw_references
                    ]
                yield ChatStreamResult(
                    answer=cleaned_answer,
                    references=latest_references,
                )
        except RagflowIntegrationError:
            raise
        except Exception as exc:
            raise RagflowIntegrationError(f"failed to stream chat: {exc}") from exc

    def _require_chat(self, assistant_name: str) -> Chat:
        chats = self._list_chats(assistant_name)
        if not chats:
            raise RagflowIntegrationError(
                f"chat assistant '{assistant_name}' not found"
            )

        chat = chats[0]
        dataset_ids = getattr(chat, "dataset_ids", None) or []
        kb_names = getattr(chat, "kb_names", None) or []
        if not dataset_ids and not kb_names:
            raise RagflowIntegrationError(
                f"chat assistant '{assistant_name}' is not bound to any knowledge base"
            )

        return chat

    def _list_chats(self, assistant_name: str) -> list[Chat]:
        response = self._client.get(
            "/chats",
            params={
                "page": 1,
                "page_size": 30,
                "orderby": "create_time",
                "desc": True,
                "name": assistant_name,
            },
        )
        response_payload = response.json()
        if response_payload.get("code") != 0:
            raise RagflowIntegrationError(
                str(response_payload.get("message") or "failed to list chats")
            )

        raw_data = response_payload.get("data")
        if isinstance(raw_data, dict):
            chat_items = raw_data.get("chats", [])
        elif isinstance(raw_data, list):
            chat_items = raw_data
        else:
            chat_items = []

        return [
            Chat(self._client, chat_item)
            for chat_item in chat_items
            if isinstance(chat_item, dict)
        ]

    def _iter_chat_payloads(self, response) -> Iterator[dict]:
        for raw_line in response.iter_lines(decode_unicode=True):
            if not raw_line:
                continue

            line = raw_line.strip()
            if line.startswith("data:"):
                line = line[len("data:") :].strip()

            if not line or line == "[DONE]":
                continue

            event_payload = json.loads(line)
            if not isinstance(event_payload, dict):
                continue

            if event_payload.get("code") not in (0, None):
                raise RagflowIntegrationError(
                    str(event_payload.get("message") or "chat completion failed")
                )

            data = event_payload.get("data")
            if data is True:
                return
            if not isinstance(data, dict):
                continue

            yield data
