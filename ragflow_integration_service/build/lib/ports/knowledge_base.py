from typing import Protocol

from app.dto.commands import (
    CreateDatasetCommand,
    ParseDocumentsCommand,
    RetrievalCommand,
    UploadDocumentCommand,
)
from app.dto.results import ChunkResult, DatasetResult, DocumentResult


class KnowledgeBasePort(Protocol):
    def create_dataset(self, command: CreateDatasetCommand) -> DatasetResult:
        ...

    def upload_documents(
        self, dataset_id: str, documents: list[UploadDocumentCommand]
    ) -> list[DocumentResult]:
        ...

    def parse_documents(self, command: ParseDocumentsCommand) -> None:
        ...

    def retrieve(self, command: RetrievalCommand) -> list[ChunkResult]:
        ...
