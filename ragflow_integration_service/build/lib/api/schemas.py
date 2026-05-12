from pydantic import BaseModel, Field


class CreateDatasetRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    embedding_model: str | None = None
    chunk_method: str = "naive"


class DatasetResponse(BaseModel):
    id: str
    name: str


class DocumentResponse(BaseModel):
    id: str
    name: str
    run: str | None = None


class ParseDocumentsRequest(BaseModel):
    document_ids: list[str]


class RetrievalRequest(BaseModel):
    question: str
    dataset_ids: list[str]
    document_ids: list[str] | None = None
    similarity_threshold: float | None = None
    vector_similarity_weight: float | None = None
    top_k: int | None = None
    page: int = 1
    page_size: int = 30


class ChunkResponse(BaseModel):
    id: str
    content: str
    document_id: str | None = None
    document_name: str | None = None
    dataset_id: str | None = None
    similarity: float | None = None
    vector_similarity: float | None = None
    term_similarity: float | None = None


class CreateChatRequest(BaseModel):
    name: str = Field(min_length=1)
    dataset_ids: list[str]
    llm_id: str | None = None


class ChatResponse(BaseModel):
    id: str
    name: str


class CreateSessionRequest(BaseModel):
    chat_id: str
    name: str = "New session"
    user_id: str | None = None


class SessionResponse(BaseModel):
    id: str
    name: str
    chat_id: str | None = None


class ChatMessageRequest(BaseModel):
    role: str
    content: str


class CompletionRequest(BaseModel):
    chat_id: str
    session_id: str | None = None
    stream: bool = False
    messages: list[ChatMessageRequest]


class CompletionResponse(BaseModel):
    answer: str
    session_id: str | None = None
    reference: dict = Field(default_factory=dict)
