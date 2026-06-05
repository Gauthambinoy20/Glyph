"""Application settings.

All configuration lives here so the rest of the code never reads os.environ
directly. Every value has a safe default, so the app still boots with an empty
.env file (handy for the health check and for tests).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """The settings the app reads at runtime."""

    # Read a local .env file if present, ignore unknown keys, and allow names like
    # `model_cache_dir` (the `model_` prefix is otherwise reserved by pydantic).
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=())

    # Human readable app name, surfaced by the health endpoint.
    app_name: str = "Glyph"

    # Embeddings: local and free by default; switchable to OpenAI with one setting.
    embed_backend: str = "local"  # local | openai
    embed_model: str = "BAAI/bge-small-en-v1.5"
    model_cache_dir: str = ".model_cache"
    openai_api_key: str = ""

    # Where the vector store keeps its data on disk.
    chroma_dir: str = "chroma_db"

    # LLM (chat) via OpenRouter by default; all free, no card needed.
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-oss-120b:free"
    llm_fallback_model: str = "openai/gpt-oss-20b:free"
    app_url: str = "http://localhost:5173"

    # Browser origins allowed to call the API (the dev frontend, which may land on 5173 or
    # 5174 if the first port is taken). Override in .env for a deployed frontend origin.
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]


def get_settings() -> Settings:
    """Build and return the settings object."""
    return Settings()
