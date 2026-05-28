# Documentation Assistant

Documentation Assistant is an independent Vue/Vite frontend plus FastAPI integration service for a local RAGFlow deployment.
It is not a direct modification of RAGFlow's `web/` application. The frontend talks to the integration service, and the integration service reuses RAGFlow authentication, chat, dataset, session, and knowledge-base APIs.

## Project Layout

- `D_ass/`: Vue 3 + Vite frontend.
- `ragflow_integration_service/`: FastAPI service that adapts RAGFlow APIs for the frontend.
- `docker-compose.ragflow-integration.yml`: local compose entry for the integration service.

## Required Services

Start RAGFlow first and make sure it is reachable at the URL configured in `ragflow_integration_service/.env`.
The current local setup expects:

- RAGFlow frontend/API: `http://127.0.0.1:8080`
- Integration service: `http://127.0.0.1:8081`
- Documentation Assistant frontend: `http://127.0.0.1:5173`

## Integration Service

```powershell
cd "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\ragflow_integration_service"
copy .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8081 --reload
```

Important configuration lives in `ragflow_integration_service/.env` and `ragflow_integration_service/config/default_chat_agent.json`.
Keep `RAGFLOW_ALLOW_SERVICE_API_KEY_FALLBACK=false` for normal user-facing operation so requests use the logged-in RAGFlow user's authorization.

## Frontend

```powershell
cd "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\D_ass"
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.
In development, Vite proxies `/api` and `/health` to the integration service on port `8081`.

## Verification

Run these before committing functional changes:

```powershell
cd "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\D_ass"
npm run lint
npm run build
npm run test

cd "C:\Users\96934\Desktop\Intertek project\Documentation Assistant\ragflow_integration_service"
.venv\Scripts\python -m ruff check app tests
.venv\Scripts\python -m pytest
```

## Engineering Rules

- Do not commit generated files such as `__pycache__/`, `.pyc`, `node_modules/`, `dist/`, `.venv/`, logs, or local request samples.
- Keep RAGFlow source code isolated from this project unless a change is intentionally made in the RAGFlow repository.
- Frontend code should keep view components, composables, API clients, and pure state helpers separated.
- Backend code should keep routes thin and put RAGFlow-specific behavior behind adapter modules.
- Secrets belong in `.env`; examples belong in `.env.example`.
- `npm run lint` includes a repository hygiene check that fails if generated or local-only files are tracked.
- Backend linting is configured with `ruff`; install the service with the `dev` extra before running it in a fresh environment.
