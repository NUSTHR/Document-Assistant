from collections.abc import Iterator
from typing import Protocol

from app.dto.commands import StreamChatCommand
from app.dto.results import ChatStreamResult


class ConversationPort(Protocol):
    def stream_chat(self, command: StreamChatCommand) -> Iterator[ChatStreamResult]:
        ...
