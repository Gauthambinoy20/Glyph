"""Hybrid retrieval: combine meaning-based and keyword-based search.

For a question we run two searches over the same chunks: a semantic one (vector
similarity) and a keyword one (BM25 over code-aware tokens). We fuse them with Reciprocal
Rank Fusion, give an extra boost to any chunk whose symbol name is named in the question,
and return the best few. The keyword index is rebuilt from the stored chunks on each
retriever, so it is never stale (no pickle to go out of date).
"""

from rank_bm25 import BM25Okapi

from app.embed.base import Embedder
from app.retrieve.tokenize import tokenize_code
from app.store.chroma_store import ChromaStore

# Standard RRF constant: higher flattens the fusion, lower over-weights the top of each list.
_RRF_K = 60


def _reciprocal_rank_fusion(rankings: list[list[str]], k: int = _RRF_K) -> dict[str, float]:
    """Fuse several ranked id lists into one score per id, using rank position only."""
    scores: dict[str, float] = {}
    for ranked in rankings:
        for rank, doc_id in enumerate(ranked, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
    return scores


class HybridRetriever:
    """Find the most relevant code chunks for a question."""

    def __init__(self, store: ChromaStore, embedder: Embedder) -> None:
        self._store = store
        self._embedder = embedder
        data = store.all_chunks()
        self._ids: list[str] = data.get("ids", []) or []
        metadatas: list[dict] = data.get("metadatas", []) or []
        documents: list[str] = data.get("documents", []) or []
        self._meta_by_id = dict(zip(self._ids, metadatas, strict=False))
        # Keyword index over each chunk's code plus its symbol name.
        corpus = [
            tokenize_code(f"{doc} {meta.get('symbol_name', '')}")
            for doc, meta in zip(documents, metadatas, strict=False)
        ]
        self._bm25 = BM25Okapi(corpus) if corpus else None

    def search(self, question: str, top_k: int = 5, pool: int = 20) -> list[dict]:
        """Return up to top_k chunks most relevant to the question (metadata + score)."""
        if not self._ids:
            return []

        # 1) semantic: nearest chunks by vector similarity.
        query_vector = self._embedder.embed_query(question)
        semantic = self._store.query(query_vector, k=min(pool, len(self._ids)))
        semantic_ids: list[str] = semantic["ids"][0]

        # 2) keyword: best chunks by BM25 over code-aware tokens.
        query_tokens = tokenize_code(question)
        keyword_ids: list[str] = []
        if self._bm25 is not None and query_tokens:
            scores = self._bm25.get_scores(query_tokens)
            order = sorted(range(len(self._ids)), key=lambda i: scores[i], reverse=True)
            keyword_ids = [self._ids[i] for i in order[:pool]]

        # 3) fuse, then boost any chunk whose symbol name is named in the question.
        fused = _reciprocal_rank_fusion([semantic_ids, keyword_ids])
        named = set(query_tokens)
        for chunk_id, meta in self._meta_by_id.items():
            if str(meta.get("symbol_name", "")).lower() in named:
                fused[chunk_id] = fused.get(chunk_id, 0.0) + 1.0

        # Deterministic order: by score, then id as a stable tiebreak.
        ranked = sorted(fused, key=lambda cid: (fused[cid], cid), reverse=True)
        return [self._result(cid, fused[cid]) for cid in ranked[:top_k]]

    def _result(self, chunk_id: str, score: float) -> dict:
        """Build a result row: the chunk's metadata plus its fused score."""
        row = dict(self._meta_by_id.get(chunk_id, {}))
        row["id"] = chunk_id
        row["score"] = round(score, 6)
        return row
