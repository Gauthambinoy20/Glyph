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

    # Embeddings: "static" (Model2Vec) is the default "fast mode" — ~100x faster ingest with the
    # same golden-set hit-rate (BM25 + the reranker recover the accuracy). "local" is the bge-small
    # transformer (higher raw semantic quality, far slower on CPU); "openai" swaps to a hosted
    # model. static_model is used only when embed_backend=static.
    embed_backend: str = "static"  # static | local | openai
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
    # Opt-in GPU for the "local" (bge-small) transformer embedder. Off by default and only worth
    # enabling on a CUDA host with onnxruntime-gpu installed; it falls back to CPU if unavailable.
    # No effect in the default "static" fast mode, which has no neural inference to accelerate.
    embed_use_gpu: bool = False

    # Two-stage retrieval. With reranker_enabled on, the hybrid retriever casts a wider net
    # (rerank_candidates chunks) and a cross-encoder reorders them by true relevance before the
    # top few reach the LLM. It scores only those candidates per question (~tens of ms, hidden
    # behind the model call) and never touches ingest. On by default: the golden set shows it
    # lifts top-1 accuracy 80%->90%. Set reranker_enabled=false to skip it; if the model cannot
    # load (e.g. offline first run) the app falls back to single-stage retrieval automatically.
    reranker_enabled: bool = True
    reranker_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"
    # A wide first-stage net matters most in fast (static-embedding) mode: the right file can sit
    # past rank 20, so the reranker never sees it. 60 candidates let the cross-encoder surface it
    # (verified: it recovers files fast mode missed at 20), while reranking stays cheap.
    rerank_candidates: int = 60

    # Relevance floor: refuse to answer (return "Not found in the provided code." without calling
    # the LLM) when the best reranked chunk scores below this. Only enforced when the cross-encoder
    # ran, because its score is a calibrated relevance logit; in single-stage mode the raw cosine
    # scores are not comparable across backends, so the strict prompt stays the only backstop.
    # Calibrated on real queries: specific questions score ~+1.5 to +7.4, but a broad-but-valid
    # "what does this project do" scores ~-7 (no single chunk answers it), while genuinely
    # off-topic asks ("weather in Paris") sit at ~-11. -9.0 answers real questions — including
    # vague overview ones — and still short-circuits only the clearly off-topic. Set to None to
    # disable. (-5.0 was too strict: it refused legitimate broad questions, the first ones asked.)
    relevance_floor: float | None = -9.0

    # LLM (chat) via OpenRouter by default; all free, no card needed.
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-oss-120b:free"
    llm_fallback_model: str = "openai/gpt-oss-20b:free"
    app_url: str = "http://localhost:5173"

    # Browser origins allowed to call the API (the dev frontend, which may land on 5173 or
    # 5174 if the first port is taken). Override in .env for a deployed frontend origin.
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    # Confine local-folder ingestion to this directory. None (default) allows any path,
    # which is fine for local dev. On a public deployment set it (e.g. /app) so a remote
    # caller cannot point /api/ingest at arbitrary server files like /etc.
    ingest_base_dir: str | None = None

    # Per-client request cap over a 60s window (0 disables). Protects a public deployment
    # from abuse and denial-of-service on the unauthenticated endpoints.
    rate_limit_per_minute: int = 60


def get_settings() -> Settings:
    """Build and return the settings object."""
    return Settings()
