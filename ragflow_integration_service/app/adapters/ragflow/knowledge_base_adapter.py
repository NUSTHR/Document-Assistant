import mimetypes

from ragflow_sdk import RAGFlow
from ragflow_sdk.modules.dataset import DataSet
from ragflow_sdk.modules.chunk import Chunk
from ragflow_sdk.modules.document import Document

from app.adapters.ragflow.anti_corruption import (
    embed_biz_file_id,
    extract_biz_metadata,
)
from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.core.constants import FILE_DETAIL_PREVIEW_CHUNK_LIMIT, UNKNOWN_PARSE_STATUS
from app.dto.commands import UploadKnowledgeFileCommand
from app.dto.results import (
    FileChunkPreviewResult,
    FileIngestionResult,
    KnowledgeFileContentResult,
    KnowledgeFileDetailResult,
)
from app.ports.knowledge_base import KnowledgeBasePort


class RagflowKnowledgeBaseAdapter(KnowledgeBasePort):
    def __init__(self, client: RAGFlow) -> None:
        self._client = client

    def upload_and_parse(
        self, command: UploadKnowledgeFileCommand
    ) -> FileIngestionResult:
        try:
            dataset = self._get_or_create_dataset(command.knowledge_base_name)
            embedded_name = embed_biz_file_id(
                command.biz_file_id,
                command.biz_file_name,
            )
            uploaded_documents = dataset.upload_documents(
                [{"display_name": embedded_name, "blob": command.content}]
            )
            if not uploaded_documents:
                raise RagflowIntegrationError("ragflow returned no uploaded document")

            uploaded_document = uploaded_documents[0]
            dataset.parse_documents([uploaded_document.id])

            refreshed_document = self._require_document(
                dataset=dataset,
                document_id=uploaded_document.id,
            )
            biz_file_id, biz_file_name = extract_biz_metadata(refreshed_document.name)
            parse_status = (
                refreshed_document.run
                or refreshed_document.status
                or UNKNOWN_PARSE_STATUS
            )
            return FileIngestionResult(
                knowledge_base_name=command.knowledge_base_name,
                biz_file_id=biz_file_id,
                biz_file_name=biz_file_name,
                parse_status=str(parse_status),
                parse_message=self._extract_parse_message(refreshed_document),
                chunk_count=int(getattr(refreshed_document, "chunk_count", 0) or 0),
                token_count=int(getattr(refreshed_document, "token_count", 0) or 0),
            )
        except Exception as exc:
            raise RagflowIntegrationError("failed to upload and parse document") from exc

    def list_files(self, knowledge_base_name: str) -> list[FileIngestionResult]:
        try:
            dataset = self._find_dataset(knowledge_base_name)
            if dataset is None:
                return []

            documents: list[Document] = []
            page = 1
            page_size = 100

            while True:
                current_page_documents = dataset.list_documents(
                    page=page,
                    page_size=page_size,
                )
                if not current_page_documents:
                    break

                documents.extend(current_page_documents)
                if len(current_page_documents) < page_size:
                    break
                page += 1

            return [
                self._to_file_ingestion_result(
                    knowledge_base_name=knowledge_base_name,
                    document=document,
                )
                for document in documents
            ]
        except Exception as exc:
            raise RagflowIntegrationError("failed to list knowledge base files") from exc

    def get_file_detail(
        self, knowledge_base_name: str, biz_file_id: str
    ) -> KnowledgeFileDetailResult | None:
        try:
            dataset = self._find_dataset(knowledge_base_name)
            if dataset is None:
                return None

            document = self._find_document_by_biz_file_id(dataset, biz_file_id)
            if document is None:
                return None

            chunks = document.list_chunks(
                page=1,
                page_size=FILE_DETAIL_PREVIEW_CHUNK_LIMIT,
            )
            return self._to_file_detail_result(
                knowledge_base_name=knowledge_base_name,
                document=document,
                chunks=chunks,
            )
        except Exception as exc:
            raise RagflowIntegrationError("failed to get knowledge file detail") from exc

    def get_file_content(
        self, knowledge_base_name: str, biz_file_id: str
    ) -> KnowledgeFileContentResult | None:
        try:
            dataset = self._find_dataset(knowledge_base_name)
            if dataset is None:
                return None

            document = self._find_document_by_biz_file_id(dataset, biz_file_id)
            if document is None:
                return None

            _, biz_file_name = extract_biz_metadata(document.name)
            file_content = document.download()
            media_type = (
                mimetypes.guess_type(biz_file_name)[0] or "application/octet-stream"
            )
            return KnowledgeFileContentResult(
                knowledge_base_name=knowledge_base_name,
                biz_file_id=biz_file_id,
                biz_file_name=biz_file_name,
                media_type=media_type,
                content=file_content,
            )
        except Exception as exc:
            raise RagflowIntegrationError("failed to get knowledge file content") from exc

    def _get_or_create_dataset(self, knowledge_base_name: str) -> DataSet:
        dataset = self._find_dataset(knowledge_base_name)
        if dataset is not None:
            return dataset
        return self._client.create_dataset(name=knowledge_base_name)

    def _find_dataset(self, knowledge_base_name: str) -> DataSet | None:
        try:
            datasets = self._client.list_datasets(name=knowledge_base_name)
        except Exception as exc:
            error_message = str(exc)
            if (
                "lacks permission for dataset" in error_message
                or "not found" in error_message.lower()
            ):
                return None
            raise

        if not datasets:
            return None
        return datasets[0]

    def _require_document(self, dataset: DataSet, document_id: str) -> Document:
        documents = dataset.list_documents(id=document_id)
        if not documents:
            raise RagflowIntegrationError("uploaded document not found after parsing")
        return documents[0]

    def _find_document_by_biz_file_id(
        self, dataset: DataSet, biz_file_id: str
    ) -> Document | None:
        page = 1
        page_size = 100

        while True:
            documents = dataset.list_documents(page=page, page_size=page_size)
            if not documents:
                return None

            for document in documents:
                matched_biz_file_id, _ = extract_biz_metadata(document.name)
                if matched_biz_file_id == biz_file_id:
                    return document

            if len(documents) < page_size:
                return None
            page += 1

    def _to_file_ingestion_result(
        self, knowledge_base_name: str, document: Document
    ) -> FileIngestionResult:
        biz_file_id, biz_file_name = extract_biz_metadata(document.name)
        parse_status = document.run or document.status or UNKNOWN_PARSE_STATUS
        return FileIngestionResult(
            knowledge_base_name=knowledge_base_name,
            biz_file_id=biz_file_id,
            biz_file_name=biz_file_name,
            parse_status=str(parse_status),
            parse_message=self._extract_parse_message(document),
            chunk_count=int(getattr(document, "chunk_count", 0) or 0),
            token_count=int(getattr(document, "token_count", 0) or 0),
        )

    def _to_file_detail_result(
        self,
        knowledge_base_name: str,
        document: Document,
        chunks: list[Chunk],
    ) -> KnowledgeFileDetailResult:
        biz_file_id, biz_file_name = extract_biz_metadata(document.name)
        parse_status = document.run or document.status or UNKNOWN_PARSE_STATUS
        return KnowledgeFileDetailResult(
            knowledge_base_name=knowledge_base_name,
            biz_file_id=biz_file_id,
            biz_file_name=biz_file_name,
            parse_status=str(parse_status),
            parse_message=self._extract_parse_message(document),
            chunk_count=int(getattr(document, "chunk_count", 0) or 0),
            token_count=int(getattr(document, "token_count", 0) or 0),
            chunks=[
                FileChunkPreviewResult(
                    sequence=index + 1,
                    content=str(getattr(chunk, "content", "")),
                )
                for index, chunk in enumerate(chunks)
            ],
        )

    def _extract_parse_message(self, document: Document) -> str | None:
        raw_message = getattr(document, "progress_msg", None)
        if raw_message is None:
            return None

        normalized_message = str(raw_message).strip()
        if not normalized_message:
            return None

        return normalized_message
