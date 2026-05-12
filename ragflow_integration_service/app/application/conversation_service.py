from collections.abc import Iterator

from app.dto.commands import StreamChatCommand
from app.dto.results import ChatStreamResult
from app.ports.conversation import ConversationPort


class ConversationService:
    def __init__(self, port: ConversationPort) -> None:
        self._port = port

    def stream_chat(self, command: StreamChatCommand) -> Iterator[ChatStreamResult]:
        return self._port.stream_chat(command)
