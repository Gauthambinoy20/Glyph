"""Test the retrieval-quality comparison adapter.

The _RerankedRetriever adapter must mirror the real two-stage path: widen recall to the
candidate pool, then rerank down to top_k. Verified here with fakes, so it needs no models.
"""

from app.quality.compare import _RerankedRetriever

from tests.helpers import FakeReranker


class _FakeRetriever:
    """Returns a fixed candidate list and records the top_k/pool it was asked for."""

    def __init__(self, results: list[dict]) -> None:
        self._results = results
        self.calls: list[dict] = []

    def search(self, question: str, top_k: int = 5, pool: int = 20) -> list[dict]:
        self.calls.append({"top_k": top_k, "pool": pool})
        return self._results[:top_k]


def test_reranked_retriever_widens_recall_then_reranks() -> None:  # T84
    candidates = [{"id": str(i), "code": str(i)} for i in range(20)]
    retriever = _FakeRetriever(candidates)
    adapter = _RerankedRetriever(retriever, FakeReranker(), candidates=20)

    out = adapter.search("q", top_k=3)

    # It asked the retriever for the wide pool, not just the final top_k.
    assert retriever.calls[0]["top_k"] == 20
    assert retriever.calls[0]["pool"] >= 20
    # FakeReranker reverses the pool and keeps top_k=3 — a deterministic, checkable reorder.
    assert [row["id"] for row in out] == ["19", "18", "17"]
    assert len(out) == 3
