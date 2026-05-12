from ragflow_sdk import RAGFlow

from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.adapters.ragflow.mappers import map_chat, map_completion, map_session
from app.dto.commands import CreateChatCommand, CreateSessionCommand, CompleteChatCommand
from app.dto.results import ChatResult, CompletionResult, SessionResult
from app.ports.conversation import ConversationPort


class RagflowConversationAdapter(ConversationPort):
    def __init__(self, client: RAGFlow) -> None:
        self._client = client

    def create_chat(self, command: CreateChatCommand) -> ChatResult:
        try:
            chat = self._client.create_chat(
                name=command.name,
                dataset_ids=command.dataset_ids,
                llm_id=command.llm_id,
            )
            return map_chat(chat)
        except Exception as exc:
            raise RagflowIntegrationError("failed to create chat assistant") from exc

    def create_session(self, command: CreateSessionCommand) -> SessionResult:
        try:
            chat = self._client.list_chats(id=command.chat_id)[0]
            session = chat.create_session(name=command.name)
            return map_session(session)
        except Exception as exc:
            raise RagflowIntegrationError("failed to create session") from exc

    def complete(self, command: CompleteChatCommand) -> CompletionResult:
        try:
            if not command.chat_id:
                raise RagflowIntegrationError("chat_id is required for completion")

            chat = self._client.list_chats(id=command.chat_id)[0]
            session = None
            if command.session_id:
                session = chat.list_sessions(id=command.session_id)[0]
            else:
                session = chat.create_session()

            question = ""
            for message in reversed(command.messages):
                if message.role == "user":
                    question = message.content
                    break

            if not question:
                raise RagflowIntegrationError("at least one user message is required")

            answer = session.ask(question=question, stream=command.stream)
            if command.stream:
                raise RagflowIntegrationError("stream mode is not exposed in this version")
            return map_completion(answer)
        except RagflowIntegrationError:
            raise
        except Exception as exc:
            raise RagflowIntegrationError("failed to complete chat") from exc
