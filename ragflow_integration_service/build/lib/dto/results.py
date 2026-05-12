from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DatasetResult:
    id: str
    name: str


@dataclass(frozen=True)
class DocumentResult:
    id: str
    name: str
    run: str | None = None


@dataclass(frozen=True)
class ChunkResult:
    id: str
    content: str
    document_id: str | None = None
    document_name: str | None = None
    dataset_id: str | None = None
    similarity: float | None = None
    vector_similarity: float | None = None
    term_similarity: float | None = None
    reference: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ChatResult:
    id: str
    name: str


@dataclass(frozen=True)
class SessionResult:
    id: str
    name: str
    chat_id: str | None = None


@dataclass(frozen=True)
class CompletionResult:
    answer: str
    session_id: str | None = None
    reference: dict[str, Any] = field(default_factory=dict)
