from functools import lru_cache

from app.adapters.ragflow.client import get_ragflow_client
from app.adapters.ragflow.config_adapter import RagflowConfigAdapter
from app.adapters.ragflow.conversation_adapter import RagflowConversationAdapter
from app.adapters.ragflow.knowledge_base_adapter import RagflowKnowledgeBaseAdapter
from app.application.conversation_service import ConversationService
from app.application.knowledge_base_service import KnowledgeBaseService


@lru_cache(maxsize=1)
def get_knowledge_base_service() -> KnowledgeBaseService:
    return KnowledgeBaseService(RagflowKnowledgeBaseAdapter(get_ragflow_client()))


@lru_cache(maxsize=1)
def get_conversation_service() -> ConversationService:
    return ConversationService(RagflowConversationAdapter(get_ragflow_client()))


@lru_cache(maxsize=1)
def get_ragflow_config_adapter() -> RagflowConfigAdapter:
    return RagflowConfigAdapter(get_ragflow_client())
