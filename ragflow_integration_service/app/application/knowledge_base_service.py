from app.dto.commands import UploadKnowledgeFileCommand
from app.dto.results import (
    FileIngestionResult,
    KnowledgeFileContentResult,
    KnowledgeFileDetailResult,
)
from app.ports.knowledge_base import KnowledgeBasePort


class KnowledgeBaseService:
    def __init__(self, port: KnowledgeBasePort) -> None:
        self._port = port

    def upload_and_parse(
        self, command: UploadKnowledgeFileCommand
    ) -> FileIngestionResult:
        return self._port.upload_and_parse(command)

    def list_files(self, knowledge_base_name: str) -> list[FileIngestionResult]:
        return self._port.list_files(knowledge_base_name)

    def get_file_detail(
        self, knowledge_base_name: str, biz_file_id: str
    ) -> KnowledgeFileDetailResult | None:
        return self._port.get_file_detail(knowledge_base_name, biz_file_id)

    def get_file_content(
        self, knowledge_base_name: str, biz_file_id: str
    ) -> KnowledgeFileContentResult | None:
        return self._port.get_file_content(knowledge_base_name, biz_file_id)
