"""FastAPI application entry point.

Exposes the health check and the ingest endpoint. The embedder and vector store are
built once (cached) and injected as dependencies, so tests can swap in fakes.
"""

import time
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.embed.base import Embedder
from app.embed.factory import make_embedder
from app.ingest.pipeline import ingest_path, ingest_repo
from app.llm.catalog import is_known_model, list_models
from app.llm.client import LLMClient, LLMError
from app.obs.logging import log_query
from app.rag.prompt import build_messages, parse_citations
from app.retrieve.hybrid import HybridRetriever
from app.store.chroma_store import ChromaStore

# The single FastAPI application instance that the server runs.
app = FastAPI(title="Glyph API")


@lru_cache
def get_embedder() -> Embedder:
    """Build the embedder once and reuse it (loading the model is expensive)."""
    return make_embedder(get_settings())


@lru_cache
def get_store() -> ChromaStore:
    """Build the vector store once, sized to the embedder's vector length."""
    settings = get_settings()
    return ChromaStore(
        path=settings.chroma_dir,
        embed_model=settings.embed_model,
        dim=get_embedder().dim,
    )


@lru_cache
def get_llm() -> LLMClient:
    """Build the chat client once, pointed at OpenRouter by the settings."""
    settings = get_settings()
    return LLMClient(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        fallback_model=settings.llm_fallback_model,
        app_url=settings.app_url,
    )


class IngestRequest(BaseModel):
    """Body for /api/ingest: provide exactly one of repo_url or local_path."""

    repo_url: str | None = None
    local_path: str | None = None


class SearchRequest(BaseModel):
    """Body for /api/search: a question and how many chunks to return."""

    question: str
    top_k: int = 5


class AskRequest(BaseModel):
    """Body for /api/ask: a question, an optional model id, and how many chunks to use."""

    question: str
    model: str | None = None
    top_k: int = 5


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a simple ok status so callers can confirm the server is alive."""
    settings = get_settings()
    return {"status": "ok", "app": settings.app_name}


@app.post("/api/ingest")
def ingest(
    request: IngestRequest,
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Ingest a GitHub repo or a local folder into the searchable index.

    Returns counts of files and chunks. Bad input or a failed clone returns a 400.
    """
    try:
        if request.repo_url:
            return ingest_repo(request.repo_url, store, embedder)
        if request.local_path:
            return ingest_path(request.local_path, store, embedder)
    except ValueError as exc:
        # Bad URL, failed/timed-out clone, no supported files, or no chunks.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise HTTPException(status_code=400, detail="provide repo_url or local_path")


@app.post("/api/search")
def search(
    request: SearchRequest,
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Debug endpoint: return the chunks Glyph would use to answer (no AI involved yet)."""
    retriever = HybridRetriever(store, embedder)
    results = retriever.search(request.question, top_k=request.top_k)
    return {"question": request.question, "results": results}


@app.get("/api/models")
def models() -> dict:
    """List the selectable chat models and which are available (paid needs a key)."""
    settings = get_settings()
    has_paid_key = bool(settings.openai_api_key)
    return {"models": list_models(has_paid_key), "default": settings.llm_model}


@app.post("/api/ask")
def ask(
    request: AskRequest,
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    """Answer a question grounded in the repo's code, with file:line citations."""
    if request.model is not None and not is_known_model(request.model):
        raise HTTPException(status_code=400, detail=f"unknown model: {request.model}")

    # Retrieve the most relevant chunks, then ground the model in exactly those.
    chunks = HybridRetriever(store, embedder).search(request.question, top_k=request.top_k)
    system_prompt, user_prompt = build_messages(request.question, chunks)

    started = time.perf_counter()
    try:
        answer, token_usage = llm.complete(system_prompt, user_prompt, model=request.model)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    latency_ms = int((time.perf_counter() - started) * 1000)

    chunk_ids = [chunk["id"] for chunk in chunks]
    citations = parse_citations(answer, chunks)
    log_query(request.question, chunk_ids, latency_ms, token_usage)
    return {"answer": answer, "citations": citations, "retrieved_chunk_ids": chunk_ids}
