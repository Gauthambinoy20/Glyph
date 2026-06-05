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

    # Embeddings: local and free by default. "openai" swaps to a hosted model; "static" uses
    # Model2Vec for ~100x faster ingest (the "fast mode"), trading some accuracy that the
    # reranker + BM25 largely recover. static_model is used only when embed_backend=static.
    embed_backend: str = "local"  # local | openai | static
    embed_model: str = "BAAI/bge-small-en-v1.5"
    static_model: str = "minishlab/potion-base-8M"
    model_cache_dir: str = ".model_cache"
    openai_api_key: str = ""

    # Where the vector store keeps its data on disk.
    chroma_dir: str = "chroma_db"

    # SQLite file for chat history (sessions + messages); created on first use.
    db_path: str = "glyph_history.db"

    # Embedding throughput knobs. embed_threads=0 means "auto": use the CPU cores, but capped
    # at 8 so a many-core box does not oversubscribe ONNX and stall the first batch. Set it
    # >0 to pin an exact count. A bigger batch reduces per-call overhead during ingest.
    embed_threads: int = 0
    embed_batch_size: int = 256

    # Two-stage retrieval. With reranker_enabled on, the hybrid retriever casts a wider net
    # (rerank_candidates chunks) and a cross-encoder reorders them by true relevance before the
    # top few reach the LLM. It scores only those candidates per question (~tens of ms, hidden
    # behind the model call) and never touches ingest. Off by default until the golden-set eval
    # confirms the lift; turn it on for the sharper, two-stage answers.
    reranker_enabled: bool = False
    reranker_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"
    rerank_candidates: int = 20

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
