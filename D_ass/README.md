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

Start `ragflow_integration_service` first on `http://127.0.0.1:8081`, then run:

```powershell
npm install
npm run dev
```

The dev server is configured with a fixed port and host:

```text
http://127.0.0.1:5173
http://localhost:5173
```

## Build Check

```powershell
npm run build
```

## Backend Boundary

All RAGFlow HTTP API calls belong in `ragflow_integration_service`. The
frontend should call only project endpoints such as `/api/chat`,
`/api/ragflow/config`, `/api/ragflow/chats/{biz_chat_id}/sessions`, and
`/health`.
