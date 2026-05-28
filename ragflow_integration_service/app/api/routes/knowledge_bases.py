from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

from app.api.dependencies import get_knowledge_base_service
from app.api.schemas import (
    KnowledgeFileDetailResponse,
    ListKnowledgeFilesResponse,
    UploadKnowledgeFileForm,
    UploadKnowledgeFileResponse,
)
from app.application.knowledge_base_service import KnowledgeBaseService
from app.dto.commands import UploadKnowledgeFileCommand

router = APIRouter(prefix="/api", tags=["files"])


def build_upload_form(
    knowledge_base_name: Annotated[str, Form(...)],
    biz_file_id: Annotated[str, Form(...)],
    biz_file_name: Annotated[str, Form(...)],
) -> UploadKnowledgeFileForm:
    return UploadKnowledgeFileForm(
        knowledge_base_name=knowledge_base_name,
        biz_file_id=biz_file_id,
        biz_file_name=biz_file_name,
    )


@router.post("/files", response_model=UploadKnowledgeFileResponse)
async def upload_file(
    upload_form: Annotated[UploadKnowledgeFileForm, Depends(build_upload_form)],
    file: Annotated[UploadFile, File(...)],
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> UploadKnowledgeFileResponse:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="uploaded file is empty",
        )

    result = service.upload_and_parse(
        UploadKnowledgeFileCommand(
            knowledge_base_name=upload_form.knowledge_base_name,
            biz_file_id=upload_form.biz_file_id,
            biz_file_name=upload_form.biz_file_name,
            content=file_bytes,
        )
    )
    return UploadKnowledgeFileResponse(**result.model_dump())


@router.get("/files", response_model=ListKnowledgeFilesResponse)
def list_files(
    knowledge_base_name: Annotated[str, Query(min_length=1, max_length=128)],
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> ListKnowledgeFilesResponse:
    files = service.list_files(knowledge_base_name)
    return ListKnowledgeFilesResponse(
        knowledge_base_name=knowledge_base_name,
        files=[UploadKnowledgeFileResponse(**file.model_dump()) for file in files],
    )


@router.get("/files/detail", response_model=KnowledgeFileDetailResponse)
def get_file_detail(
    knowledge_base_name: Annotated[str, Query(min_length=1, max_length=128)],
    biz_file_id: Annotated[str, Query(min_length=1, max_length=128)],
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> KnowledgeFileDetailResponse:
    result = service.get_file_detail(knowledge_base_name, biz_file_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="knowledge file not found",
        )

    return KnowledgeFileDetailResponse(**result.model_dump())


@router.get("/files/content")
def get_file_content(
    knowledge_base_name: Annotated[str, Query(min_length=1, max_length=128)],
    biz_file_id: Annotated[str, Query(min_length=1, max_length=128)],
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> Response:
    result = service.get_file_content(knowledge_base_name, biz_file_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="knowledge file not found",
        )

    encoded_file_name = quote(result.biz_file_name)
    return Response(
        content=result.content,
        media_type=result.media_type,
        headers={
            "Content-Disposition": (
                f"inline; filename*=UTF-8''{encoded_file_name}"
            ),
        },
    )
