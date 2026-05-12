from dataclasses import dataclass


@dataclass(frozen=True)
class CreateDatasetCommand:
    name: str
    description: str | None = None
    embedding_model: str | None = None
    chunk_method: str = "naive"


@dataclass(frozen=True)
class UploadDocumentCommand:
    filename: str
    content: bytes


@dataclass(frozen=True)
class ParseDocumentsCommand:
    dataset_id: str
    document_ids: list[str]


@dataclass(frozen=True)
class RetrievalCommand:
    question: str
    dataset_ids: list[str]
    document_ids: list[str] | None = None
    similarity_threshold: float | None = None
    vector_similarity_weight: float | None = None
    top_k: int | None = None
    page: int = 1
    page_size: int = 30


@dataclass(frozen=True)
class CreateChatCommand:
    name: str
    dataset_ids: list[str]
    llm_id: str | None = None


@dataclass(frozen=True)
class CreateSessionCommand:
    chat_id: str
    name: str = "New session"
    user_id: str | None = None


@dataclass(frozen=True)
class ChatMessageCommand:
    role: str
    content: str


@dataclass(frozen=True)
class CompleteChatCommand:
    messages: list[ChatMessageCommand]
    chat_id: str | None = None
    session_id: str | None = None
    stream: bool = False
