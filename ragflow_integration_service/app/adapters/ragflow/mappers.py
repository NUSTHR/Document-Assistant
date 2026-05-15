"""Small mapping helpers for raw RAGFlow objects.

These helpers are intentionally limited to DTOs that still exist in the
current anti-corruption layer. The active adapters mostly build DTOs inline,
but keeping this module importable prevents old maintenance imports from
breaking on removed result classes.
"""

from typing import Any

from app.adapters.ragflow.anti_corruption import extract_biz_metadata
from app.core.constants import UNKNOWN_PARSE_STATUS
from app.dto.results import (
    FileChunkPreviewResult,
    FileIngestionResult,
    ReferenceResult,
)


def map_file_ingestion(
    knowledge_base_name: str,
    document: Any,
) -> FileIngestionResult:
    biz_file_id, biz_file_name = extract_biz_metadata(getattr(document, "name", None))
    parse_status = (
        getattr(document, "run", None)
        or getattr(document, "status", None)
        or UNKNOWN_PARSE_STATUS
    )
    raw_message = getattr(document, "progress_msg", None)
    parse_message = str(raw_message).strip() if raw_message else None

    return FileIngestionResult(
        knowledge_base_name=knowledge_base_name,
        biz_file_id=biz_file_id,
        biz_file_name=biz_file_name,
        parse_status=str(parse_status),
        parse_message=parse_message or None,
        chunk_count=int(getattr(document, "chunk_count", 0) or 0),
        token_count=int(getattr(document, "token_count", 0) or 0),
    )


def map_chunk_preview(sequence: int, chunk: Any) -> FileChunkPreviewResult:
    return FileChunkPreviewResult(
        sequence=sequence,
        content=str(getattr(chunk, "content", "")),
    )


def map_reference(raw_reference: Any) -> ReferenceResult:
    document_name = _read_value(raw_reference, "document_name", "docnm_kwd")
    biz_file_id, biz_file_name = extract_biz_metadata(document_name)
    similarity_score = _read_value(raw_reference, "similarity") or 0.0

    return ReferenceResult(
        biz_file_id=biz_file_id,
        biz_file_name=biz_file_name,
        chunk_content=str(
            _read_value(raw_reference, "content", "content_with_weight") or ""
        ),
        similarity_score=float(similarity_score),
    )


def _read_value(raw_reference: Any, *keys: str) -> Any:
    if isinstance(raw_reference, dict):
        for key in keys:
            if key in raw_reference:
                return raw_reference[key]
        return None

    for key in keys:
        value = getattr(raw_reference, key, None)
        if value is not None:
            return value
    return None
