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


def get_settings() -> Settings:
    """Build and return the settings object."""
    return Settings()
