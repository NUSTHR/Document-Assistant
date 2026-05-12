import re
from typing import Any

from app.dto.results import ReferenceResult
from app.core.constants import (
    DISPLAY_NAME_TEMPLATE,
    INLINE_REFERENCE_PATTERN,
    UNKNOWN_BIZ_FILE_ID,
    UNKNOWN_BIZ_FILE_NAME,
)


DISPLAY_NAME_PATTERN = re.compile(
    r"^\[biz_id:(?P<biz_file_id>[^\]]+)\](?P<biz_file_name>.+)$"
)
INLINE_REFERENCE_REGEX = re.compile(INLINE_REFERENCE_PATTERN)


def embed_biz_file_id(biz_file_id: str, biz_file_name: str) -> str:
    return DISPLAY_NAME_TEMPLATE.format(
        biz_file_id=biz_file_id,
        biz_file_name=biz_file_name,
    )


def extract_biz_metadata(document_name: str | None) -> tuple[str, str]:
    if not document_name:
        return UNKNOWN_BIZ_FILE_ID, UNKNOWN_BIZ_FILE_NAME

    matched = DISPLAY_NAME_PATTERN.match(document_name.strip())
    if not matched:
        return UNKNOWN_BIZ_FILE_ID, document_name

    return (
        matched.group("biz_file_id").strip() or UNKNOWN_BIZ_FILE_ID,
        matched.group("biz_file_name").strip() or UNKNOWN_BIZ_FILE_NAME,
    )


def clean_inline_references(answer: str) -> str:
    footnote_index: dict[str, int] = {}

    def replacer(match: re.Match[str]) -> str:
        token = match.group(0)
        if token not in footnote_index:
            footnote_index[token] = len(footnote_index) + 1
        return f"[^{footnote_index[token]}]"

    return INLINE_REFERENCE_REGEX.sub(replacer, answer)


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


def to_reference_result(raw_reference: Any) -> ReferenceResult:
    biz_file_id, biz_file_name = extract_biz_metadata(
        _read_value(raw_reference, "document_name", "docnm_kwd")
    )

    similarity_score = _read_value(raw_reference, "similarity") or 0.0
    return ReferenceResult(
        biz_file_id=biz_file_id,
        biz_file_name=biz_file_name,
        chunk_content=str(_read_value(raw_reference, "content", "content_with_weight") or ""),
        similarity_score=float(similarity_score),
    )
