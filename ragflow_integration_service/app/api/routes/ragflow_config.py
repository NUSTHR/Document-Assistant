from fastapi import APIRouter, Depends

from app.adapters.ragflow.config_adapter import RagflowConfigAdapter
from app.api.dependencies import get_ragflow_config_adapter
from app.api.schemas import (
    CreateRagflowSessionRequest,
    DeleteRagflowSessionResponse,
    ListRagflowModelsResponse,
    ListRagflowSessionsResponse,
    RagflowChatConfigResponse,
    RagflowConfigResponse,
    RagflowDatasetConfigResponse,
    RagflowModelOptionResponse,
    RagflowSessionResponse,
    UpdateRagflowChatConfigRequest,
    UpdateRagflowSessionRequest,
)
from app.dto.commands import UpdateRagflowChatConfigCommand


router = APIRouter(prefix="/api/ragflow", tags=["ragflow-config"])


@router.get("/config", response_model=RagflowConfigResponse)
def get_ragflow_config(
    adapter: RagflowConfigAdapter = Depends(get_ragflow_config_adapter),
) -> RagflowConfigResponse:
    return RagflowConfigResponse(
        datasets=[
            RagflowDatasetConfigResponse(**dataset.model_dump())
            for dataset in adapter.list_datasets()
        ],
        chats=[
            RagflowChatConfigResponse(**chat.model_dump())
            for chat in adapter.list_chats()
        ],
    )


@router.get("/models", response_model=ListRagflowModelsResponse)
def list_ragflow_models(
    adapter: RagflowConfigAdapter = Depends(get_ragflow_config_adapter),
) -> ListRagflowModelsResponse:
    return ListRagflowModelsResponse(
        models=[
            RagflowModelOptionResponse(**model.model_dump())
            for model in adapter.list_models()
        ],
    )


@router.put("/chats/config", response_model=RagflowChatConfigResponse)
def update_ragflow_chat_config(
    request: UpdateRagflowChatConfigRequest,
    adapter: RagflowConfigAdapter = Depends(get_ragflow_config_adapter),
) -> RagflowChatConfigResponse:
    result = adapter.update_chat_config(
        UpdateRagflowChatConfigCommand(
            biz_chat_id=request.biz_chat_id,
            biz_knowledge_base_ids=request.biz_knowledge_base_ids,
            llm_id=request.llm_id,
            similarity_threshold=request.similarity_threshold,
            vector_similarity_weight=request.vector_similarity_weight,
            top_k=request.top_k,
            top_n=request.top_n,
            rerank_id=request.rerank_id,
            prompt_system=request.prompt_system,
            empty_response=request.empty_response,
            quote=request.quote,
        )
    )
    return RagflowChatConfigResponse(**result.model_dump())


@router.get(
    "/chats/{biz_chat_id}/sessions",
    response_model=ListRagflowSessionsResponse,
)
def list_ragflow_chat_sessions(
    biz_chat_id: str,
    adapter: RagflowConfigAdapter = Depends(get_ragflow_config_adapter),
) -> ListRagflowSessionsResponse:
    return ListRagflowSessionsResponse(
        sessions=[
            RagflowSessionResponse(**session.model_dump())
            for session in adapter.list_sessions(biz_chat_id)
        ],
    )


@router.post(
    "/chats/{biz_chat_id}/sessions",
    response_model=RagflowSessionResponse,
)
def create_ragflow_chat_session(
    biz_chat_id: str,
    request: CreateRagflowSessionRequest,
    adapter: RagflowConfigAdapter = Depends(get_ragflow_config_adapter),
) -> RagflowSessionResponse:
    result = adapter.create_session(
        biz_chat_id=biz_chat_id,
        name=request.name,
    )
    return RagflowSessionResponse(**result.model_dump())


@router.put(
    "/chats/{biz_chat_id}/sessions/{biz_session_id}",
    response_model=RagflowSessionResponse,
)
def update_ragflow_chat_session(
    biz_chat_id: str,
    biz_session_id: str,
    request: UpdateRagflowSessionRequest,
    adapter: RagflowConfigAdapter = Depends(get_ragflow_config_adapter),
) -> RagflowSessionResponse:
    result = adapter.update_session_name(
        biz_chat_id=biz_chat_id,
        biz_session_id=biz_session_id,
        name=request.name,
    )
    return RagflowSessionResponse(**result.model_dump())


@router.delete(
    "/chats/{biz_chat_id}/sessions/{biz_session_id}",
    response_model=DeleteRagflowSessionResponse,
)
def delete_ragflow_chat_session(
    biz_chat_id: str,
    biz_session_id: str,
    adapter: RagflowConfigAdapter = Depends(get_ragflow_config_adapter),
) -> DeleteRagflowSessionResponse:
    return DeleteRagflowSessionResponse(
        deleted=adapter.delete_session(
            biz_chat_id=biz_chat_id,
            biz_session_id=biz_session_id,
        ),
    )
