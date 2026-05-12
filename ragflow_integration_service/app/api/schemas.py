from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(min_length=1)


class ErrorResponse(BaseModel):
    detail: str = Field(min_length=1)


class UploadKnowledgeFileForm(BaseModel):
    knowledge_base_name: str = Field(min_length=1, max_length=128)
    biz_file_id: str = Field(min_length=1, max_length=128)
    biz_file_name: str = Field(min_length=1, max_length=255)


class UploadKnowledgeFileResponse(BaseModel):
    knowledge_base_name: str
    biz_file_id: str
    biz_file_name: str
    parse_status: str
    parse_message: str | None = None
    chunk_count: int = 0
    token_count: int = 0


class ListKnowledgeFilesResponse(BaseModel):
    knowledge_base_name: str
    files: list[UploadKnowledgeFileResponse] = Field(default_factory=list)


class FileChunkPreviewResponse(BaseModel):
    sequence: int
    content: str


class KnowledgeFileDetailResponse(BaseModel):
    knowledge_base_name: str
    biz_file_id: str
    biz_file_name: str
    parse_status: str
    parse_message: str | None = None
    chunk_count: int = 0
    token_count: int = 0
    chunks: list[FileChunkPreviewResponse] = Field(default_factory=list)


class ChatRequest(BaseModel):
    assistant_name: str = Field(min_length=1, max_length=128)
    question: str = Field(min_length=1)
    session_name: str | None = Field(default=None, max_length=128)


class ChatReferenceResponse(BaseModel):
    biz_file_id: str
    biz_file_name: str
    chunk_content: str
    similarity_score: float


class ChatResponse(BaseModel):
    answer: str
    references: list[ChatReferenceResponse] = Field(default_factory=list)
