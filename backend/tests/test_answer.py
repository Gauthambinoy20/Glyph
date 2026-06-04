"""Unit tests for the answer endpoints (/api/models and /api/ask), with a mocked LLM."""

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
    assert "qwen/qwen3-coder:free" in ids
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
