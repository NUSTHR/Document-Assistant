from functools import lru_cache

from fastapi import Header, HTTPException, status

from app.adapters.ragflow.client import create_ragflow_client
from app.adapters.ragflow.config_adapter import RagflowConfigAdapter
from app.adapters.ragflow.conversation_adapter import RagflowConversationAdapter
from app.adapters.ragflow.knowledge_base_adapter import RagflowKnowledgeBaseAdapter
from app.application.conversation_service import ConversationService
from app.application.knowledge_base_service import KnowledgeBaseService
from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_service_knowledge_base_service() -> KnowledgeBaseService:
    return KnowledgeBaseService(
        RagflowKnowledgeBaseAdapter(
            create_ragflow_client(use_service_api_key=True),
        )
    )


@lru_cache(maxsize=1)
def get_service_conversation_service() -> ConversationService:
    return ConversationService(
        RagflowConversationAdapter(
            create_ragflow_client(use_service_api_key=True),
        )
    )


@lru_cache(maxsize=1)
def get_service_ragflow_config_adapter() -> RagflowConfigAdapter:
    return RagflowConfigAdapter(create_ragflow_client(use_service_api_key=True))


def get_ragflow_authorization(authorization: str | None = Header(default=None)) -> str | None:
    return authorization


def _should_use_service_api_key_fallback() -> bool:
    return get_settings().ragflow_allow_service_api_key_fallback


def _raise_missing_authorization() -> None:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="missing RAGFlow authorization",
    )


def get_knowledge_base_service(
    authorization: str | None = Header(default=None),
) -> KnowledgeBaseService:
    if not authorization:
        if not _should_use_service_api_key_fallback():
            _raise_missing_authorization()
        return get_service_knowledge_base_service()
    return KnowledgeBaseService(
        RagflowKnowledgeBaseAdapter(create_ragflow_client(authorization=authorization))
    )


def get_conversation_service(
    authorization: str | None = Header(default=None),
) -> ConversationService:
    if not authorization:
        if not _should_use_service_api_key_fallback():
            _raise_missing_authorization()
        return get_service_conversation_service()
    return ConversationService(
        RagflowConversationAdapter(create_ragflow_client(authorization=authorization))
    )


def get_ragflow_config_adapter(
    authorization: str | None = Header(default=None),
) -> RagflowConfigAdapter:
    if not authorization:
        if not _should_use_service_api_key_fallback():
            _raise_missing_authorization()
        return get_service_ragflow_config_adapter()
    return RagflowConfigAdapter(create_ragflow_client(authorization=authorization))
