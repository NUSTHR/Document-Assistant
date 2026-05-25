from typing import Literal

from pydantic import BaseModel, Field, field_validator


class HealthResponse(BaseModel):
    status: str = Field(min_length=1)


class ErrorResponse(BaseModel):
    detail: str = Field(min_length=1)


class AuthConfigResponse(BaseModel):
    register_enabled: bool = True
    disable_password_login: bool = False


class AuthLoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)


class AuthRegisterRequest(AuthLoginRequest):
    nickname: str = Field(min_length=1, max_length=128)


class AuthUserResponse(BaseModel):
    id: str = ""
    email: str = ""
    nickname: str = ""
    avatar: str = ""


class AuthSessionResponse(BaseModel):
    authorization: str
    user: AuthUserResponse


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
    biz_chat_id: str | None = Field(default=None, max_length=128)
    biz_session_id: str | None = Field(default=None, max_length=128)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question must not be blank")
        return value


class ChatReferenceResponse(BaseModel):
    biz_file_id: str
    biz_file_name: str
    chunk_content: str
    reference_number: int | None = None
    similarity_score: float


class ChatResponse(BaseModel):
    answer: str
    references: list[ChatReferenceResponse] = Field(default_factory=list)
    biz_session_id: str | None = None
    session_name: str | None = None
    error_code: str | None = None
    error_message: str | None = None


class RagflowDatasetConfigResponse(BaseModel):
    biz_knowledge_base_id: str
    name: str
    embedding_model: str = ""
    chunk_method: str = ""
    document_count: int = 0
    chunk_count: int = 0
    parser_config: dict = Field(default_factory=dict)


class RagflowChatConfigResponse(BaseModel):
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


class RagflowConfigResponse(BaseModel):
    datasets: list[RagflowDatasetConfigResponse] = Field(default_factory=list)
    chats: list[RagflowChatConfigResponse] = Field(default_factory=list)


class RagflowModelOptionResponse(BaseModel):
    model_id: str
    label: str
    source: str = "chat_config"


class ListRagflowModelsResponse(BaseModel):
    models: list[RagflowModelOptionResponse] = Field(default_factory=list)


class RagflowSessionMessageResponse(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    references: list[ChatReferenceResponse] = Field(default_factory=list)


class RagflowSessionResponse(BaseModel):
    biz_session_id: str
    name: str
    biz_chat_id: str = ""
    messages: list[RagflowSessionMessageResponse] = Field(default_factory=list)


class ListRagflowSessionsResponse(BaseModel):
    sessions: list[RagflowSessionResponse] = Field(default_factory=list)


class UpdateRagflowSessionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class DeleteRagflowSessionResponse(BaseModel):
    deleted: bool


class UpdateRagflowChatConfigRequest(BaseModel):
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
