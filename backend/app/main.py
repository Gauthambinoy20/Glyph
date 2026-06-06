"""FastAPI application entry point.

Exposes the health check and the ingest endpoint. The embedder and vector store are
built once (cached) and injected as dependencies, so tests can swap in fakes.
"""

import json
import logging
import threading
import time
import uuid
from collections import defaultdict, deque
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, field_validator

from app.analyze.endpoints import detect_endpoints
from app.analyze.files import read_indexed_file
from app.analyze.graph import build_import_graph
from app.analyze.stack import detect_stack
from app.analyze.stats import build_stats
from app.analyze.symbols import list_symbols
from app.config import Settings, get_settings
from app.db.history import History
from app.embed.base import Embedder
from app.embed.factory import effective_embed_model, make_embedder
from app.ingest.pipeline import (
    ingest_path,
    ingest_path_events,
    ingest_repo,
    ingest_repo_events,
)
from app.ingest.walker import ensure_path_allowed
from app.llm.catalog import is_known_model, list_models
from app.llm.client import LLMClient, LLMError
from app.obs.logging import log_query
from app.obs.metrics import snapshot as metrics_snapshot
from app.rag.cache import answer_cache
from app.rag.overview import build_overview
from app.rag.prompt import build_messages, parse_citations
from app.rerank.base import Reranker
from app.rerank.factory import make_reranker
from app.retrieve.hybrid import HybridRetriever
from app.retrieve.two_stage import two_stage_search
from app.store.chroma_store import ChromaStore

logger = logging.getLogger("glyph")

# Holds the current request's id so the error handler can stamp it even when the request
# object is not handy. Set per request by the middleware below.
_request_id: ContextVar[str] = ContextVar("request_id", default="")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Warm the embedding model at startup so the first question is not a cold-load hit.

    Best-effort: if warmup fails the model still loads lazily on first use. (Tests drive the
    app without entering the lifespan, so this never forces a real model download in CI.)
    """
    try:
        # Construct the model AND run one real embed, so ONNX does its graph optimization now
        # instead of on the user's first ingest batch — that cold first batch is exactly what
        # made "Embedding & indexing" sit at 0 for several seconds before moving.
        get_embedder().embed_documents(["def warmup() -> int: return 0"])
        # Build the reranker now too (best-effort), so the first answer isn't a cold model load.
        get_reranker()
    except Exception:  # noqa: BLE001 - warmup must never stop the server from starting
        logger.exception("warmup failed; models will load on first use")
    yield


# The single FastAPI application instance that the server runs.
app = FastAPI(title="Glyph API", lifespan=lifespan)

# Lock cross-origin access to the known frontend origins (a browser will block others).
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# ---- Simple in-memory per-client rate limiting ----
# A fixed 60s window keyed by client IP. In-memory is fine for the single-box deployment;
# a multi-instance setup would move this to a shared store (e.g. Redis).
_RATE_WINDOW_S = 60.0
_rate_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Return the best-effort real client IP.

    nginx sets X-Real-IP from the connection (unspoofable behind our proxy); fall back to
    the direct peer for local and dev use.
    """
    return request.headers.get("x-real-ip") or (
        request.client.host if request.client else "unknown"
    )


@app.middleware("http")
async def rate_limit(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Cap requests per client IP over a rolling 60s window.

    Health checks are exempt so uptime probes are never throttled; a limit of 0 disables
    the check entirely.
    """
    limit = get_settings().rate_limit_per_minute
    path = request.url.path
    if limit > 0 and path.startswith("/api/") and path != "/api/health":
        ip = _client_ip(request)
        now = time.monotonic()
        hits = _rate_hits[ip]
        while hits and now - hits[0] > _RATE_WINDOW_S:
            hits.popleft()
        if len(hits) >= limit:
            return JSONResponse({"detail": "rate limit exceeded, slow down"}, status_code=429)
        hits.append(now)
    return await call_next(request)


@app.middleware("http")
async def add_request_id(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Tag every request with a short id, echoed back in the X-Request-ID header.

    The id ties a client-visible response to its server logs, so an error a user reports
    can be found in the logs without exposing any internal detail to them.
    """
    request_id = uuid.uuid4().hex[:12]
    _request_id.set(request_id)
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Turn any unhandled error into a clean 500: generic message out, full detail in logs.

    Known, expected failures already raise HTTPException with a helpful message; this only
    catches the truly unexpected, so we never leak a stack trace or internals to the client.
    """
    request_id = getattr(request.state, "request_id", "") or _request_id.get()
    logger.exception("unhandled error (request_id=%s): %s", request_id, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "internal server error", "request_id": request_id},
        headers={"X-Request-ID": request_id},
    )


# The embedding backend currently in use. Each backend keeps its OWN embedder and its OWN Chroma
# collection (keyed by model + dim), so their indexes never mix. The *active* backend, however, is
# a single process-wide value: Glyph holds one active repo at a time, so /api/mode switches it for
# the whole process — it is NOT isolated per client. Concurrent multi-user mode switching is out of
# scope (single-worker deployment; see TECHNICAL_REPORT §6). The lock below only guards the lazy
# build of each backend's embedder/store so concurrent requests can't double-build or race the
# dict/Chroma collection.
_active_backend: str | None = None
_backend_lock = threading.RLock()

# Friendly names the UI uses, mapped to the internal embed_backend values.
_MODE_TO_BACKEND = {"fast": "static", "careful": "local"}


def set_active_backend(mode_or_backend: str) -> None:
    """Switch the embedding backend used by ingest and every read that follows it."""
    global _active_backend
    with _backend_lock:
        _active_backend = _MODE_TO_BACKEND.get(mode_or_backend, mode_or_backend)


def _active_settings() -> Settings:
    """Return settings with embed_backend set to the active backend (or the configured default)."""
    settings = get_settings()
    backend = _active_backend or settings.embed_backend
    return settings.model_copy(update={"embed_backend": backend})


# One embedder and one store per backend, built lazily and reused (loading a model is expensive).
_embedders: dict[str, Embedder] = {}
_stores: dict[str, ChromaStore] = {}


def get_embedder() -> Embedder:
    """Return the embedder for the active backend, building it once per backend (thread-safe)."""
    settings = _active_settings()
    with _backend_lock:
        if settings.embed_backend not in _embedders:
            _embedders[settings.embed_backend] = make_embedder(settings)
        return _embedders[settings.embed_backend]


def get_store() -> ChromaStore:
    """Return the vector store for the active backend, built once per backend (thread-safe)."""
    settings = _active_settings()
    with _backend_lock:
        if settings.embed_backend not in _stores:
            _stores[settings.embed_backend] = ChromaStore(
                path=settings.chroma_dir,
                embed_model=effective_embed_model(settings),
                dim=get_embedder().dim,
            )
        return _stores[settings.embed_backend]


# The repo currently loaded into each backend's store. Ingesting a *different* repo wipes the
# store first, so every answer is grounded only in the repo on screen (no cross-repo bleed);
# re-ingesting the same repo skips the reset and keeps its content-hash cache.
_loaded_source: dict[str, str] = {}


def _switch_repo(store: ChromaStore, source: str) -> None:
    """Reset the store before ingesting a different repo than the one it currently holds."""
    backend = _active_settings().embed_backend
    if _loaded_source.get(backend) != source:
        store.reset()
        _loaded_source[backend] = source


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


@lru_cache
def get_history() -> History:
    """Build the chat-history store once (SQLite file from settings)."""
    return History(get_settings().db_path)


@lru_cache
def get_reranker() -> Reranker | None:
    """Build the reranker once, or None when reranking is disabled in settings.

    Best-effort: if the cross-encoder model cannot load (for example, an offline first run),
    fall back to single-stage retrieval rather than failing every question.
    """
    try:
        return make_reranker(get_settings())
    except Exception:  # noqa: BLE001 - reranker setup must never break answering
        logger.exception("reranker setup failed; falling back to single-stage retrieval")
        return None


class IngestRequest(BaseModel):
    """Body for /api/ingest: provide exactly one of repo_url or local_path."""

    repo_url: str | None = None
    local_path: str | None = None


class SearchRequest(BaseModel):
    """Body for /api/search: a question and how many chunks to return."""

    question: str
    top_k: int = 5


class HistorySaveRequest(BaseModel):
    """Body for POST /api/history: save a session's whole conversation."""

    repo: str = ""
    messages: list[dict] = []
    session_id: str | None = None


class Turn(BaseModel):
    """One earlier question/answer pair, for conversational follow-ups."""

    question: str
    answer: str


class AskRequest(BaseModel):
    """Body for /api/ask: a question, an optional model id, top_k, prior turns, rerank toggle."""

    question: str
    model: str | None = None
    top_k: int = 5
    history: list[Turn] = []
    # Per-question control of the cross-encoder reranker. None = use the server default (on);
    # False = skip it for this question (a hair faster); True = use it when one is available.
    rerank: bool | None = None

    @field_validator("question")
    @classmethod
    def _question_not_blank(cls, value: str) -> str:
        """Reject an empty or whitespace-only question (FastAPI returns 422) and trim it."""
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("question must not be empty")
        return trimmed


class ModeRequest(BaseModel):
    """Body for /api/mode: choose the embedding backend for the next ingest and the reads after."""

    mode: str  # "fast" | "careful" (or the raw "static" | "local")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a simple ok status so callers can confirm the server is alive."""
    settings = get_settings()
    return {"status": "ok", "app": settings.app_name}


@app.get("/api/ready")
def ready(
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Readiness probe: 200 once the embedding model and vector store are loaded.

    Unlike /api/health (is the process up?), this forces the heavy dependencies to build,
    so a 200 means the app can actually answer; it also reports how many chunks are indexed.
    """
    return {
        "ready": True,
        "embed_model": effective_embed_model(_active_settings()),
        "backend": _active_settings().embed_backend,
        "dim": embedder.dim,
        "chunks": store.count(),
    }


@app.post("/api/mode")
def set_mode(request: ModeRequest) -> dict:
    """Pick the embedding backend: 'fast' (Model2Vec) or 'careful' (the transformer).

    This decides how the *next* ingest files the repo, and which index later questions read
    from. It does not re-index an already-loaded repo — load a repo after switching to use it.
    """
    if request.mode not in {"fast", "careful", "static", "local"}:
        raise HTTPException(status_code=400, detail=f"unknown mode: {request.mode}")
    set_active_backend(request.mode)
    return {"mode": request.mode, "backend": _active_settings().embed_backend}


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
            _switch_repo(store, request.repo_url)
            return ingest_repo(request.repo_url, store, embedder)
        if request.local_path:
            ensure_path_allowed(request.local_path, get_settings().ingest_base_dir)
            _switch_repo(store, request.local_path)
            return ingest_path(request.local_path, store, embedder)
    except ValueError as exc:
        # Bad URL, failed/timed-out clone, no supported files, or no chunks.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise HTTPException(status_code=400, detail="provide repo_url or local_path")


@app.post("/api/ingest/stream")
def ingest_stream(
    request: IngestRequest,
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> StreamingResponse:
    """Ingest a repo or folder, streaming one progress event per stage over SSE.

    Emits the pipeline's stage events (`walk`, `chunk`, `embed` with running counts, then
    `done` with the final summary). Bad input is rejected up front with a 400; a failure
    that only surfaces once streaming has started (a failed/timed-out clone, no supported
    files, no chunks) is delivered as a final `{"stage":"error","detail":...}` message,
    since the 200 response headers have already been sent.
    """
    if not request.repo_url and not request.local_path:
        raise HTTPException(status_code=400, detail="provide repo_url or local_path")
    if request.local_path:
        try:
            ensure_path_allowed(request.local_path, get_settings().ingest_base_dir)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    def events() -> Iterator[str]:
        """Drive the ingest event stream and translate each step into an SSE message."""
        try:
            if request.repo_url:
                _switch_repo(store, request.repo_url)
                stream = ingest_repo_events(request.repo_url, store, embedder)
            elif request.local_path:
                _switch_repo(store, request.local_path)
                stream = ingest_path_events(request.local_path, store, embedder)
            else:  # pragma: no cover - guarded by the 400 check above
                return
            for event in stream:
                yield _sse(event)
        except ValueError as exc:
            # Bad URL, failed/timed-out clone, no supported files, or no chunks.
            yield _sse({"stage": "error", "detail": str(exc)})

    return StreamingResponse(events(), media_type="text/event-stream")


def _retrieve(
    store: ChromaStore,
    embedder: Embedder,
    reranker: Reranker | None,
    retrieval_query: str,
    rerank_query: str,
    top_k: int,
) -> list[dict]:
    """Find the grounding chunks: hybrid recall, then optional cross-encoder rerank.

    Delegates to the shared two_stage_search so the live answer path and the offline quality
    harness score the identical pipeline; the candidate-pool width comes from settings
    (rerank_candidates). `retrieval_query` may carry follow-up context; `rerank_query` is the
    bare question, which is what the cross-encoder scores against.
    """
    retriever = HybridRetriever(store, embedder)
    return two_stage_search(
        retriever, reranker, retrieval_query, rerank_query, top_k, get_settings().rerank_candidates
    )


@app.post("/api/search")
def search(
    request: SearchRequest,
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
    reranker: Reranker | None = Depends(get_reranker),
) -> dict:
    """Debug endpoint: return the chunks Glyph would use to answer (no AI involved yet)."""
    results = _retrieve(
        store, embedder, reranker, request.question, request.question, request.top_k
    )
    return {"question": request.question, "results": results}


@app.get("/api/models")
def models() -> dict:
    """List the selectable chat models and which are available (paid needs a key)."""
    settings = get_settings()
    has_paid_key = bool(settings.openai_api_key)
    return {"models": list_models(has_paid_key), "default": settings.llm_model}


@app.get("/api/metrics")
def metrics() -> dict:
    """Return live query observability: total count, refusal rate, avg latency, recent queries.

    Reads the in-memory ring buffer fed by every answered question, so the UI can show how the
    app is actually behaving (which files answers used, how often it refused) without re-running.
    """
    return metrics_snapshot()


def _sse(payload: dict) -> str:
    """Format one Server-Sent Events message as a single JSON data line."""
    return f"data: {json.dumps(payload)}\n\n"


def _prepare_answer(
    request: AskRequest,
    embedder: Embedder,
    store: ChromaStore,
    reranker: Reranker | None = None,
) -> tuple[list[dict], str, str]:
    """Retrieve the grounding chunks and build the prompt shared by /ask and /ask/stream.

    For a follow-up, the previous question is prepended to the retrieval query so vague
    questions like "where is that called?" still retrieve the right subject. The last few
    conversation turns are folded into the prompt so follow-ups stay coherent. When a reranker
    is present, retrieval becomes two-stage (wide recall, then rerank to top_k).
    """
    recent = " ".join(turn.question for turn in request.history[-1:])
    retrieval_query = f"{recent} {request.question}".strip()
    chunks = _retrieve(store, embedder, reranker, retrieval_query, request.question, request.top_k)
    recent_history = [{"question": t.question, "answer": t.answer} for t in request.history[-4:]]
    system_prompt, user_prompt = build_messages(request.question, chunks, recent_history)
    return chunks, system_prompt, user_prompt


NOT_FOUND_ANSWER = "Not found in the provided code."


def _below_floor(chunks: list[dict], reranked: bool) -> bool:
    """Return True when retrieval is too weak to answer, so we refuse before an LLM call.

    No chunks at all is always a refusal. Otherwise the floor is only enforced when the
    cross-encoder ran (its rerank_score is a calibrated relevance signal); if the chunks carry
    no scores, or the floor is disabled (None), we let the LLM and its strict prompt decide.
    """
    if not chunks:
        return True
    floor = get_settings().relevance_floor
    if floor is None or not reranked:
        return False
    scores = [chunk["rerank_score"] for chunk in chunks if "rerank_score" in chunk]
    return bool(scores) and max(scores) < floor


def _not_found_result(
    chunks: list[dict], request: "AskRequest", reranked: bool, retrieve_ms: int
) -> dict:
    """Build the canned grounded-refusal payload, shaped exactly like a real /ask answer.

    sources is empty (nothing cleared the floor, so there is no trustworthy source to show) and
    meta.grounded is False, which is how the UI knows to render a calm note with no badge.
    """
    return {
        "answer": NOT_FOUND_ANSWER,
        "citations": [],
        "retrieved_chunk_ids": [chunk["id"] for chunk in chunks],
        "sources": [],
        "meta": {
            "model": request.model or get_settings().llm_model,
            "latency_ms": retrieve_ms,
            "token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            "stage_ms": {"retrieve_ms": retrieve_ms, "llm_ms": 0},
            "cached": False,
            "reranked": reranked,
            "grounded": False,
        },
    }


def _retrieved_files(chunks: list[dict]) -> list[str]:
    """Return the de-duplicated file paths behind a set of retrieved chunks, in rank order.

    Logged with each query so an answer that cited the wrong file is visible in the logs.
    """
    files: list[str] = []
    for chunk in chunks:
        path = chunk.get("file_path", "")
        if path and path not in files:
            files.append(path)
    return files


@app.post("/api/ask")
def ask(
    request: AskRequest,
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
    llm: LLMClient = Depends(get_llm),
    reranker: Reranker | None = Depends(get_reranker),
) -> dict:
    """Answer a question grounded in the repo's code, with file:line citations."""
    if request.model is not None and not is_known_model(request.model):
        raise HTTPException(status_code=400, detail=f"unknown model: {request.model}")

    # A per-question rerank=False turns the reranker off for this answer only. Whether the
    # reranker actually ran, and which backend indexed the repo, both change the grounding
    # chunks, so they are part of the cache key and reported back in meta.
    active_reranker = None if request.rerank is False else reranker
    reranked = active_reranker is not None
    backend = _active_settings().embed_backend

    # Cache only standalone questions (follow-ups depend on conversation context). A repeat of
    # the same question on the same index returns instantly without calling the model.
    cacheable = not request.history
    chunk_count = store.count()
    if cacheable:
        hit = answer_cache.get(
            chunk_count, request.question, request.model, rerank=reranked, backend=backend
        )
        if hit is not None:
            return {**hit, "meta": {**hit["meta"], "cached": True}}

    retrieve_started = time.perf_counter()
    chunks, system_prompt, user_prompt = _prepare_answer(request, embedder, store, active_reranker)
    retrieve_ms = int((time.perf_counter() - retrieve_started) * 1000)

    # Deterministic guardrail: if nothing retrieved clears the relevance floor, refuse here rather
    # than ask the model to answer from off-topic context (and skip the wasted LLM call).
    if _below_floor(chunks, reranked):
        result = _not_found_result(chunks, request, reranked, retrieve_ms)
        log_query(
            request.question,
            result["retrieved_chunk_ids"],
            retrieve_ms,
            result["meta"]["token_usage"],
            retrieved_files=_retrieved_files(chunks),
            grounded=False,
        )
        if cacheable:
            answer_cache.put(
                chunk_count,
                request.question,
                request.model,
                result,
                rerank=reranked,
                backend=backend,
            )
        return result

    llm_started = time.perf_counter()
    try:
        answer, token_usage = llm.complete(system_prompt, user_prompt, model=request.model)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    llm_ms = int((time.perf_counter() - llm_started) * 1000)

    stages = {"retrieve_ms": retrieve_ms, "llm_ms": llm_ms}
    latency_ms = retrieve_ms + llm_ms
    chunk_ids = [chunk["id"] for chunk in chunks]
    citations = parse_citations(answer, chunks)
    log_query(
        request.question,
        chunk_ids,
        latency_ms,
        token_usage,
        stages=stages,
        retrieved_files=_retrieved_files(chunks),
        grounded=True,
    )
    # `sources` carries each retrieved chunk (with its code) so the UI can show the code behind
    # a citation; `meta` surfaces observability (model, latency, tokens, stage_ms) in the UI.
    result = {
        "answer": answer,
        "citations": citations,
        "retrieved_chunk_ids": chunk_ids,
        "sources": chunks,
        "meta": {
            "model": request.model or get_settings().llm_model,
            "latency_ms": latency_ms,
            "token_usage": token_usage,
            "stage_ms": stages,
            "cached": False,
            "reranked": reranked,
            "grounded": True,
        },
    }
    if cacheable:
        answer_cache.put(
            chunk_count, request.question, request.model, result, rerank=reranked, backend=backend
        )
    return result


@app.post("/api/ask/stream")
def ask_stream(
    request: AskRequest,
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
    llm: LLMClient = Depends(get_llm),
    reranker: Reranker | None = Depends(get_reranker),
) -> StreamingResponse:
    """Stream the grounded answer token by token over Server-Sent Events.

    Emits `{"type":"token","text":...}` messages as the answer is written, then one final
    `{"type":"final",...}` message carrying the citations, sources, and observability meta
    (the same shape /api/ask returns). On model failure it emits `{"type":"error",...}`.
    """
    if request.model is not None and not is_known_model(request.model):
        raise HTTPException(status_code=400, detail=f"unknown model: {request.model}")

    active_reranker = None if request.rerank is False else reranker
    reranked = active_reranker is not None
    backend = _active_settings().embed_backend

    cacheable = not request.history
    chunk_count = store.count()
    cached = (
        answer_cache.get(
            chunk_count, request.question, request.model, rerank=reranked, backend=backend
        )
        if cacheable
        else None
    )

    def events() -> Iterator[str]:
        """Drive the model stream and translate each step into an SSE message."""
        # Cache hit: replay the stored answer instantly (one token, then the final payload).
        if cached is not None:
            yield _sse({"type": "token", "text": cached["answer"]})
            yield _sse({"type": "final", **cached, "meta": {**cached["meta"], "cached": True}})
            return

        retrieve_started = time.perf_counter()
        chunks, system_prompt, user_prompt = _prepare_answer(
            request, embedder, store, active_reranker
        )
        retrieve_ms = int((time.perf_counter() - retrieve_started) * 1000)
        chunk_ids = [chunk["id"] for chunk in chunks]

        # Same deterministic floor as /api/ask: refuse weak retrievals without calling the model.
        if _below_floor(chunks, reranked):
            result = _not_found_result(chunks, request, reranked, retrieve_ms)
            log_query(
                request.question,
                chunk_ids,
                retrieve_ms,
                result["meta"]["token_usage"],
                retrieved_files=_retrieved_files(chunks),
                grounded=False,
            )
            if cacheable:
                answer_cache.put(
                    chunk_count,
                    request.question,
                    request.model,
                    result,
                    rerank=reranked,
                    backend=backend,
                )
            yield _sse({"type": "token", "text": NOT_FOUND_ANSWER})
            yield _sse({"type": "final", **result})
            return

        parts: list[str] = []
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        started = time.perf_counter()
        try:
            for event in llm.stream(system_prompt, user_prompt, model=request.model):
                if event["type"] == "delta":
                    parts.append(event["text"])
                    yield _sse({"type": "token", "text": event["text"]})
                elif event["type"] == "done":
                    usage = event["usage"]
        except LLMError as exc:
            # Headers are already sent (200), so surface the failure as a stream message.
            yield _sse({"type": "error", "detail": str(exc)})
            return

        answer = "".join(parts)
        llm_ms = int((time.perf_counter() - started) * 1000)
        stages = {"retrieve_ms": retrieve_ms, "llm_ms": llm_ms}
        latency_ms = retrieve_ms + llm_ms
        citations = parse_citations(answer, chunks)
        log_query(
            request.question,
            chunk_ids,
            latency_ms,
            usage,
            stages=stages,
            retrieved_files=_retrieved_files(chunks),
            grounded=True,
        )
        result = {
            "answer": answer,
            "citations": citations,
            "retrieved_chunk_ids": chunk_ids,
            "sources": chunks,
            "meta": {
                "model": request.model or get_settings().llm_model,
                "latency_ms": latency_ms,
                "token_usage": usage,
                "stage_ms": stages,
                "cached": False,
                "reranked": reranked,
                "grounded": True,
            },
        }
        if cacheable:
            answer_cache.put(
                chunk_count,
                request.question,
                request.model,
                result,
                rerank=reranked,
                backend=backend,
            )
        yield _sse({"type": "final", **result})

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/api/overview")
def overview(
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    """Return a short 'what this codebase does' summary of the ingested repo."""
    _ = embedder  # ensures the store/embedder are built before reading
    return {"overview": build_overview(store, llm)}


@app.get("/api/graph")
def graph(
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Return the dependency graph (files as nodes, internal imports as edges)."""
    _ = embedder
    return build_import_graph(store)


@app.get("/api/stats")
def stats(
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Return repo stats: file count, chunk count, and a per-language breakdown."""
    _ = embedder
    return build_stats(store)


@app.get("/api/endpoints")
def endpoints(
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Return HTTP API routes detected in the indexed code (FastAPI/Flask/Express styles)."""
    _ = embedder
    return {"endpoints": detect_endpoints(store)}


@app.get("/api/stack")
def stack(
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Return the real frameworks/libraries detected from the code's imports, most-used first."""
    _ = embedder
    return {"stack": detect_stack(store)}


@app.get("/api/symbols")
def symbols(
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Return a flat file + symbol index of the indexed code (for the command palette)."""
    _ = embedder
    return {"symbols": list_symbols(store)}


@app.post("/api/history")
def save_history(request: HistorySaveRequest, history: History = Depends(get_history)) -> dict:
    """Save (create or replace) a chat session and return its id."""
    session_id = history.save(request.repo, request.messages, request.session_id)
    return {"session_id": session_id}


@app.get("/api/history")
def list_history(history: History = Depends(get_history)) -> dict:
    """List recent saved chat sessions (newest first)."""
    return {"sessions": history.list_sessions()}


@app.get("/api/history/{session_id}")
def load_history(session_id: str, history: History = Depends(get_history)) -> dict:
    """Return a saved session's messages, or 404 if the session does not exist."""
    session = history.load(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"session not found: {session_id}")
    return session


@app.get("/api/file")
def file(
    path: str,
    start: int | None = None,
    end: int | None = None,
    embedder: Embedder = Depends(get_embedder),
    store: ChromaStore = Depends(get_store),
) -> dict:
    """Return an indexed file's code (optionally a line range) for the code viewer.

    The path is a key into the index, not a disk path, so an unknown path is just a 404.
    """
    _ = embedder
    result = read_indexed_file(store, path, start, end)
    if result is None:
        raise HTTPException(status_code=404, detail=f"file not found in the index: {path}")
    return result
