from typing import Any

from app.adapters.ragflow.anti_corruption import clean_model_answer, to_reference_result
from app.adapters.ragflow.client import RagflowHttpClient
from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.adapters.ragflow.identity import make_biz_id, resolve_raw_id
from app.dto.commands import UpdateRagflowChatConfigCommand
from app.dto.results import (
    RagflowSessionMessageResult,
    RagflowChatConfigResult,
    RagflowDatasetConfigResult,
    RagflowModelOptionResult,
    RagflowSessionResult,
    ReferenceResult,
)


_OMIT = object()
_REFERENCE_NUMBER_KEYS = (
    "reference_number",
    "reference_index",
    "citation_number",
    "citation_index",
    "ref",
    "idx",
    "index",
)
_REFERENCE_CONTENT_KEYS = (
    "content",
    "content_with_weight",
    "chunk_content",
    "text",
    "content_ltks",
)
_REFERENCE_DOCUMENT_KEYS = (
    "document_name",
    "docnm_kwd",
    "doc_name",
    "file_name",
    "filename",
    "name",
)


class RagflowConfigAdapter:
    def __init__(self, client: RagflowHttpClient) -> None:
        self._client = client

    def list_datasets(self) -> list[RagflowDatasetConfigResult]:
        return [
            self._to_dataset_config(dataset)
            for dataset in self._list_raw_datasets()
        ]

    def list_chats(self) -> list[RagflowChatConfigResult]:
        return [
            self._to_chat_config(chat)
            for chat in self._list_raw_chats()
        ]

    def list_models(self) -> list[RagflowModelOptionResult]:
        models_by_id: dict[str, RagflowModelOptionResult] = {}
        for chat in self._list_raw_chats():
            chat_config = self._to_chat_config(chat)
            model_id = chat_config.llm_id.strip()
            if not model_id or model_id in models_by_id:
                continue
            label = f"{model_id} ({chat_config.name})" if chat_config.name else model_id
            models_by_id[model_id] = RagflowModelOptionResult(
                model_id=model_id,
                label=label,
                source="chat_config",
            )
        return list(models_by_id.values())

    def update_chat_config(
        self,
        command: UpdateRagflowChatConfigCommand,
    ) -> RagflowChatConfigResult:
        chats = self._list_raw_chats()
        chat_id = resolve_raw_id(
            "chat",
            command.biz_chat_id,
            [str(chat.get("id") or "") for chat in chats],
        )
        current_chat = self._require_chat_payload(chat_id)
        datasets = self._list_raw_datasets()
        dataset_ids = [
            resolve_raw_id(
                "kb",
                biz_knowledge_base_id,
                [str(dataset.get("id") or "") for dataset in datasets],
            )
            for biz_knowledge_base_id in command.biz_knowledge_base_ids
        ]

        update_payload: dict[str, Any] = {
            "dataset_ids": dataset_ids,
        }
        if command.llm_id is not None:
            llm_payload = dict(self._read_chat_dict(current_chat, "llm"))
            llm_payload.update(self._read_chat_dict(current_chat, "llm_setting"))
            llm_id = command.llm_id.strip()
            if not llm_id:
                llm_id = self._read_chat_str(current_chat, "llm_id")
            llm_payload["model_name"] = llm_id
            update_payload["llm"] = llm_payload

        should_patch_prompt = any(
            value is not None
            for value in (
                command.similarity_threshold,
                command.vector_similarity_weight,
                command.top_k,
                command.top_n,
                command.rerank_id,
                command.prompt_system,
                command.empty_response,
                command.quote,
            )
        )
        prompt_payload = (
            dict(self._read_chat_dict(current_chat, "prompt"))
            if should_patch_prompt
            else {}
        )
        if should_patch_prompt:
            prompt_payload.update(self._read_chat_dict(current_chat, "prompt_config"))
        if command.similarity_threshold is not None:
            prompt_payload["similarity_threshold"] = command.similarity_threshold
            update_payload["similarity_threshold"] = command.similarity_threshold
        if command.vector_similarity_weight is not None:
            prompt_payload["keywords_similarity_weight"] = 1 - command.vector_similarity_weight
            update_payload["vector_similarity_weight"] = command.vector_similarity_weight
        if command.top_k is not None:
            prompt_payload["top_k"] = command.top_k
            update_payload["top_k"] = command.top_k
        if command.top_n is not None:
            prompt_payload["top_n"] = command.top_n
            update_payload["top_n"] = command.top_n
        if command.rerank_id is not None:
            prompt_payload["rerank_model"] = command.rerank_id
            update_payload["rerank_id"] = command.rerank_id
        if command.prompt_system is not None:
            prompt_payload["system"] = command.prompt_system
            prompt_payload["prompt"] = command.prompt_system
        if command.empty_response is not None:
            prompt_payload["empty_response"] = command.empty_response
        if command.quote is not None:
            prompt_payload["quote"] = command.quote
            prompt_payload["show_quote"] = command.quote
        if should_patch_prompt:
            update_payload["prompt"] = prompt_payload

        response_payload = self._client.patch(
            f"/chats/{chat_id}",
            json_body=update_payload,
        )
        updated_chat = response_payload.get("data")
        if not isinstance(updated_chat, dict):
            updated_chat = self._require_chat_payload(chat_id)
        return self._to_chat_config(updated_chat)

    def list_sessions(self, biz_chat_id: str) -> list[RagflowSessionResult]:
        chat_id = self._resolve_chat_id(biz_chat_id)
        return [
            self._to_session_response(self._read_session_detail(chat_id, session), chat_id)
            for session in self._list_raw_sessions(chat_id)
        ]

    def create_session(
        self,
        biz_chat_id: str,
        name: str,
    ) -> RagflowSessionResult:
        chat_id = self._resolve_chat_id(biz_chat_id)
        payload = self._client.post(
            f"/chats/{chat_id}/sessions",
            json_body={"name": name},
        )
        session = payload.get("data")
        if not isinstance(session, dict):
            raise RagflowIntegrationError("ragflow session response was empty")
        return self._to_session_response(session, chat_id)

    def update_session_name(
        self,
        biz_chat_id: str,
        biz_session_id: str,
        name: str,
    ) -> RagflowSessionResult:
        chat_id = self._resolve_chat_id(biz_chat_id)
        session_id = self._resolve_session_id(chat_id, biz_session_id)
        payload = self._client.patch(
            f"/chats/{chat_id}/sessions/{session_id}",
            json_body={"name": name},
        )
        session = payload.get("data")
        if not isinstance(session, dict):
            session = self._require_session_payload(chat_id, session_id)
        return self._to_session_response(session, chat_id)

    def delete_session(
        self,
        biz_chat_id: str,
        biz_session_id: str,
    ) -> bool:
        chat_id = self._resolve_chat_id(biz_chat_id)
        session_id = self._resolve_session_id(chat_id, biz_session_id)
        self._client.delete(
            f"/chats/{chat_id}/sessions",
            json_body={"ids": [session_id]},
        )
        return True

    def _resolve_chat_id(self, biz_chat_id: str) -> str:
        chats = self._list_raw_chats()
        return resolve_raw_id(
            "chat",
            biz_chat_id,
            [str(chat.get("id") or "") for chat in chats],
        )

    def _resolve_session_id(self, chat_id: str, biz_session_id: str) -> str:
        sessions = self._list_raw_sessions(chat_id)
        return resolve_raw_id(
            "session",
            biz_session_id,
            [str(session.get("id") or "") for session in sessions],
        )

    def _list_raw_datasets(self) -> list[dict[str, Any]]:
        payload = self._client.get(
            "/datasets",
            params={
                "page": 1,
                "page_size": 100,
                "orderby": "create_time",
                "desc": True,
            },
        )
        return self._read_items(payload, "datasets")

    def _list_raw_chats(self) -> list[dict[str, Any]]:
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

    def _list_raw_sessions(self, chat_id: str) -> list[dict[str, Any]]:
        payload = self._client.get(
            f"/chats/{chat_id}/sessions",
            params={
                "page": 1,
                "page_size": 50,
                "orderby": "create_time",
                "desc": True,
            },
        )
        return self._read_items(payload, "sessions")

    def _read_session_detail(
        self,
        chat_id: str,
        session_summary: dict[str, Any],
    ) -> dict[str, Any]:
        session_id = str(session_summary.get("id") or "")
        if not session_id:
            return session_summary

        try:
            payload = self._client.get(f"/chats/{chat_id}/sessions/{session_id}")
        except RagflowIntegrationError:
            return session_summary

        session_detail = payload.get("data")
        if not isinstance(session_detail, dict):
            return session_summary

        merged_session = dict(session_summary)
        merged_session.update(session_detail)
        return merged_session

    def _require_chat_payload(self, chat_id: str) -> dict[str, Any]:
        payload = self._client.get(
            "/chats",
            params={
                "page": 1,
                "page_size": 1,
                "id": chat_id,
            },
        )
        chats = self._read_items(payload, "chats")
        if not chats:
            raise RagflowIntegrationError("chat resource was not found")
        return chats[0]

    def _require_session_payload(self, chat_id: str, session_id: str) -> dict[str, Any]:
        sessions = self._list_raw_sessions(chat_id)
        for session in sessions:
            if str(session.get("id") or "") == session_id:
                return session
        raise RagflowIntegrationError("session resource was not found")

    def _to_dataset_config(
        self,
        dataset: dict[str, Any],
    ) -> RagflowDatasetConfigResult:
        parser_config = dataset.get("parser_config")
        return RagflowDatasetConfigResult(
            biz_knowledge_base_id=make_biz_id("kb", str(dataset.get("id") or "")),
            name=str(dataset.get("name") or ""),
            embedding_model=str(dataset.get("embedding_model") or ""),
            chunk_method=str(dataset.get("chunk_method") or ""),
            document_count=int(dataset.get("document_count") or 0),
            chunk_count=int(dataset.get("chunk_count") or 0),
            parser_config=self._sanitize_config_dict(parser_config),
        )

    def _to_chat_config(
        self,
        chat: dict[str, Any],
    ) -> RagflowChatConfigResult:
        prompt_config = dict(self._read_chat_dict(chat, "prompt"))
        prompt_config.update(self._read_chat_dict(chat, "prompt_config"))
        llm_config = dict(self._read_chat_dict(chat, "llm"))
        llm_config.update(self._read_chat_dict(chat, "llm_setting"))
        vector_similarity_weight = self._read_optional_float(
            chat,
            "vector_similarity_weight",
        )
        if vector_similarity_weight is None:
            keywords_weight = prompt_config.get("keywords_similarity_weight")
            if isinstance(keywords_weight, (int, float)):
                vector_similarity_weight = 1 - float(keywords_weight)
        if vector_similarity_weight is None:
            vector_similarity_weight = 0.3

        dataset_ids = [
            str(dataset_id)
            for dataset_id in chat.get("dataset_ids") or []
            if str(dataset_id or "").strip()
        ]
        return RagflowChatConfigResult(
            biz_chat_id=make_biz_id("chat", str(chat.get("id") or "")),
            name=str(chat.get("name") or ""),
            biz_knowledge_base_ids=[
                make_biz_id("kb", dataset_id)
                for dataset_id in dataset_ids
            ],
            kb_names=[str(kb_name) for kb_name in chat.get("kb_names") or []],
            llm_id=str(chat.get("llm_id") or llm_config.get("model_name") or ""),
            similarity_threshold=float(
                chat.get("similarity_threshold")
                or prompt_config.get("similarity_threshold")
                or 0.2
            ),
            vector_similarity_weight=vector_similarity_weight,
            top_k=int(chat.get("top_k") or prompt_config.get("top_k") or 1024),
            top_n=int(chat.get("top_n") or prompt_config.get("top_n") or 8),
            rerank_id=str(chat.get("rerank_id") or prompt_config.get("rerank_model") or ""),
            prompt_config=self._sanitize_prompt_config(prompt_config),
        )

    def _to_session_response(
        self,
        session: dict[str, Any],
        fallback_chat_id: str,
    ) -> RagflowSessionResult:
        messages = session.get("messages")
        fallback_reference_sets = self._sanitize_session_reference_sets(session)
        return RagflowSessionResult(
            biz_session_id=make_biz_id("session", str(session.get("id") or "")),
            name=str(session.get("name") or "New session"),
            biz_chat_id=make_biz_id(
                "chat",
                str(session.get("chat_id") or fallback_chat_id),
            ),
            messages=self._sanitize_session_messages(
                messages if isinstance(messages, list) else [],
                fallback_reference_sets,
            ),
        )

    def _read_items(self, payload: dict[str, Any], collection_key: str) -> list[dict[str, Any]]:
        data = payload.get("data")
        if isinstance(data, dict):
            items = data.get(collection_key, [])
        elif isinstance(data, list):
            items = data
        else:
            items = []
        return [item for item in items if isinstance(item, dict)]

    def _read_chat_dict(self, chat: dict[str, Any], key: str) -> dict[str, Any]:
        value = chat.get(key)
        return value if isinstance(value, dict) else {}

    def _read_chat_str(self, chat: dict[str, Any], key: str) -> str:
        value = chat.get(key)
        return str(value) if value is not None else ""

    def _read_optional_float(self, chat: dict[str, Any], key: str) -> float | None:
        value = chat.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        return None

    def _sanitize_messages(self, messages: list[Any]) -> list[RagflowSessionMessageResult]:
        return self._sanitize_session_messages(messages, [])

    def _sanitize_session_references(self, session: dict[str, Any]) -> list[ReferenceResult]:
        references: list[ReferenceResult] = []
        for reference_set in self._sanitize_session_reference_sets(session):
            references.extend(reference_set)
        return references

    def _sanitize_session_reference_sets(
        self,
        session: dict[str, Any],
    ) -> list[list[ReferenceResult]]:
        reference_sets = self._sanitize_reference_payload_sets(session.get("reference"))
        if reference_sets:
            return reference_sets
        return self._sanitize_reference_payload_sets(session.get("references"))

    def _sanitize_reference_payload_sets(
        self,
        raw_reference: Any,
    ) -> list[list[ReferenceResult]]:
        if isinstance(raw_reference, list):
            return [
                self._sanitize_reference_payload(reference_group)
                for reference_group in raw_reference
            ]

        references = self._sanitize_reference_payload(raw_reference)
        return [references] if references else []

    def _sanitize_session_messages(
        self,
        messages: list[Any],
        fallback_reference_sets: list[list[ReferenceResult]],
    ) -> list[RagflowSessionMessageResult]:
        sanitized_messages: list[RagflowSessionMessageResult] = []
        assistant_answer_indices: list[int] = []
        has_seen_user = False
        for message in messages:
            if not isinstance(message, dict):
                continue
            role = str(message.get("role") or "assistant")
            normalized_role = role if role in {"user", "assistant"} else "assistant"
            if normalized_role == "assistant" and has_seen_user:
                assistant_answer_indices.append(len(sanitized_messages))
            if normalized_role == "user":
                has_seen_user = True
            content = message.get("content")
            if content is None:
                content = message.get("answer")
            references = self._sanitize_message_references(message)
            sanitized_messages.append(
                RagflowSessionMessageResult(
                    role=normalized_role,
                    content=clean_model_answer(str(content or "")),
                    references=references,
                )
            )
        if fallback_reference_sets:
            self._apply_session_reference_sets(
                sanitized_messages,
                assistant_answer_indices,
                fallback_reference_sets,
            )
        return sanitized_messages

    def _apply_session_reference_sets(
        self,
        messages: list[RagflowSessionMessageResult],
        assistant_answer_indices: list[int],
        reference_sets: list[list[ReferenceResult]],
    ) -> None:
        if not assistant_answer_indices:
            return

        if len(assistant_answer_indices) == 1:
            message_index = assistant_answer_indices[0]
            if messages[message_index].references:
                return
            combined_references: list[ReferenceResult] = []
            for reference_set in reference_sets:
                combined_references.extend(reference_set)
            messages[message_index].references = combined_references
            return

        if len(reference_sets) <= len(assistant_answer_indices):
            target_indices = assistant_answer_indices[-len(reference_sets):]
            aligned_reference_sets = reference_sets
        else:
            target_indices = assistant_answer_indices
            aligned_reference_sets = reference_sets[-len(assistant_answer_indices):]

        for message_index, reference_set in zip(target_indices, aligned_reference_sets):
            if not messages[message_index].references:
                messages[message_index].references = reference_set

    def _sanitize_message_references(self, message: dict[str, Any]) -> list[ReferenceResult]:
        raw_reference = message.get("reference")
        if not isinstance(raw_reference, dict):
            raw_reference = message.get("references")
        return self._sanitize_reference_payload(raw_reference)

    def _sanitize_reference_payload(self, raw_reference: Any) -> list[ReferenceResult]:
        chunk_records = self._extract_reference_chunks(raw_reference)
        references: list[ReferenceResult] = []
        for fallback_index, (chunk, reference_number) in enumerate(chunk_records):
            resolved_reference_number = self._coerce_reference_number(reference_number)
            if resolved_reference_number is None:
                resolved_reference_number = fallback_index
            references.append(
                to_reference_result(
                    chunk,
                    reference_number=resolved_reference_number,
                )
            )
        return references

    def _extract_reference_chunks(
        self,
        raw_reference: Any,
        inherited_reference_number: int | str | None = None,
    ) -> list[tuple[dict[str, Any], int | str | None]]:
        if isinstance(raw_reference, list):
            chunk_records: list[tuple[dict[str, Any], int | str | None]] = []
            for index, item in enumerate(raw_reference):
                chunk_records.extend(
                    self._extract_reference_chunks(item, index)
                )
            return chunk_records

        if not isinstance(raw_reference, dict):
            return []

        explicit_reference_number = self._read_explicit_reference_number(raw_reference)
        reference_number = (
            explicit_reference_number
            if explicit_reference_number is not None
            else inherited_reference_number
        )
        chunks = raw_reference.get("chunks")
        if isinstance(chunks, list):
            chunk_records = []
            for index, chunk in enumerate(chunks):
                child_reference_number = self._read_reference_number(
                    chunk,
                    explicit_reference_number
                    if explicit_reference_number is not None
                    else index,
                )
                chunk_records.extend(
                    self._extract_reference_chunks(chunk, child_reference_number)
                )
            return chunk_records

        references = raw_reference.get("references")
        if isinstance(references, list):
            return self._extract_reference_chunks(references, reference_number)

        reference = raw_reference.get("reference")
        if isinstance(reference, (dict, list)):
            return self._extract_reference_chunks(reference, reference_number)

        if self._looks_like_reference_chunk(raw_reference):
            return [(raw_reference, reference_number)]

        return []

    def _read_reference_number(
        self,
        raw_reference: Any,
        fallback: int | str | None,
    ) -> int | str | None:
        explicit_reference_number = self._read_explicit_reference_number(raw_reference)
        if explicit_reference_number is not None:
            return explicit_reference_number
        return fallback

    def _read_explicit_reference_number(
        self,
        raw_reference: Any,
    ) -> int | str | None:
        if not isinstance(raw_reference, dict):
            return None

        for key in _REFERENCE_NUMBER_KEYS:
            value = raw_reference.get(key)
            if value is not None:
                return value
        return None

    def _coerce_reference_number(self, value: int | str | None) -> int | None:
        if isinstance(value, int):
            return value
        if not isinstance(value, str):
            return None

        stripped_value = value.strip()
        if stripped_value.isdigit():
            return int(stripped_value)

        digits = "".join(character for character in stripped_value if character.isdigit())
        if digits:
            return int(digits)
        return None

    def _looks_like_reference_chunk(self, raw_reference: dict[str, Any]) -> bool:
        return any(key in raw_reference for key in _REFERENCE_CONTENT_KEYS) or any(
            key in raw_reference for key in _REFERENCE_DOCUMENT_KEYS
        )

    def _sanitize_prompt_config(self, prompt_config: dict[str, Any]) -> dict[str, Any]:
        allowed_keys = {
            "system",
            "prompt",
            "empty_response",
            "quote",
            "show_quote",
            "similarity_threshold",
            "keywords_similarity_weight",
            "top_k",
            "top_n",
            "rerank_model",
        }
        return {
            key: value
            for key, value in prompt_config.items()
            if key in allowed_keys and self._is_safe_config_value(value)
        }

    def _sanitize_config_dict(self, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            return {}
        blocked_keys = {
            "id",
            "ids",
            "dataset_id",
            "dataset_ids",
            "document_id",
            "document_ids",
            "chat_id",
            "chat_ids",
            "session_id",
            "session_ids",
            "chunk_id",
            "chunk_ids",
        }
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            if key in blocked_keys:
                continue
            sanitized_value = self._sanitize_config_value(item, blocked_keys)
            if sanitized_value is not _OMIT:
                sanitized[key] = sanitized_value
        return sanitized

    def _is_safe_config_value(self, value: Any) -> bool:
        return isinstance(value, (str, int, float, bool, list, dict, type(None)))

    def _sanitize_config_value(self, value: Any, blocked_keys: set[str]) -> Any:
        if isinstance(value, dict):
            sanitized: dict[str, Any] = {}
            for key, item in value.items():
                if key in blocked_keys:
                    continue
                sanitized_value = self._sanitize_config_value(item, blocked_keys)
                if sanitized_value is not _OMIT:
                    sanitized[key] = sanitized_value
            return sanitized
        if isinstance(value, list):
            sanitized_list = [
                sanitized_value
                for item in value
                if (sanitized_value := self._sanitize_config_value(item, blocked_keys)) is not _OMIT
            ]
            return sanitized_list
        if self._is_safe_config_value(value):
            return value
        return _OMIT
