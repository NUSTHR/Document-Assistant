# RAGFlow Integration Service

This service is the only anti-corruption layer between `D_ass` and RAGFlow.
The frontend must call this service only; it must never call RAGFlow directly.

## Boundaries

- RAGFlow capabilities are reused only through official RAGFlow HTTP APIs.
- `RAGFLOW_BASE_URL` and `RAGFLOW_API_KEY` are loaded from configuration.
- RAGFlow physical IDs are not returned to the frontend. The API exposes business DTOs such as `biz_file_id`, `biz_chat_id`, `biz_session_id`, and `biz_knowledge_base_id`.
- Retrieval, parsing, embedding, storage, and generation remain RAGFlow responsibilities.
- The adapter layer may do only small pure transformations such as reference cleanup and DTO mapping.

## Main Endpoints

### `GET /api/ragflow/config`

Lists RAGFlow datasets and chat assistants as frontend-safe DTOs.

### `PUT /api/ragflow/chats/config`

Updates a RAGFlow chat assistant through the HTTP adapter. Request fields use business IDs:

```json
{
  "biz_chat_id": "chat_xxx",
  "biz_knowledge_base_ids": ["kb_xxx"],
  "llm_id": "model-name",
  "similarity_threshold": 0.2,
  "vector_similarity_weight": 0.3,
  "top_k": 1024,
  "top_n": 8,
  "quote": true
}
```

### `GET /api/ragflow/chats/{biz_chat_id}/sessions`

Lists chat sessions with `biz_session_id` and cleaned message content.

### `POST /api/files`

Uploads a file to a named RAGFlow dataset and starts parsing through RAGFlow HTTP APIs.
The adapter embeds the project `biz_file_id` into the document display name, then strips RAGFlow physical IDs from responses.

### `POST /api/chat`

Streams a model response through Server-Sent Events:

```json
{
  "assistant_name": "Standard Assistant",
  "question": "Summarize the uploaded document",
  "biz_session_id": "session_xxx"
}
```

Each event has this shape:

```json
{
  "answer": "Answer text [^1]",
  "references": [
    {
      "biz_file_id": "FILE-10293",
      "biz_file_name": "report.pdf",
      "chunk_content": "Matched chunk text",
      "similarity_score": 0.92
    }
  ]
}
```

## Environment

Copy the template:

```powershell
Copy-Item .env.example .env
```

Required values:

- `RAGFLOW_BASE_URL`
- `RAGFLOW_API_KEY`

`RAGFLOW_BASE_URL` may be either the RAGFlow root URL or a URL ending in `/api/v1`; the adapter normalizes it before calling official HTTP endpoints.

## Run

```powershell
Set-Location "C:\Users\96934\Desktop\Documentation Assistant\ragflow_integration_service"
.\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8081
```

Health check:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8081/health"
```
