from fastapi import APIRouter, Depends

from app.api.dependencies import get_knowledge_base_service
from app.api.schemas import ChunkResponse, RetrievalRequest
from app.application.knowledge_base_service import KnowledgeBaseService
from app.dto.commands import RetrievalCommand


router = APIRouter(prefix="/retrieval", tags=["retrieval"])


@router.post("/query", response_model=list[ChunkResponse])
def retrieve(
    request: RetrievalRequest,
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> list[ChunkResponse]:
    results = service.retrieve(
        RetrievalCommand(
            question=request.question,
            dataset_ids=request.dataset_ids,
            document_ids=request.document_ids,
            similarity_threshold=request.similarity_threshold,
            vector_similarity_weight=request.vector_similarity_weight,
            top_k=request.top_k,
            page=request.page,
            page_size=request.page_size,
        )
    )
    return [
        ChunkResponse(
            id=item.id,
            content=item.content,
            document_id=item.document_id,
            document_name=item.document_name,
            dataset_id=item.dataset_id,
            similarity=item.similarity,
            vector_similarity=item.vector_similarity,
            term_similarity=item.term_similarity,
        )
        for item in results
    ]
