"""The reranker interface.

A reranker takes the candidate chunks the first-stage retriever recalled and reorders them by
true relevance to the question, keeping the best few. Hiding it behind a small Protocol lets the
answer path stay identical whether reranking is on or off — and lets tests swap in a fake.
"""

from collections.abc import Sequence
from typing import Protocol


class Reranker(Protocol):
    """Reorders retrieved chunks by relevance to a query and keeps the top_k."""

    def rerank(self, query: str, results: Sequence[dict], top_k: int) -> list[dict]:
        """Return at most top_k of `results`, ordered most-relevant first."""
        ...
