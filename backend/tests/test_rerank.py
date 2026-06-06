"""Tests for the cross-encoder reranker and its two-stage wiring into retrieval.

The unit tests fake the cross-encoder model so they run offline in CI; the wiring test drives
the real hybrid retriever + Chroma store through /api/search with a deterministic FakeReranker.
"""

from app.config import Settings
from app.main import app, get_embedder, get_llm, get_reranker, get_store
from app.rerank.cross_encoder import CrossEncoderReranker
from app.rerank.factory import make_reranker
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, FakeLLM, FakeReranker
from tests.test_e2e import _fresh_store, _make_repo


def test_cross_encoder_orders_by_score_and_keeps_top_k(monkeypatch) -> None:  # T77
    """The reranker sorts candidates by the model score and returns top_k with a rerank_score."""

    class _FakeModel:
        def __init__(self, model_name, cache_dir=None) -> None:
            pass

        def rerank(self, query, documents):
            # Score = position, so the last document is the most relevant.
            return [float(i) for i, _ in enumerate(documents)]

    monkeypatch.setattr("app.rerank.cross_encoder.TextCrossEncoder", _FakeModel)
    reranker = CrossEncoderReranker(model_name="x")
    results = [{"id": "a", "code": "A"}, {"id": "b", "code": "B"}, {"id": "c", "code": "C"}]

    top = reranker.rerank("q", results, top_k=2)

    assert [row["id"] for row in top] == ["c", "b"]  # highest score first
    assert top[0]["rerank_score"] == 2.0  # the score is attached to the row
    assert len(top) == 2  # cut to top_k


def test_cross_encoder_trims_long_chunks_before_scoring(monkeypatch) -> None:
    """Long chunks are trimmed to the model's window before scoring.

    A giant chunk can't blow up inference cost — this is the optimization that keeps reranking
    fast on a 2-CPU box.
    """
    seen: dict = {}

    class _Capture:
        def __init__(self, model_name, cache_dir=None) -> None:
            pass

        def rerank(self, query, documents):
            seen["docs"] = list(documents)
            return [1.0 for _ in documents]

    monkeypatch.setattr("app.rerank.cross_encoder.TextCrossEncoder", _Capture)
    from app.rerank.cross_encoder import _MAX_DOC_CHARS, CrossEncoderReranker

    reranker = CrossEncoderReranker(model_name="x")
    reranker.rerank("q", [{"id": "a", "code": "x" * 5000}], top_k=1)

    assert len(seen["docs"][0]) == _MAX_DOC_CHARS  # the 5000-char chunk was trimmed to the window
    assert _MAX_DOC_CHARS < 5000  # and the window really is smaller than the chunk


def test_cross_encoder_empty_candidates(monkeypatch) -> None:  # T78
    """No candidates in means an empty list out (and the model is never called)."""
    monkeypatch.setattr(
        "app.rerank.cross_encoder.TextCrossEncoder",
        lambda model_name, cache_dir=None: None,
    )
    reranker = CrossEncoderReranker(model_name="x")
    assert reranker.rerank("q", [], top_k=5) == []


def test_factory_returns_none_when_disabled() -> None:  # T79
    assert make_reranker(Settings(reranker_enabled=False)) is None


def test_factory_builds_cross_encoder_when_enabled(monkeypatch) -> None:  # T79
    built: dict = {}
    monkeypatch.setattr(
        "app.rerank.cross_encoder.TextCrossEncoder",
        lambda model_name, cache_dir=None: built.setdefault("model", model_name),
    )
    reranker = make_reranker(
        Settings(reranker_enabled=True, reranker_model="m", model_cache_dir="d")
    )

    assert isinstance(reranker, CrossEncoderReranker)
    assert built["model"] == "m"  # the configured model id reached the cross-encoder


def test_search_two_stage_reranks_the_recall_pool(tmp_path) -> None:  # T80
    """/api/search casts a wide net, then the reranker reorders that pool down to top_k."""
    repo = _make_repo(tmp_path / "repo")
    store = _fresh_store(tmp_path)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    try:
        client = TestClient(app)
        client.post("/api/ingest", json={"local_path": str(repo)})

        # The wide recall pool the reranker sees (same call the two-stage path makes internally).
        app.dependency_overrides[get_reranker] = lambda: None
        wide = {"question": "authenticate user", "top_k": 20}
        pool = client.post("/api/search", json=wide).json()

        # FakeReranker reverses that pool and keeps top_k=3 — a deterministic, checkable reorder.
        app.dependency_overrides[get_reranker] = lambda: FakeReranker()
        reranked = client.post(
            "/api/search", json={"question": "authenticate user", "top_k": 3}
        ).json()
    finally:
        app.dependency_overrides.clear()

    expected = [row["id"] for row in reversed(pool["results"])][:3]
    assert [row["id"] for row in reranked["results"]] == expected
    assert len(reranked["results"]) <= 3  # cut to the requested top_k


def test_ask_rerank_toggle_skips_reranker_when_false(tmp_path) -> None:  # T85
    """A per-question rerank=False answers without the reranker; rerank=True uses it."""
    repo = _make_repo(tmp_path / "repo")
    store = _fresh_store(tmp_path)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_llm] = lambda: FakeLLM("ok")
    app.dependency_overrides[get_reranker] = lambda: FakeReranker()
    try:
        client = TestClient(app)
        client.post("/api/ingest", json={"local_path": str(repo)})
        # A prior turn makes the ask non-cacheable, so both calls actually run retrieval.
        history = [{"question": "prior", "answer": "prior"}]
        on = client.post(
            "/api/ask", json={"question": "authenticate user", "history": history, "rerank": True}
        ).json()
        off = client.post(
            "/api/ask", json={"question": "authenticate user", "history": history, "rerank": False}
        ).json()
    finally:
        app.dependency_overrides.clear()

    on_ids = [src["id"] for src in on["sources"]]
    off_ids = [src["id"] for src in off["sources"]]
    # The reversing FakeReranker reorders the pool, so rerank=True differs from rerank=False.
    assert on_ids != off_ids
