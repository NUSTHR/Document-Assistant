from app.dto.commands import (
    CreateDatasetCommand,
    ParseDocumentsCommand,
    RetrievalCommand,
    UploadDocumentCommand,
)
from app.dto.results import ChunkResult, DatasetResult, DocumentResult
from app.ports.knowledge_base import KnowledgeBasePort


class KnowledgeBaseService:
    def __init__(self, port: KnowledgeBasePort) -> None:
        self._port = port

    def create_dataset(self, command: CreateDatasetCommand) -> DatasetResult:
        return self._port.create_dataset(command)

    def upload_documents(
        self, dataset_id: str, documents: list[UploadDocumentCommand]
    ) -> list[DocumentResult]:
        return self._port.upload_documents(dataset_id, documents)

    def parse_documents(self, command: ParseDocumentsCommand) -> None:
        self._port.parse_documents(command)

    def retrieve(self, command: RetrievalCommand) -> list[ChunkResult]:
        return self._port.retrieve(command)
