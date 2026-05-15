import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.api.schemas import ErrorResponse
from app.api.routes import chats, health, knowledge_bases, ragflow_config
from app.core.constants import DEFAULT_ERROR_STATUS_CODE
from app.core.config import get_settings


settings = get_settings()
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.app_cors_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RagflowIntegrationError)
async def handle_ragflow_error(
    _request: Request, exc: RagflowIntegrationError
) -> JSONResponse:
    error_response = ErrorResponse(detail=str(exc))
    return JSONResponse(
        status_code=DEFAULT_ERROR_STATUS_CODE,
        content=error_response.model_dump(),
    )


@app.exception_handler(HTTPException)
async def handle_http_error(request: Request, exc: HTTPException) -> JSONResponse:
    return await http_exception_handler(request, exc)


@app.exception_handler(Exception)
async def handle_unexpected_error(
    _request: Request, exc: Exception
) -> JSONResponse:
    logger.exception("unhandled application error", exc_info=exc)
    error_response = ErrorResponse(detail="internal server error")
    return JSONResponse(
        status_code=500,
        content=error_response.model_dump(),
    )


app.include_router(health.router)
app.include_router(knowledge_bases.router)
app.include_router(chats.router)
app.include_router(ragflow_config.router)
