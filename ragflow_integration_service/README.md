# RAGFlow Integration Service

This service is the only anti-corruption layer between `D_ass` and RAGFlow.
The frontend must call this service only; it must never call RAGFlow directly.

## Boundaries

- RAGFlow capabilities are reused only through official RAGFlow HTTP APIs.
- `RAGFLOW_BASE_URL` and `RAGFLOW_API_KEY` are loaded from configuration.
- User login, registration, profile lookup, and logout are proxied to RAGFlow. This service does not create its own user table.
- Normal business requests must include the current user's RAGFlow `Authorization` header.
- RAGFlow physical IDs are not returned to the frontend. The API exposes business DTOs such as `biz_file_id`, `biz_chat_id`, `biz_session_id`, and `biz_knowledge_base_id`.
- Retrieval, parsing, embedding, storage, and generation remain RAGFlow responsibilities.
- The adapter layer may do only small pure transformations such as reference cleanup and DTO mapping.

## Main Endpoints

### `GET /api/auth/config`

Reads RAGFlow system login settings, including whether registration and password login are enabled.

### `POST /api/auth/login`

Forwards encrypted credentials to RAGFlow login and returns the RAGFlow
`Authorization` header plus the user profile.

### `POST /api/auth/register`

Creates a RAGFlow user through the RAGFlow user API and returns the RAGFlow
`Authorization` header plus the user profile. After successful registration,
the service also creates one default RAGFlow chat assistant for that new user.
The assistant is created without any selected knowledge base.

### `GET /api/auth/me`

Uses the caller's `Authorization` header to read the current RAGFlow profile.

### `POST /api/auth/logout`

Forwards logout to RAGFlow when an `Authorization` header is present.

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
- `RAGFLOW_IDENTITY_SECRET`

`RAGFLOW_BASE_URL` may be either the RAGFlow root URL or a URL ending in `/api/v1`; the adapter normalizes it before calling official HTTP endpoints.

For the local RAGFlow deployment used by this workspace, set:

```env
RAGFLOW_BASE_URL=http://127.0.0.1:8080
```

`RAGFLOW_API_KEY` is kept only for explicit service-level maintenance or
compatibility mode. Normal frontend traffic uses the logged-in user's
Authorization header. Keep this default:

```env
RAGFLOW_ALLOW_SERVICE_API_KEY_FALLBACK=false
```

Only set `RAGFLOW_ALLOW_SERVICE_API_KEY_FALLBACK=true` when you intentionally
want unauthenticated project requests to run as the configured service API key.
That mode is not recommended for multi-user use because it can make all browser
users see the same RAGFlow account's resources.

`RAGFLOW_IDENTITY_SECRET` must remain stable across user API-key rotation. It is
used to keep project-facing business IDs stable without tying those IDs to a
single RAGFlow user's API key.

## Default Agent for New Users

New registrations automatically create a RAGFlow chat assistant using this
project-local configuration file:

```text
C:\Users\96934\Desktop\Intertek project\Documentation Assistant\ragflow_integration_service\config\default_chat_agent.json
```

This file is the place to change cross-user defaults for newly registered users,
including:

- assistant name and description
- default model override, when `llm_id` is not `null`
- retrieval parameters: `similarity_threshold`, `vector_similarity_weight`, `top_k`, `top_n`
- rerank model
- prompt behavior: `system`, `empty_response`, `quote`, `refine_multiturn`

The default `dataset_ids` value is intentionally `[]`, so new users get an
assistant but no knowledge base is selected until they choose one in the
Documentation Assistant frontend.

You can point the service at another config file with:

```env
DEFAULT_CHAT_AGENT_CONFIG_PATH=C:\path\to\default_chat_agent.json
```

Leave `DEFAULT_CHAT_AGENT_CONFIG_PATH` empty to use the project-local default.

Use `http://host.docker.internal:8080` instead only when this integration service itself is running inside Docker.

Do not use the old `http://127.0.0.1:18080` value unless a separate RAGFlow instance is actually listening on that port.

## Setup

If `.venv` was created from a Python installation that no longer exists, commands may fail with `Unable to create process`. Recreate the virtual environment before starting the service:

```powershell
Set-Location "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\ragflow_integration_service"
Remove-Item -Recurse -Force .venv
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .
```

## MinerU and RAGFlow Runtime

MinerU is deployed as a separate project and must stay isolated from both this
service and the RAGFlow source tree:

```text
C:\Users\96934\Desktop\Intertek project\MinerU deployment
```

Current local MinerU choices:

- API mode: `mineru-api`
- Listen address: `http://127.0.0.1:8000`
- Backend: `pipeline`
- Model source: local ModelScope cache
- Model config: `C:\Users\96934\mineru.json`
- Model path: `C:\Users\96934\.cache\modelscope\hub\models\OpenDataLab\PDF-Extract-Kit-1___0`
- VLM preload: disabled

Start MinerU:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\96934\Desktop\Intertek project\MinerU deployment\start-mineru-api.ps1"
```

Check MinerU from Windows:

```powershell
curl.exe -sS -I "http://127.0.0.1:8000/openapi.json"
```

Open the local MinerU API documentation:

```text
http://127.0.0.1:8000/docs
```

Stop MinerU:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\96934\Desktop\Intertek project\MinerU deployment\stop-mineru-api.ps1"
```

MinerU logs are written outside this project:

```text
C:\Users\96934\Desktop\Intertek project\MinerU deployment\logs\mineru-api.out.log
C:\Users\96934\Desktop\Intertek project\MinerU deployment\logs\mineru-api.err.log
```

RAGFlow calls MinerU through the Docker host bridge. The RAGFlow Docker
environment must contain these values:

```env
MINERU_APISERVER=http://host.docker.internal:8000
MINERU_OUTPUT_DIR=/ragflow/logs/mineru-output
MINERU_DELETE_OUTPUT=0
MINERU_BACKEND=pipeline
```

After RAGFlow is running, confirm the RAGFlow container can reach MinerU. If the
container name is different, replace `docker-ragflow-cpu-1` with the active
RAGFlow container name from `docker ps`.

```powershell
docker exec docker-ragflow-cpu-1 python -c "import urllib.request; print(urllib.request.urlopen('http://host.docker.internal:8000/openapi.json', timeout=10).status)"
```

To use MinerU in RAGFlow, open `http://127.0.0.1:8080`, create or open a
knowledge base, set the parsing/layout recognition option to MinerU for PDF
documents, upload a PDF, and start parsing. RAGFlow owns the upload, parsing
job, chunks, embeddings, storage, and retrieval. This integration service only
talks to RAGFlow after RAGFlow has completed that work.

## Run

Start RAGFlow and MinerU first, then confirm RAGFlow is healthy:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:9380/api/v1/system/ping"
Invoke-RestMethod -Uri "http://127.0.0.1:9380/api/v1/system/healthz"
```

Then start this integration service:

```powershell
Set-Location "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\ragflow_integration_service"
.\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8081
```

Health and RAGFlow checks:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8081/health"
Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/auth/config"
```

## Local Quality Checks

Run these before committing backend changes:

```powershell
Set-Location "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\ragflow_integration_service"
.\.venv\Scripts\python -m compileall app
.\.venv\Scripts\python -m pytest
```

The tests include local-only regression coverage for RAGFlow session handling,
reference alignment, auth proxy mapping, and the Authorization boundary. They do
not require a running RAGFlow instance.

## Notes

- Port `8081` must be free before starting this service.
- Keep `RAGFLOW_API_KEY` in `.env`; do not put it in frontend configuration or browser code.
- The frontend calls this service through Vite's `/api` and `/health` proxy. Browser code should not call RAGFlow directly.
- `GET /api/ragflow/config`, chat, file, model, and session endpoints return `401` unless the request includes a valid RAGFlow `Authorization` header, unless service API-key fallback is deliberately enabled.
