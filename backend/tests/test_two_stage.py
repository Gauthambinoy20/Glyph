"""Unit tests for the shared two-stage retrieval helper.

This is the single function both the live ``/ask`` path and the offline quality harness call,
so it is pinned directly here with fakes (no models, no network): without a reranker it returns
the hybrid top_k untouched; with one it widens recall to ``candidates`` then reranks to top_k.
"""

from app.retrieve.two_stage import two_stage_search

from tests.helpers import FakeReranker


class _SpyRetriever:
    """Returns a fixed candidate list and records the (top_k, pool) it was asked for."""

    def __init__(self, results: list[dict]) -> None:
        self._results = results
        self.calls: list[dict] = []

    def search(self, question: str, top_k: int = 5, pool: int = 20) -> list[dict]:
        self.calls.append({"question": question, "top_k": top_k, "pool": pool})
        return self._results[:top_k]


def test_without_a_reranker_returns_the_hybrid_top_k() -> None:
    retriever = _SpyRetriever([{"id": str(i)} for i in range(10)])

    out = two_stage_search(retriever, None, "retr query", "rerank query", top_k=3, candidates=60)

    # Single-stage: it asks for exactly top_k on the retrieval query and returns it as-is.
    assert [row["id"] for row in out] == ["0", "1", "2"]
    assert retriever.calls == [{"question": "retr query", "top_k": 3, "pool": 20}]


def test_with_a_reranker_widens_recall_then_reranks_to_top_k() -> None:
    retriever = _SpyRetriever([{"id": str(i)} for i in range(60)])

    out = two_stage_search(
        retriever, FakeReranker(), "retr query", "rerank query", top_k=3, candidates=60
    )

    # It cast the wide net of `candidates`, not just top_k...
    assert retriever.calls[0]["top_k"] == 60
    assert retriever.calls[0]["pool"] >= 60
    # ...and the FakeReranker reversed that pool and kept top_k=3 (a checkable reorder).
    assert [row["id"] for row in out] == ["59", "58", "57"]
    assert len(out) == 3


def test_candidate_pool_never_falls_below_top_k() -> None:
    retriever = _SpyRetriever([{"id": str(i)} for i in range(10)])

    # candidates smaller than top_k must not shrink the recall below what the caller asked for.
    two_stage_search(retriever, FakeReranker(), "q", "q", top_k=8, candidates=3)

    assert retriever.calls[0]["top_k"] == 8
