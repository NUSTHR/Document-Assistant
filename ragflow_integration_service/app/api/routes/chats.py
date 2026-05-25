import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.api.dependencies import get_conversation_service
from app.api.schemas import ChatReferenceResponse, ChatRequest, ChatResponse
from app.application.conversation_service import ConversationService
from app.core.constants import STREAM_CONTENT_TYPE
from app.dto.commands import StreamChatCommand


router = APIRouter(prefix="/api", tags=["chat"])
UNAVAILABLE_CHAT_ERROR_CODE = "RAGFLOW_CHAT_UNAVAILABLE"
CHAT_CONFIGURATION_ERROR_CODE = "RAGFLOW_CHAT_CONFIGURATION_ERROR"
CHAT_STREAM_ERROR_CODE = "RAGFLOW_CHAT_STREAM_ERROR"


def classify_chat_error(message: str) -> str:
    normalized_message = message.lower()
    if (
        "chat resource was not found" in normalized_message
        or (
            "chat assistant" in normalized_message
            and "no longer available" in normalized_message
        )
        or "no ragflow chat assistant is available" in normalized_message
    ):
        return UNAVAILABLE_CHAT_ERROR_CODE
    if "not bound to any knowledge base" in normalized_message:
        return CHAT_CONFIGURATION_ERROR_CODE
    return CHAT_STREAM_ERROR_CODE


def generate_chat_events(
    request: ChatRequest,
    service: ConversationService,
) -> Iterator[str]:
    try:
        for result in service.stream_chat(
            StreamChatCommand(
                assistant_name=request.assistant_name,
                question=request.question,
                biz_chat_id=request.biz_chat_id,
                biz_session_id=request.biz_session_id,
            )
        ):
            payload = ChatResponse(
                answer=result.answer,
                references=[
                    ChatReferenceResponse(**reference.model_dump())
                    for reference in result.references
                ],
                biz_session_id=result.biz_session_id,
                session_name=result.session_name,
            ).model_dump()
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    except RagflowIntegrationError as exc:
        error_message = str(exc)
        payload = ChatResponse(
            answer="",
            references=[],
            error_code=classify_chat_error(error_message),
            error_message=error_message,
        ).model_dump()
        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    except Exception as exc:
        error_message = str(exc)
        payload = ChatResponse(
            answer="",
            references=[],
            error_code=CHAT_STREAM_ERROR_CODE,
            error_message=error_message,
        ).model_dump()
        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    yield "event: done\ndata: [DONE]\n\n"


@router.post("/chat")
def stream_chat(
    request: ChatRequest,
    service: ConversationService = Depends(get_conversation_service),
) -> StreamingResponse:
    return StreamingResponse(
        generate_chat_events(request=request, service=service),
        media_type=STREAM_CONTENT_TYPE,
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/complete", response_model=ChatResponse)
def complete_chat(
    request: ChatRequest,
    service: ConversationService = Depends(get_conversation_service),
) -> ChatResponse:
    try:
        latest_response = ChatResponse(answer="", references=[])
        for result in service.stream_chat(
            StreamChatCommand(
                assistant_name=request.assistant_name,
                question=request.question,
                biz_chat_id=request.biz_chat_id,
                biz_session_id=request.biz_session_id,
            )
        ):
            latest_response = ChatResponse(
                answer=result.answer,
                references=[
                    ChatReferenceResponse(**reference.model_dump())
                    for reference in result.references
                ],
                biz_session_id=result.biz_session_id,
                session_name=result.session_name,
            )
        return latest_response
    except RagflowIntegrationError as exc:
        error_message = str(exc)
        return ChatResponse(
            answer="",
            references=[],
            error_code=classify_chat_error(error_message),
            error_message=error_message,
        )
    except Exception as exc:
        return ChatResponse(
            answer="",
            references=[],
            error_code=CHAT_STREAM_ERROR_CODE,
            error_message=str(exc),
        )
