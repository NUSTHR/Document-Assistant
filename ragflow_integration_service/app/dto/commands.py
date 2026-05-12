from pydantic import BaseModel, Field


class UploadKnowledgeFileCommand(BaseModel):
    knowledge_base_name: str = Field(min_length=1, max_length=128)
    biz_file_id: str = Field(min_length=1, max_length=128)
    biz_file_name: str = Field(min_length=1, max_length=255)
    content: bytes


class StreamChatCommand(BaseModel):
    assistant_name: str = Field(min_length=1, max_length=128)
    question: str = Field(min_length=1)
    session_name: str | None = Field(default=None, max_length=128)
