from typing import Protocol

from app.dto.commands import UploadKnowledgeFileCommand
from app.dto.results import (
    FileIngestionResult,
    KnowledgeFileContentResult,
    KnowledgeFileDetailResult,
)


class KnowledgeBasePort(Protocol):
    def upload_and_parse(
        self, command: UploadKnowledgeFileCommand
    ) -> FileIngestionResult:
        ...

    def list_files(self, knowledge_base_name: str) -> list[FileIngestionResult]:
        ...

    def get_file_detail(
        self, knowledge_base_name: str, biz_file_id: str
    ) -> KnowledgeFileDetailResult | None:
        ...

    def get_file_content(
        self, knowledge_base_name: str, biz_file_id: str
    ) -> KnowledgeFileContentResult | None:
        ...
