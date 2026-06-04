"""FastAPI application entry point.

Exposes the health check and the ingest endpoint. The embedder and vector store are
built once (cached) and injected as dependencies, so tests can swap in fakes.
"""

from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.embed.base import Embedder
from app.embed.factory import make_embedder
from app.ingest.pipeline import ingest_path, ingest_repo
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


class IngestRequest(BaseModel):
    """Body for /api/ingest: provide exactly one of repo_url or local_path."""

    repo_url: str | None = None
    local_path: str | None = None


class SearchRequest(BaseModel):
    """Body for /api/search: a question and how many chunks to return."""

    question: str
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
