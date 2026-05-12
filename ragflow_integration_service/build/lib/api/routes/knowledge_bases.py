from fastapi import APIRouter, Depends, File, UploadFile

from app.api.dependencies import get_knowledge_base_service
from app.api.schemas import (
    CreateDatasetRequest,
    DatasetResponse,
    DocumentResponse,
    ParseDocumentsRequest,
)
from app.application.knowledge_base_service import KnowledgeBaseService
from app.dto.commands import (
    CreateDatasetCommand,
    ParseDocumentsCommand,
    UploadDocumentCommand,
)


router = APIRouter(prefix="/knowledge-bases", tags=["knowledge-bases"])


@router.post("", response_model=DatasetResponse)
def create_dataset(
    request: CreateDatasetRequest,
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> DatasetResponse:
    result = service.create_dataset(
        CreateDatasetCommand(
            name=request.name,
            description=request.description,
            embedding_model=request.embedding_model,
            chunk_method=request.chunk_method,
        )
    )
    return DatasetResponse(id=result.id, name=result.name)


@router.post("/{dataset_id}/documents", response_model=list[DocumentResponse])
async def upload_documents(
    dataset_id: str,
    files: list[UploadFile] = File(...),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> list[DocumentResponse]:
    commands: list[UploadDocumentCommand] = []
    for file in files:
        commands.append(
            UploadDocumentCommand(
                filename=file.filename or "unnamed",
                content=await file.read(),
            )
        )

    result = service.upload_documents(dataset_id, commands)
    return [DocumentResponse(id=item.id, name=item.name, run=item.run) for item in result]


@router.post("/{dataset_id}/parse")
def parse_documents(
    dataset_id: str,
    request: ParseDocumentsRequest,
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> dict[str, bool]:
    service.parse_documents(
        ParseDocumentsCommand(
            dataset_id=dataset_id,
            document_ids=request.document_ids,
        )
    )
    return {"accepted": True}
