"""Unit tests for the answer endpoints (/api/models and /api/ask), with a mocked LLM."""

import json

from app.ingest.cache import embed_new_chunks
from app.main import app, get_embedder, get_llm, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, FakeLLM, make_chunk


def _store_with(tmp_path, chunks) -> ChromaStore:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


def test_models_endpoint_lists_free_and_paid() -> None:  # T38
    body = TestClient(app).get("/api/models").json()

    ids = [model["id"] for model in body["models"]]
    assert "openai/gpt-oss-120b:free" in ids  # a model with a live free endpoint
    assert any(m["tier"] == "paid" for m in body["models"])  # paid options are listed too
    assert all(m["available"] for m in body["models"] if m["tier"] == "free")
    assert body["default"]


def test_ask_returns_answer_and_citations(tmp_path) -> None:  # T39 + T41
    chunk = make_chunk("def login(): ...", name="login", path="auth.py", start=1, end=2)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_llm] = lambda: FakeLLM("Login lives in [auth.py:1-2].")
    try:
        body = TestClient(app).post("/api/ask", json={"question": "where is login"}).json()
    finally:
        app.dependency_overrides.clear()

    assert body["answer"]
    assert body["retrieved_chunk_ids"]  # a chunk was retrieved
    assert body["citations"] == [{"file_path": "auth.py", "start_line": 1, "end_line": 2}]


def test_overview_endpoint_summarises_repo(tmp_path) -> None:
    chunk = make_chunk("def login(): ...", name="login", path="auth.py")
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_llm] = lambda: FakeLLM("This project handles authentication.")
    try:
        body = TestClient(app).get("/api/overview").json()
    finally:
        app.dependency_overrides.clear()

    assert body["overview"] == "This project handles authentication."


def _parse_sse(body: str) -> list[dict]:
    """Pull the JSON payloads out of an SSE response body (one per `data:` line)."""
    return [
        json.loads(block[len("data: ") :])
        for block in body.strip().split("\n\n")
        if block.startswith("data: ")
    ]


def test_ask_stream_emits_tokens_then_final_with_citations(tmp_path) -> None:  # T50
    chunk = make_chunk("def login(): ...", name="login", path="auth.py", start=1, end=2)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_llm] = lambda: FakeLLM("Login lives in [auth.py:1-2].")
    try:
        resp = TestClient(app).post("/api/ask/stream", json={"question": "where is login"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    messages = _parse_sse(resp.text)
    types = [message["type"] for message in messages]
    assert "token" in types  # the answer streamed in pieces
    assert types[-1] == "final"  # the last message wraps it up

    final = messages[-1]
    assert final["answer"] == "Login lives in [auth.py:1-2]."
    assert final["citations"] == [{"file_path": "auth.py", "start_line": 1, "end_line": 2}]
    assert final["retrieved_chunk_ids"]  # a chunk was retrieved and grounded the answer


def test_ask_on_empty_index_has_no_citations(tmp_path) -> None:  # T40
    empty = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: empty
    app.dependency_overrides[get_llm] = lambda: FakeLLM("Not found in the provided code.")
    try:
        body = TestClient(app).post("/api/ask", json={"question": "anything"}).json()
    finally:
        app.dependency_overrides.clear()

    assert body["retrieved_chunk_ids"] == []
    assert body["citations"] == []
