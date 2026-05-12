from ragflow_sdk import RAGFlow

from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.adapters.ragflow.mappers import map_chunk, map_dataset, map_document
from app.dto.commands import (
    CreateDatasetCommand,
    ParseDocumentsCommand,
    RetrievalCommand,
    UploadDocumentCommand,
)
from app.dto.results import ChunkResult, DatasetResult, DocumentResult
from app.ports.knowledge_base import KnowledgeBasePort


class RagflowKnowledgeBaseAdapter(KnowledgeBasePort):
    def __init__(self, client: RAGFlow) -> None:
        self._client = client

    def create_dataset(self, command: CreateDatasetCommand) -> DatasetResult:
        try:
            dataset = self._client.create_dataset(
                name=command.name,
                description=command.description,
                embedding_model=command.embedding_model,
                chunk_method=command.chunk_method,
            )
            return map_dataset(dataset)
        except Exception as exc:
            raise RagflowIntegrationError("failed to create dataset") from exc

    def upload_documents(
        self, dataset_id: str, documents: list[UploadDocumentCommand]
    ) -> list[DocumentResult]:
        try:
            dataset = self._client.list_datasets(id=dataset_id)[0]
            uploaded = dataset.upload_documents(
                [
                    {"display_name": document.filename, "blob": document.content}
                    for document in documents
                ]
            )
            return [map_document(document) for document in uploaded]
        except Exception as exc:
            raise RagflowIntegrationError("failed to upload documents") from exc

    def parse_documents(self, command: ParseDocumentsCommand) -> None:
        try:
            dataset = self._client.list_datasets(id=command.dataset_id)[0]
            dataset.async_parse_documents(command.document_ids)
        except Exception as exc:
            raise RagflowIntegrationError("failed to parse documents") from exc

    def retrieve(self, command: RetrievalCommand) -> list[ChunkResult]:
        try:
            chunks = self._client.retrieve(
                question=command.question,
                dataset_ids=command.dataset_ids,
                document_ids=command.document_ids,
                page=command.page,
                page_size=command.page_size,
                similarity_threshold=command.similarity_threshold or 0.2,
                vector_similarity_weight=command.vector_similarity_weight or 0.3,
                top_k=command.top_k or 1024,
            )
            return [map_chunk(chunk) for chunk in chunks]
        except Exception as exc:
            raise RagflowIntegrationError("failed to retrieve chunks") from exc
