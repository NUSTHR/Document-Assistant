from typing import Any

from app.adapters.ragflow.config_adapter import RagflowConfigAdapter
from app.adapters.ragflow.identity import make_biz_id
from app.dto.commands import UpdateRagflowChatConfigCommand


class FakeRagflowClient:
    def __init__(self) -> None:
        self.patches: list[tuple[str, dict[str, Any]]] = []
        self.chat = {
            "id": "chat-1",
            "name": "Assistant",
            "dataset_ids": [],
            "llm_id": "model-a",
            "prompt_config": {
                "system": "old prompt",
                "empty_response": "old empty",
                "quote": True,
                "refine_multiturn": True,
            },
            "similarity_threshold": 0.1,
            "vector_similarity_weight": 0.3,
            "top_k": 1024,
            "top_n": 6,
            "rerank_id": "",
        }

    def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if path == "/chats":
            return {"data": {"chats": [self.chat]}}
        if path == "/datasets":
            return {"data": {"datasets": []}}
        return {"data": {}}

    def patch(
        self,
        path: str,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body = dict(json_body or {})
        self.patches.append((path, body))
        updated_chat = dict(self.chat)
        if isinstance(body.get("prompt_config"), dict):
            updated_prompt = dict(updated_chat["prompt_config"])
            updated_prompt.update(body["prompt_config"])
            updated_chat["prompt_config"] = updated_prompt
        return {"data": updated_chat}


def test_update_chat_config_patches_prompt_config_system_prompt() -> None:
    client = FakeRagflowClient()
    adapter = RagflowConfigAdapter(client)  # type: ignore[arg-type]

    result = adapter.update_chat_config(
        UpdateRagflowChatConfigCommand(
            biz_chat_id=make_biz_id("chat", "chat-1"),
            biz_knowledge_base_ids=[],
            prompt_system="new prompt",
            empty_response="new empty",
            quote=False,
        )
    )

    assert client.patches == [
        (
            "/chats/chat-1",
            {
                "dataset_ids": [],
                "prompt_config": {
                    "system": "new prompt",
                    "empty_response": "new empty",
                    "quote": False,
                    "refine_multiturn": True,
                    "prompt": "new prompt",
                    "show_quote": False,
                },
            },
        )
    ]
    assert result.prompt_config["system"] == "new prompt"
