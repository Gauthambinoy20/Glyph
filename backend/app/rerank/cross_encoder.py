"""A cross-encoder reranker: the precise second stage of retrieval.

The hybrid retriever casts a wide, cheap net (semantic + BM25) to recall ~20 candidate chunks.
This reranker then scores each (question, chunk) pair *together* with a small cross-encoder —
which judges relevance far better than comparing two independent embeddings — and keeps the
best few. It runs on only a handful of candidates per question, so the cost is small and hidden
behind the LLM call, and it never touches ingest.

Uses fastembed's TextCrossEncoder (ONNX, local, free) — the same toolkit as the embedder, so it
adds no new dependency.
"""

from collections.abc import Sequence

from fastembed.rerank.cross_encoder import TextCrossEncoder

# The cross-encoder only attends to the first ~512 tokens of each (query, code) pair. Feeding it
# the full code of a long chunk is wasted work — it tokenizes thousands of characters only to
# truncate them. Trimming each candidate to roughly that window first cuts the per-pair inference
# cost dramatically (the relevance signal — the signature and the first lines of a function/file —
# lives at the start), with no measurable loss in ranking quality. This is what keeps reranking
# fast on a small CPU box instead of pegging it for ten-plus seconds.
_MAX_DOC_CHARS = 1200


class CrossEncoderReranker:
    """Reorder retrieved chunks with a local ONNX cross-encoder."""

    def __init__(self, model_name: str, cache_dir: str | None = None) -> None:
        # Downloads once on first use, then cached and reused (like the embedding model).
        self._model = TextCrossEncoder(model_name=model_name, cache_dir=cache_dir)

    def rerank(self, query: str, results: Sequence[dict], top_k: int) -> list[dict]:
        """Score each chunk's code against the query and return the top_k most relevant.

        Each returned row is the original chunk dict plus a ``rerank_score``. An empty
        candidate list returns an empty list (nothing to reorder). Each chunk's code is trimmed to
        the model's effective attention window first, so long chunks don't blow up inference cost.
        """
        if not results:
            return []
        documents = [str(row.get("code", ""))[:_MAX_DOC_CHARS] for row in results]
        scores = list(self._model.rerank(query, documents))
        ranked = sorted(zip(results, scores, strict=False), key=lambda pair: pair[1], reverse=True)
        top: list[dict] = []
        for row, score in ranked[:top_k]:
            enriched = dict(row)
            enriched["rerank_score"] = round(float(score), 6)
            top.append(enriched)
        return top
