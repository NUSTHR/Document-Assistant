from app.dto.commands import CreateChatCommand, CreateSessionCommand, CompleteChatCommand
from app.dto.results import ChatResult, CompletionResult, SessionResult
from app.ports.conversation import ConversationPort


class ConversationService:
    def __init__(self, port: ConversationPort) -> None:
        self._port = port

    def create_chat(self, command: CreateChatCommand) -> ChatResult:
        return self._port.create_chat(command)

    def create_session(self, command: CreateSessionCommand) -> SessionResult:
        return self._port.create_session(command)

    def complete(self, command: CompleteChatCommand) -> CompletionResult:
        return self._port.complete(command)
