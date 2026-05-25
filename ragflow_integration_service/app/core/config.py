from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ragflow-integration-service"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8081
    app_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    ragflow_base_url: str
    ragflow_api_key: str
    ragflow_identity_secret: str = ""
    ragflow_allow_service_api_key_fallback: bool = False
    ragflow_timeout_seconds: int = 60
    default_chat_agent_config_path: str = ""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

