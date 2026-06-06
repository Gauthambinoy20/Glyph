"""Compare retrieval quality across embedding backends, with and without reranking.

Builds the real index over the backend's own ``app/`` for each embedding backend, then scores
the golden set four ways: each backend alone, and each backend followed by the cross-encoder
reranker. Prints a hit-rate table — the evidence behind the "fast AND accurate" claim, and the
basis for choosing the shipped default.

    python -m app.quality.compare
"""

import tempfile

from app.config import Settings
from app.embed.factory import effective_embed_model, make_embedder
from app.ingest.pipeline import ingest_path
from app.quality.evaluate import evaluate
from app.quality.golden import GOLDEN
from app.rerank.base import Reranker
from app.rerank.cross_encoder import CrossEncoderReranker
from app.retrieve.hybrid import HybridRetriever
from app.retrieve.two_stage import two_stage_search


class _RerankedRetriever:
    """Adapt (retriever + reranker) to the .search() interface that evaluate expects.

    Delegates to the shared two_stage_search so it scores the exact pipeline main._retrieve runs:
    widen recall to ``candidates`` chunks, then rerank down to top_k. ``candidates`` is passed in
    (from settings.rerank_candidates) rather than hardcoded, so the comparison never measures a
    narrower pool than production.
    """

    def __init__(self, retriever: HybridRetriever, reranker: Reranker, candidates: int) -> None:
        self._retriever = retriever
        self._reranker = reranker
        self._candidates = candidates

    def search(self, question: str, top_k: int = 5) -> list[dict]:
        return two_stage_search(
            self._retriever, self._reranker, question, question, top_k, self._candidates
        )


def _score_backend(embed_backend: str, reranker: Reranker) -> tuple[float, float]:
    """Return (plain_hit_rate, reranked_hit_rate) for one embedding backend."""
    settings = Settings(embed_backend=embed_backend)
    embedder = make_embedder(settings)
    with tempfile.TemporaryDirectory() as tmp:
        store_model = effective_embed_model(settings)
        from app.store.chroma_store import ChromaStore

        store = ChromaStore(path=tmp, embed_model=store_model, dim=embedder.dim)
        ingest_path("app", store, embedder)
        base = HybridRetriever(store, embedder)
        plain = evaluate(base, GOLDEN)["hit_rate"]
        reranked_retriever = _RerankedRetriever(base, reranker, settings.rerank_candidates)
        reranked = evaluate(reranked_retriever, GOLDEN)["hit_rate"]
    return plain, reranked


def main() -> None:
    """Score every backend × rerank combination over the golden set and print a table."""
    reranker = CrossEncoderReranker(model_name=Settings().reranker_model)
    backends = [("local", "bge-small"), ("static", "Model2Vec")]

    print("\n  GLYPH RETRIEVAL QUALITY — backend x rerank (golden set)\n  " + "-" * 52)
    print(f"  {'embedding backend':<20}{'alone':>12}{'+ reranker':>16}")
    print("  " + "-" * 52)
    for backend, label in backends:
        plain, reranked = _score_backend(backend, reranker)
        print(f"  {label:<20}{plain * 100:>11.0f}%{reranked * 100:>15.0f}%")
    print("  " + "-" * 52 + "\n")


if __name__ == "__main__":
    main()
