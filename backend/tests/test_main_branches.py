"""Cover the remaining branch/error paths in app/main.py.

These are the endpoint wiring, error responses, cache replay, rate-limit eviction and
the dependency factories that the happy-path endpoint tests do not reach — all driven
offline with the existing fakes and dependency overrides.
"""

import json
import time

import app.main as main
from app.config import Settings
from app.ingest.cache import embed_new_chunks
from app.llm.client import LLMError
from app.main import app, get_embedder, get_history, get_llm, get_reranker, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, FakeLLM, FakeReranker, make_chunk


def _store_with(tmp_path, chunks) -> ChromaStore:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


def _parse_sse(body: str) -> list[dict]:
    return [
        json.loads(block[len("data: ") :])
        for block in body.strip().split("\n\n")
        if block.startswith("data: ")
    ]


class _RaisingLLM:
    """A chat client that always fails, to drive the error branches."""

    def complete(self, *args, **kwargs):
        raise LLMError("model down")

    def stream(self, *args, **kwargs):
        raise LLMError("model down")


# ---- endpoint wiring: graph + stack ----


def test_graph_and_stack_endpoints_return_data(tmp_path) -> None:
    chunk = make_chunk("import os\n\ndef f():\n    return os.getpid()", path="a.py", start=1, end=4)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    try:
        client = TestClient(app)
        graph = client.get("/api/graph").json()
        stack = client.get("/api/stack").json()
    finally:
        app.dependency_overrides.clear()

    assert "nodes" in graph and "edges" in graph
    assert "stack" in stack


# ---- /api/ask error branches ----


def test_ask_rejects_unknown_model(tmp_path) -> None:
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [make_chunk("x")])
    app.dependency_overrides[get_llm] = lambda: FakeLLM("hi")
    try:
        resp = TestClient(app).post("/api/ask", json={"question": "q", "model": "nope/nope"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 400


def test_ask_returns_502_on_llm_error(tmp_path) -> None:
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(
        tmp_path, [make_chunk("def f(): ...")]
    )
    app.dependency_overrides[get_llm] = lambda: _RaisingLLM()
    try:
        resp = TestClient(app).post("/api/ask", json={"question": "q"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 502


# ---- /api/ask/stream branches ----


def test_ask_stream_rejects_unknown_model(tmp_path) -> None:
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [make_chunk("x")])
    app.dependency_overrides[get_llm] = lambda: FakeLLM("hi")
    try:
        resp = TestClient(app).post("/api/ask/stream", json={"question": "q", "model": "no/no"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 400


def test_ask_stream_replays_cached_answer(tmp_path) -> None:
    chunk = make_chunk("def login(): ...", name="login", path="a.py", start=1, end=2)
    store = _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_llm] = lambda: FakeLLM("Login lives in [a.py:1-2].")
    try:
        client = TestClient(app)
        client.post("/api/ask", json={"question": "where is login"})  # populates the cache
        resp = client.post("/api/ask/stream", json={"question": "where is login"})
    finally:
        app.dependency_overrides.clear()

    messages = _parse_sse(resp.text)
    assert messages[-1]["type"] == "final"
    assert messages[-1]["meta"]["cached"] is True


def test_ask_stream_emits_error_event_on_llm_failure(tmp_path) -> None:
    store = _store_with(tmp_path, [make_chunk("def f(): ...")])
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_llm] = lambda: _RaisingLLM()
    try:
        resp = TestClient(app).post("/api/ask/stream", json={"question": "q"})
    finally:
        app.dependency_overrides.clear()

    messages = _parse_sse(resp.text)
    assert any(message["type"] == "error" for message in messages)


# ---- /api/ingest/stream path guard ----


def test_ingest_stream_rejects_path_outside_base(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(main, "get_settings", lambda: Settings(ingest_base_dir=str(tmp_path)))
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [make_chunk("x")])
    try:
        resp = TestClient(app).post("/api/ingest/stream", json={"local_path": "/etc"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 400


# ---- lifespan warmup + middleware + dependency factories ----


def test_warmup_builds_reranker_after_embedder(monkeypatch) -> None:
    monkeypatch.setattr(main, "get_embedder", lambda: FakeEmbedder(dim=8))
    built: list[int] = []
    monkeypatch.setattr(main, "get_reranker", lambda: built.append(1))

    with TestClient(app):
        pass

    assert built  # warmup ran past embedding and reached get_reranker()


def test_rate_limit_evicts_expired_hits() -> None:
    main._rate_hits.clear()
    main._rate_hits["testclient"].append(time.monotonic() - 120)  # a hit older than the window

    resp = TestClient(app).get("/api/models")

    assert resp.status_code == 200
    assert len(main._rate_hits["testclient"]) == 1  # the expired hit was evicted, the new one kept
    main._rate_hits.clear()


def test_get_history_factory_builds_a_store(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(main, "get_settings", lambda: Settings(db_path=str(tmp_path / "h.db")))
    get_history.cache_clear()
    try:
        assert get_history() is not None
    finally:
        get_history.cache_clear()


def test_get_reranker_returns_reranker_when_enabled(monkeypatch) -> None:
    monkeypatch.setattr(main, "make_reranker", lambda settings: FakeReranker())
    get_reranker.cache_clear()
    try:
        assert get_reranker() is not None
    finally:
        get_reranker.cache_clear()


def test_get_reranker_falls_back_to_none_on_failure(monkeypatch) -> None:
    def boom(settings):
        raise RuntimeError("no model")

    monkeypatch.setattr(main, "make_reranker", boom)
    get_reranker.cache_clear()
    try:
        assert get_reranker() is None
    finally:
        get_reranker.cache_clear()
