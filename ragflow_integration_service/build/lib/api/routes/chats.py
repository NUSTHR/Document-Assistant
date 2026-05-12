from fastapi import APIRouter, Depends

from app.api.dependencies import get_conversation_service
from app.api.schemas import (
    ChatResponse,
    CompletionRequest,
    CompletionResponse,
    CreateChatRequest,
    CreateSessionRequest,
    SessionResponse,
)
from app.application.conversation_service import ConversationService
from app.dto.commands import (
    ChatMessageCommand,
    CompleteChatCommand,
    CreateChatCommand,
    CreateSessionCommand,
)


router = APIRouter(tags=["chats"])


@router.post("/assistants", response_model=ChatResponse)
def create_chat(
    request: CreateChatRequest,
    service: ConversationService = Depends(get_conversation_service),
) -> ChatResponse:
    result = service.create_chat(
        CreateChatCommand(
            name=request.name,
            dataset_ids=request.dataset_ids,
            llm_id=request.llm_id,
        )
    )
    return ChatResponse(id=result.id, name=result.name)


@router.post("/sessions", response_model=SessionResponse)
def create_session(
    request: CreateSessionRequest,
    service: ConversationService = Depends(get_conversation_service),
) -> SessionResponse:
    result = service.create_session(
        CreateSessionCommand(
            chat_id=request.chat_id,
            name=request.name,
            user_id=request.user_id,
        )
    )
    return SessionResponse(id=result.id, name=result.name, chat_id=result.chat_id)


@router.post("/completions", response_model=CompletionResponse)
def complete(
    request: CompletionRequest,
    service: ConversationService = Depends(get_conversation_service),
) -> CompletionResponse:
    result = service.complete(
        CompleteChatCommand(
            chat_id=request.chat_id,
            session_id=request.session_id,
            stream=request.stream,
            messages=[
                ChatMessageCommand(role=message.role, content=message.content)
                for message in request.messages
            ],
        )
    )
    return CompletionResponse(
        answer=result.answer,
        session_id=result.session_id,
        reference=result.reference,
    )
