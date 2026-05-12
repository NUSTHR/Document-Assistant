from typing import Protocol

from app.dto.commands import CreateChatCommand, CreateSessionCommand, CompleteChatCommand
from app.dto.results import ChatResult, CompletionResult, SessionResult


class ConversationPort(Protocol):
    def create_chat(self, command: CreateChatCommand) -> ChatResult:
        ...

    def create_session(self, command: CreateSessionCommand) -> SessionResult:
        ...

    def complete(self, command: CompleteChatCommand) -> CompletionResult:
        ...
