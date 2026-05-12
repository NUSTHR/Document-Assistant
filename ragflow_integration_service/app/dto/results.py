from pydantic import BaseModel, Field


class FileIngestionResult(BaseModel):
    knowledge_base_name: str
    biz_file_id: str
    biz_file_name: str
    parse_status: str
    parse_message: str | None = None
    chunk_count: int = 0
    token_count: int = 0


class FileChunkPreviewResult(BaseModel):
    sequence: int
    content: str


class KnowledgeFileDetailResult(BaseModel):
    knowledge_base_name: str
    biz_file_id: str
    biz_file_name: str
    parse_status: str
    parse_message: str | None = None
    chunk_count: int = 0
    token_count: int = 0
    chunks: list[FileChunkPreviewResult] = Field(default_factory=list)


class KnowledgeFileContentResult(BaseModel):
    knowledge_base_name: str
    biz_file_id: str
    biz_file_name: str
    media_type: str
    content: bytes


class ReferenceResult(BaseModel):
    biz_file_id: str
    biz_file_name: str
    chunk_content: str
    similarity_score: float = 0.0


class ChatStreamResult(BaseModel):
    answer: str = ""
    references: list[ReferenceResult] = Field(default_factory=list)
