"""Guardrail tests: reject empty questions, and refuse low-confidence retrievals deterministically.

These pin the two non-prompt guardrails. The empty-question check happens in AskRequest, so it
covers both /api/ask and /api/ask/stream. The relevance floor short-circuits to "Not found"
*before* the LLM is called, which we prove by asserting the stubbed LLM was never invoked.
"""

from app.ingest.cache import embed_new_chunks
from app.main import app, get_embedder, get_llm, get_reranker, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, FakeLLM, make_chunk


def _store_with(tmp_path, chunks) -> ChromaStore:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


class _ScoringReranker:
    """A stand-in cross-encoder that stamps every candidate with a fixed rerank_score."""

    def __init__(self, score: float) -> None:
        self.score = score

    def rerank(self, query, results, top_k):
        return [{**row, "rerank_score": self.score} for row in results][:top_k]


class _CountingLLM(FakeLLM):
    """A FakeLLM that records how many times it was asked to answer."""

    def __init__(self) -> None:
        super().__init__("Login lives in [auth.py:1-2].")
        self.calls = 0

    def complete(self, system_prompt, user_prompt, model=None):
        self.calls += 1
        return super().complete(system_prompt, user_prompt, model)


def test_blank_question_is_rejected() -> None:
    """An empty or whitespace-only question fails validation with 422 before any work runs."""
    client = TestClient(app)
    for blank in ("", "   ", "\n\t "):
        resp = client.post("/api/ask", json={"question": blank})
        assert resp.status_code == 422, blank


def test_low_relevance_refuses_without_calling_the_llm(tmp_path) -> None:
    """Below-floor retrieval makes /ask return the canned refusal without calling the model."""
    chunk = make_chunk("def login(): ...", name="login", path="auth.py", start=1, end=2)
    llm = _CountingLLM()
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_reranker] = lambda: _ScoringReranker(score=-12.0)
    app.dependency_overrides[get_llm] = lambda: llm
    try:
        body = TestClient(app).post("/api/ask", json={"question": "what is the weather"}).json()
    finally:
        app.dependency_overrides.clear()

    assert body["answer"] == "Not found in the provided code."
    assert body["citations"] == []
    assert body["sources"] == []
    assert body["meta"]["grounded"] is False
    assert llm.calls == 0  # the deterministic floor saved the LLM call


def test_broad_question_above_floor_is_answered(tmp_path) -> None:
    """A valid-but-broad question (score ~-7, above the -9 floor) is answered, not refused.

    This is the first thing users ask ("what does this project do"); a -5 floor wrongly refused
    it, so this pins that it now reaches the model.
    """
    chunk = make_chunk("def login(): ...", name="login", path="auth.py", start=1, end=2)
    llm = _CountingLLM()
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_reranker] = lambda: _ScoringReranker(score=-7.0)
    app.dependency_overrides[get_llm] = lambda: llm
    try:
        body = (
            TestClient(app).post("/api/ask", json={"question": "what does this project do"}).json()
        )
    finally:
        app.dependency_overrides.clear()

    assert body["meta"]["grounded"] is True  # -7 clears the -9 floor
    assert llm.calls == 1  # the model was asked, not short-circuited


def test_high_relevance_passes_through_to_the_llm(tmp_path) -> None:
    """A chunk that clears the floor reaches the model and produces a normal, cited answer."""
    chunk = make_chunk("def login(): ...", name="login", path="auth.py", start=1, end=2)
    llm = _CountingLLM()
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_reranker] = lambda: _ScoringReranker(score=6.0)
    app.dependency_overrides[get_llm] = lambda: llm
    try:
        body = TestClient(app).post("/api/ask", json={"question": "where is login"}).json()
    finally:
        app.dependency_overrides.clear()

    assert body["answer"] == "Login lives in [auth.py:1-2]."
    assert body["citations"] == [{"file_path": "auth.py", "start_line": 1, "end_line": 2}]
    assert llm.calls == 1


def test_stream_refuses_low_relevance_without_calling_the_llm(tmp_path) -> None:
    """The streaming endpoint applies the same floor: one refusal token, then a final payload."""
    chunk = make_chunk("def login(): ...", name="login", path="auth.py", start=1, end=2)
    llm = _CountingLLM()
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_reranker] = lambda: _ScoringReranker(score=-12.0)
    app.dependency_overrides[get_llm] = lambda: llm
    try:
        resp = TestClient(app).post("/api/ask/stream", json={"question": "who won the cup"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert "Not found in the provided code." in resp.text
    assert llm.calls == 0
