from pydantic import BaseModel, Field


class UploadKnowledgeFileCommand(BaseModel):
    knowledge_base_name: str = Field(min_length=1, max_length=128)
    biz_file_id: str = Field(min_length=1, max_length=128)
    biz_file_name: str = Field(min_length=1, max_length=255)
    content: bytes


class StreamChatCommand(BaseModel):
    assistant_name: str = Field(min_length=1, max_length=128)
    question: str = Field(min_length=1)
    biz_chat_id: str | None = Field(default=None, max_length=128)
    biz_session_id: str | None = Field(default=None, max_length=128)


class UpdateRagflowChatConfigCommand(BaseModel):
    biz_chat_id: str = Field(min_length=1)
    biz_knowledge_base_ids: list[str] = Field(default_factory=list)
    llm_id: str | None = None
    similarity_threshold: float | None = Field(default=None, ge=0, le=1)
    vector_similarity_weight: float | None = Field(default=None, ge=0, le=1)
    top_k: int | None = Field(default=None, ge=1, le=10000)
    top_n: int | None = Field(default=None, ge=1, le=100)
    rerank_id: str | None = None
    prompt_system: str | None = None
    empty_response: str | None = None
    quote: bool | None = None
