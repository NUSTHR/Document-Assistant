import mimetypes
from typing import Any

from app.adapters.ragflow.anti_corruption import (
    embed_biz_file_id,
    extract_biz_metadata,
)
from app.adapters.ragflow.client import RagflowHttpClient
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
    def __init__(self, client: RagflowHttpClient) -> None:
        self._client = client

    def upload_and_parse(
        self, command: UploadKnowledgeFileCommand
    ) -> FileIngestionResult:
        try:
            dataset = self._get_or_create_dataset(command.knowledge_base_name)
            dataset_id = str(dataset.get("id") or "")
            embedded_name = embed_biz_file_id(
                command.biz_file_id,
                command.biz_file_name,
            )
            upload_payload = self._client.upload(
                f"/datasets/{dataset_id}/documents",
                files=[("file", embedded_name, command.content)],
            )
            uploaded_documents = self._read_items(upload_payload, "documents")
            if not uploaded_documents:
                raise RagflowIntegrationError("ragflow returned no uploaded document")

            uploaded_document = uploaded_documents[0]
            document_id = str(uploaded_document.get("id") or "")
            self._client.post(
                f"/datasets/{dataset_id}/chunks",
                json_body={"document_ids": [document_id]},
            )
            refreshed_document = self._require_document(
                dataset_id=dataset_id,
                document_id=document_id,
            )
            return self._to_file_ingestion_result(
                knowledge_base_name=command.knowledge_base_name,
                document=refreshed_document,
            )
        except RagflowIntegrationError:
            raise
        except Exception as exc:
            raise RagflowIntegrationError("failed to upload and parse document") from exc

    def list_files(self, knowledge_base_name: str) -> list[FileIngestionResult]:
        try:
            dataset = self._find_dataset(knowledge_base_name)
            if dataset is None:
                return []

            documents: list[dict[str, Any]] = []
            page = 1
            page_size = 100
            while True:
                payload = self._client.get(
                    f"/datasets/{dataset['id']}/documents",
                    params={
                        "page": page,
                        "page_size": page_size,
                        "orderby": "create_time",
                        "desc": True,
                    },
                )
                current_page_documents = self._read_items(payload, "docs")
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
        except RagflowIntegrationError:
            raise
        except Exception as exc:
            raise RagflowIntegrationError("failed to list knowledge base files") from exc

    def get_file_detail(
        self, knowledge_base_name: str, biz_file_id: str
    ) -> KnowledgeFileDetailResult | None:
        try:
            dataset = self._find_dataset(knowledge_base_name)
            if dataset is None:
                return None

            document = self._find_document_by_biz_file_id(
                dataset_id=str(dataset.get("id") or ""),
                biz_file_id=biz_file_id,
            )
            if document is None:
                return None

            chunks_payload = self._client.get(
                f"/datasets/{dataset['id']}/documents/{document['id']}/chunks",
                params={
                    "page": 1,
                    "page_size": FILE_DETAIL_PREVIEW_CHUNK_LIMIT,
                },
            )
            chunks = self._read_items(chunks_payload, "chunks")
            return self._to_file_detail_result(
                knowledge_base_name=knowledge_base_name,
                document=document,
                chunks=chunks,
            )
        except RagflowIntegrationError:
            raise
        except Exception as exc:
            raise RagflowIntegrationError("failed to get knowledge file detail") from exc

    def get_file_content(
        self, knowledge_base_name: str, biz_file_id: str
    ) -> KnowledgeFileContentResult | None:
        try:
            dataset = self._find_dataset(knowledge_base_name)
            if dataset is None:
                return None

            document = self._find_document_by_biz_file_id(
                dataset_id=str(dataset.get("id") or ""),
                biz_file_id=biz_file_id,
            )
            if document is None:
                return None

            _, biz_file_name = extract_biz_metadata(str(document.get("name") or ""))
            file_content = self._client.download(
                f"/datasets/{dataset['id']}/documents/{document['id']}"
            )
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
        except RagflowIntegrationError:
            raise
        except Exception as exc:
            raise RagflowIntegrationError("failed to get knowledge file content") from exc

    def _get_or_create_dataset(self, knowledge_base_name: str) -> dict[str, Any]:
        dataset = self._find_dataset(knowledge_base_name)
        if dataset is not None:
            return dataset
        payload = self._client.post(
            "/datasets",
            json_body={"name": knowledge_base_name},
        )
        dataset_data = payload.get("data")
        if not isinstance(dataset_data, dict):
            raise RagflowIntegrationError("ragflow returned no created dataset")
        return dataset_data

    def _find_dataset(self, knowledge_base_name: str) -> dict[str, Any] | None:
        payload = self._client.get(
            "/datasets",
            params={
                "page": 1,
                "page_size": 100,
                "name": knowledge_base_name,
            },
        )
        datasets = self._read_items(payload, "datasets")
        if not datasets:
            return None
        return datasets[0]

    def _require_document(
        self,
        dataset_id: str,
        document_id: str,
    ) -> dict[str, Any]:
        payload = self._client.get(
            f"/datasets/{dataset_id}/documents",
            params={
                "page": 1,
                "page_size": 1,
                "id": document_id,
            },
        )
        documents = self._read_items(payload, "docs")
        if not documents:
            raise RagflowIntegrationError("uploaded document not found after parsing")
        return documents[0]

    def _find_document_by_biz_file_id(
        self,
        dataset_id: str,
        biz_file_id: str,
    ) -> dict[str, Any] | None:
        page = 1
        page_size = 100
        while True:
            payload = self._client.get(
                f"/datasets/{dataset_id}/documents",
                params={
                    "page": page,
                    "page_size": page_size,
                    "orderby": "create_time",
                    "desc": True,
                },
            )
            documents = self._read_items(payload, "docs")
            if not documents:
                return None

            for document in documents:
                matched_biz_file_id, _ = extract_biz_metadata(
                    str(document.get("name") or "")
                )
                if matched_biz_file_id == biz_file_id:
                    return document

            if len(documents) < page_size:
                return None
            page += 1

    def _to_file_ingestion_result(
        self,
        knowledge_base_name: str,
        document: dict[str, Any],
    ) -> FileIngestionResult:
        biz_file_id, biz_file_name = extract_biz_metadata(str(document.get("name") or ""))
        parse_status = (
            document.get("run")
            or document.get("status")
            or document.get("parser_status")
            or UNKNOWN_PARSE_STATUS
        )
        return FileIngestionResult(
            knowledge_base_name=knowledge_base_name,
            biz_file_id=biz_file_id,
            biz_file_name=biz_file_name,
            parse_status=str(parse_status),
            parse_message=self._extract_parse_message(document),
            chunk_count=int(document.get("chunk_count") or 0),
            token_count=int(document.get("token_count") or 0),
        )

    def _to_file_detail_result(
        self,
        knowledge_base_name: str,
        document: dict[str, Any],
        chunks: list[dict[str, Any]],
    ) -> KnowledgeFileDetailResult:
        ingestion_result = self._to_file_ingestion_result(
            knowledge_base_name=knowledge_base_name,
            document=document,
        )
        return KnowledgeFileDetailResult(
            knowledge_base_name=knowledge_base_name,
            biz_file_id=ingestion_result.biz_file_id,
            biz_file_name=ingestion_result.biz_file_name,
            parse_status=ingestion_result.parse_status,
            parse_message=ingestion_result.parse_message,
            chunk_count=ingestion_result.chunk_count,
            token_count=ingestion_result.token_count,
            chunks=[
                FileChunkPreviewResult(
                    sequence=index + 1,
                    content=str(chunk.get("content") or chunk.get("content_with_weight") or ""),
                )
                for index, chunk in enumerate(chunks)
            ],
        )

    def _read_items(self, payload: dict[str, Any], collection_key: str) -> list[dict[str, Any]]:
        data = payload.get("data")
        if isinstance(data, dict):
            items = data.get(collection_key, [])
        elif isinstance(data, list):
            items = data
        else:
            items = []
        return [item for item in items if isinstance(item, dict)]

    def _extract_parse_message(self, document: dict[str, Any]) -> str | None:
        raw_message = document.get("progress_msg") or document.get("process_msg")
        if raw_message is None:
            return None
        normalized_message = str(raw_message).strip()
        return normalized_message or None
