from functools import lru_cache

from ragflow_sdk import RAGFlow

from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_ragflow_client() -> RAGFlow:
    settings = get_settings()
    return RAGFlow(
        api_key=settings.ragflow_api_key,
        base_url=settings.ragflow_base_url,
    )
