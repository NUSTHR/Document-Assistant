from typing import Literal

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
    reference_number: int | None = None
    similarity_score: float = 0.0


class ChatStreamResult(BaseModel):
    answer: str = ""
    references: list[ReferenceResult] = Field(default_factory=list)


class RagflowDatasetConfigResult(BaseModel):
    biz_knowledge_base_id: str
    name: str
    embedding_model: str = ""
    chunk_method: str = ""
    document_count: int = 0
    chunk_count: int = 0
    parser_config: dict = Field(default_factory=dict)


class RagflowChatConfigResult(BaseModel):
    biz_chat_id: str
    name: str
    biz_knowledge_base_ids: list[str] = Field(default_factory=list)
    kb_names: list[str] = Field(default_factory=list)
    llm_id: str = ""
    similarity_threshold: float = 0.2
    vector_similarity_weight: float = 0.3
    top_k: int = 1024
    top_n: int = 8
    rerank_id: str = ""
    prompt_config: dict = Field(default_factory=dict)


class RagflowModelOptionResult(BaseModel):
    model_id: str
    label: str
    source: str = "chat_config"


class RagflowSessionMessageResult(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    references: list[ReferenceResult] = Field(default_factory=list)


class RagflowSessionResult(BaseModel):
    biz_session_id: str
    name: str
    biz_chat_id: str = ""
    messages: list[RagflowSessionMessageResult] = Field(default_factory=list)
