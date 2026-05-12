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


def generate_chat_events(
    request: ChatRequest,
    service: ConversationService,
) -> Iterator[str]:
    try:
        for result in service.stream_chat(
            StreamChatCommand(
                assistant_name=request.assistant_name,
                question=request.question,
                session_name=request.session_name,
            )
        ):
            payload = ChatResponse(
                answer=result.answer,
                references=[
                    ChatReferenceResponse(**reference.model_dump())
                    for reference in result.references
                ],
            ).model_dump()
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    except RagflowIntegrationError as exc:
        payload = ChatResponse(
            answer=f"ERROR: {exc}",
            references=[],
        ).model_dump()
        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    except Exception as exc:
        payload = ChatResponse(
            answer=f"ERROR: {exc}",
            references=[],
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
