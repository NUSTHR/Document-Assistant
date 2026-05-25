# D_ass Frontend

This frontend is the local chat UI for the Documentation Assistant project. It
talks only to `ragflow_integration_service`; it must never call RAGFlow directly.

## Environment

Copy the local environment template before starting the dev server:

```powershell
Copy-Item .env.example .env
```

Default values:

```env
VITE_RAGFLOW_INTEGRATION_BASE_URL=
VITE_RAGFLOW_REQUEST_TIMEOUT_MS=10000
VITE_RAGFLOW_STREAM_CONNECT_TIMEOUT_MS=15000
```

`VITE_RAGFLOW_INTEGRATION_BASE_URL` is intentionally empty for local
development. Vite serves the UI on port `5173` and proxies same-origin `/api`
and `/health` requests to `http://127.0.0.1:8081`.

This keeps Chrome, Edge, Firefox, and other browsers on the same request model:
the browser calls the frontend origin, and the dev server forwards requests to
the integration service.

## Development

Start RAGFlow first, then start `ragflow_integration_service` on `http://127.0.0.1:8081`.

The integration service `.env` must point at the current local RAGFlow entry:

```env
RAGFLOW_BASE_URL=http://127.0.0.1:8080
```

After the backend health check passes, run:

```powershell
Set-Location "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\D_ass"
npm install
npm run dev
```

The dev server is configured with a fixed port and host:

```text
http://127.0.0.1:5173
http://localhost:5173
```

Proxy checks:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5173/health"
Invoke-RestMethod -Uri "http://127.0.0.1:5173/api/ragflow/config"
```

If either check fails, verify that RAGFlow is running on `8080/9380`, the integration service is running on `8081`, and port `5173` is not already occupied.

## Full Local Startup

Start services in this order:

1. RAGFlow Docker stack
2. MinerU API
3. `ragflow_integration_service`
4. `D_ass` frontend

RAGFlow should be available here:

```text
http://127.0.0.1:8080
http://127.0.0.1:9380
```

RAGFlow health checks:

```powershell
curl.exe -sS "http://127.0.0.1:9380/api/v1/system/ping"
curl.exe -sS "http://127.0.0.1:9380/api/v1/system/healthz"
```

Start MinerU from its isolated deployment directory:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\96934\Desktop\Intertek project\MinerU deployment\start-mineru-api.ps1"
curl.exe -sS -I "http://127.0.0.1:8000/openapi.json"
```

MinerU API docs:

```text
http://127.0.0.1:8000/docs
```

The local MinerU deployment uses the `pipeline` backend, local ModelScope
models, and no VLM preload. RAGFlow reaches it through
`http://host.docker.internal:8000`; browser and Windows-side checks use
`http://127.0.0.1:8000`.

Start the integration service:

```powershell
Set-Location "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\ragflow_integration_service"
.\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8081
```

Check the integration service:

```powershell
curl.exe -sS "http://127.0.0.1:8081/health"
curl.exe -sS "http://127.0.0.1:8081/api/ragflow/config"
```

Start the frontend:

```powershell
Set-Location "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\D_ass"
npm install
npm run dev
```

Open the app:

```text
http://127.0.0.1:5173
```

The frontend does not call MinerU or RAGFlow directly. It calls
`ragflow_integration_service` through Vite proxy routes such as `/api` and
`/health`; the integration service then calls RAGFlow.

## Login and Registration

The first screen is the Documentation Assistant login/register form. It uses
RAGFlow's own account system through `ragflow_integration_service`:

- Sign in calls `POST /api/auth/login`, which forwards to RAGFlow.
- Registration calls `POST /api/auth/register`, which forwards to RAGFlow user creation.
- Passwords are encrypted in the browser with the same RSA public key workflow used by the RAGFlow frontend.
- The browser stores only the RAGFlow `Authorization` value and the returned user profile in `localStorage`.
- After login, every assistant, dataset, file, session, and chat request carries the current user's RAGFlow `Authorization` header.

The frontend still calls only local project routes. It does not connect directly
to `http://127.0.0.1:8080` or `http://127.0.0.1:9380`.

When switching RAGFlow users, use the app's Sign out action and then sign in
again. A different user sees only the assistants, knowledge bases, sessions, and
permissions available to that RAGFlow account.

New registrations automatically get one RAGFlow chat Agent named
`Documentation Assistant`. It is created in that new RAGFlow user account with
no knowledge base selected. Cross-user defaults for newly created Agents are not
stored in the frontend; update them in:

```text
C:\Users\96934\Desktop\Intertek project\Documentation Assistant\ragflow_integration_service\config\default_chat_agent.json
```

## Agent Configuration

After signing in, open `Agent Config` from the desktop sidebar or `Agent` from
the mobile bottom navigation. This panel controls the selected RAGFlow chat
Agent through the integration service:

- assistant selection
- knowledge base selection
- model selection
- similarity threshold
- vector similarity weight
- `top_k` and `top_n`
- rerank model
- citation/quote switch
- system prompt and empty-response text

Saving this panel calls `PUT /api/ragflow/chats/config`. The frontend updates
only the selected Agent; it does not create or modify knowledge bases directly
from this panel.

## Build Check

```powershell
npm run build
```

## Local Quality Checks

Run these before committing frontend changes:

```powershell
npm run typecheck
npm run test
npm run build
```

`npm run check` combines the TypeScript/Vue type check and the lightweight
Node-based regression tests. `npm run build` remains the full production build
verification.

## Backend Boundary

All RAGFlow HTTP API calls belong in `ragflow_integration_service`. The
frontend should call only project endpoints such as `/api/chat`,
`/api/ragflow/config`, `/api/ragflow/chats/{biz_chat_id}/sessions`, and
`/health`.
