import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import get_settings


DEFAULT_PROMPT_CONFIG = {
    "system": (
        "You are Documentation Assistant, a careful assistant for answering questions "
        "from selected knowledge bases. Use the knowledge base content when it is "
        "available, cite sources when possible, and say clearly when the selected "
        "knowledge base does not contain enough information.\n"
        "Knowledge base:\n{knowledge}"
    ),
    "prologue": "Hi! I am your documentation assistant. What would you like to analyze?",
    "parameters": [{"key": "knowledge", "optional": False}],
    "empty_response": "No relevant content was found in the selected knowledge base.",
    "quote": True,
    "tts": False,
    "refine_multiturn": True,
}


class DefaultChatAgentConfig(BaseModel):
    enabled: bool = True
    name: str = Field(default="Documentation Assistant", min_length=1, max_length=128)
    description: str = "A helpful assistant for documentation analysis."
    icon: str = ""
    dataset_ids: list[str] = Field(default_factory=list)
    llm_id: str | None = None
    llm_setting: dict[str, Any] = Field(default_factory=dict)
    similarity_threshold: float = Field(default=0.1, ge=0, le=1)
    vector_similarity_weight: float = Field(default=0.3, ge=0, le=1)
    top_k: int = Field(default=1024, ge=1, le=10000)
    top_n: int = Field(default=6, ge=1, le=100)
    rerank_id: str = ""
    prompt_config: dict[str, Any] = Field(default_factory=lambda: dict(DEFAULT_PROMPT_CONFIG))

    def to_ragflow_create_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "dataset_ids": self.dataset_ids,
            "similarity_threshold": self.similarity_threshold,
            "vector_similarity_weight": self.vector_similarity_weight,
            "top_k": self.top_k,
            "top_n": self.top_n,
            "prompt_config": self.prompt_config,
        }

        if self.llm_id and self.llm_id.strip():
            payload["llm_id"] = self.llm_id.strip()
        if self.llm_setting:
            payload["llm_setting"] = self.llm_setting
        if self.rerank_id.strip():
            payload["rerank_id"] = self.rerank_id.strip()

        return payload


def load_default_chat_agent_config() -> DefaultChatAgentConfig:
    path = _resolve_default_chat_agent_config_path()
    if not path.exists():
        return DefaultChatAgentConfig()

    with path.open("r", encoding="utf-8-sig") as config_file:
        payload = json.load(config_file)
    if not isinstance(payload, dict):
        raise ValueError("default chat agent config must be a JSON object")
    return DefaultChatAgentConfig.model_validate(payload)


def _resolve_default_chat_agent_config_path() -> Path:
    configured_path = get_settings().default_chat_agent_config_path.strip()
    if configured_path:
        return Path(configured_path).expanduser()
    return Path(__file__).resolve().parents[2] / "config" / "default_chat_agent.json"
