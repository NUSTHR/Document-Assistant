from typing import Any

from app.dto.commands import UpdateRagflowChatConfigCommand


def read_prompt_config(chat: dict[str, Any]) -> dict[str, Any]:
    prompt_config = dict(_read_dict(chat, "prompt"))
    prompt_config.update(_read_dict(chat, "prompt_config"))
    return prompt_config


def build_prompt_config_patch(
    current_chat: dict[str, Any],
    command: UpdateRagflowChatConfigCommand,
) -> tuple[dict[str, Any], dict[str, Any]]:
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
    if not should_patch_prompt:
        return {}, {}

    prompt_payload = read_prompt_config(current_chat)
    root_payload: dict[str, Any] = {}

    if command.similarity_threshold is not None:
        prompt_payload["similarity_threshold"] = command.similarity_threshold
        root_payload["similarity_threshold"] = command.similarity_threshold
    if command.vector_similarity_weight is not None:
        prompt_payload["keywords_similarity_weight"] = 1 - command.vector_similarity_weight
        root_payload["vector_similarity_weight"] = command.vector_similarity_weight
    if command.top_k is not None:
        prompt_payload["top_k"] = command.top_k
        root_payload["top_k"] = command.top_k
    if command.top_n is not None:
        prompt_payload["top_n"] = command.top_n
        root_payload["top_n"] = command.top_n
    if command.rerank_id is not None:
        prompt_payload["rerank_model"] = command.rerank_id
        root_payload["rerank_id"] = command.rerank_id
    if command.prompt_system is not None:
        prompt_payload["system"] = command.prompt_system
        prompt_payload["prompt"] = command.prompt_system
    if command.empty_response is not None:
        prompt_payload["empty_response"] = command.empty_response
    if command.quote is not None:
        prompt_payload["quote"] = command.quote
        prompt_payload["show_quote"] = command.quote

    return root_payload, {"prompt_config": prompt_payload}


def _read_dict(chat: dict[str, Any], key: str) -> dict[str, Any]:
    value = chat.get(key)
    return value if isinstance(value, dict) else {}
