from typing import Any

from app.dto.results import (
    ChatResult,
    ChunkResult,
    CompletionResult,
    DatasetResult,
    DocumentResult,
    SessionResult,
)


def map_dataset(dataset: Any) -> DatasetResult:
    return DatasetResult(id=str(dataset.id), name=str(dataset.name))


def map_document(document: Any) -> DocumentResult:
    return DocumentResult(
        id=str(document.id),
        name=str(getattr(document, "name", "")),
        run=getattr(document, "run", None),
    )


def map_chunk(chunk: Any) -> ChunkResult:
    return ChunkResult(
        id=str(chunk.id),
        content=str(getattr(chunk, "content", "")),
        document_id=getattr(chunk, "document_id", None),
        document_name=getattr(chunk, "document_name", None),
        dataset_id=getattr(chunk, "dataset_id", None),
        similarity=getattr(chunk, "similarity", None),
        vector_similarity=getattr(chunk, "vector_similarity", None),
        term_similarity=getattr(chunk, "term_similarity", None),
    )


def map_chat(chat: Any) -> ChatResult:
    return ChatResult(id=str(chat.id), name=str(chat.name))


def map_session(session: Any) -> SessionResult:
    return SessionResult(
        id=str(session.id),
        name=str(getattr(session, "name", "")),
        chat_id=getattr(session, "chat_id", None),
    )


def map_completion(message: Any) -> CompletionResult:
    references = {}
    if getattr(message, "reference", None) is not None:
        references = {"reference": message.reference}
    return CompletionResult(
        answer=str(getattr(message, "content", "")),
        session_id=getattr(message, "session_id", None),
        reference=references,
    )
