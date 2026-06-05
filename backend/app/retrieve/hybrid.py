"""Hybrid retrieval: combine meaning-based and keyword-based search.

For a question we run two searches over the same chunks: a semantic one (vector
similarity) and a keyword one (BM25 over code-aware tokens). We fuse them with Reciprocal
Rank Fusion, give an extra boost to any chunk whose symbol name is named in the question,
and return the best few. The keyword index is built once per store and cached, then reused
until the stored chunk set changes, so repeated questions do not rebuild it every time
(and there is still no pickle on disk to go stale).
"""

from dataclasses import dataclass
from weakref import WeakKeyDictionary

from rank_bm25 import BM25Okapi

from app.embed.base import Embedder
from app.retrieve.tokenize import tokenize_code
from app.store.chroma_store import ChromaStore

# Standard RRF constant: higher flattens the fusion, lower over-weights the top of each list.
_RRF_K = 60


@dataclass
class _KeywordIndex:
    """The prebuilt lookup tables and BM25 index for one store's chunks."""

    ids: list[str]
    meta_by_id: dict[str, dict]
    code_by_id: dict[str, str]
    bm25: BM25Okapi | None
    count: int  # how many chunks this index was built from (the freshness signal)


# Cache one keyword index per store object. Keyed weakly so a store that is dropped takes
# its cached index with it (no leak), and so different stores never collide.
_INDEX_CACHE: "WeakKeyDictionary[ChromaStore, _KeywordIndex]" = WeakKeyDictionary()


def _build_index(store: ChromaStore) -> _KeywordIndex:
    """Pull every chunk out of the store and build its lookup tables and BM25 index."""
    data = store.all_chunks()
    ids: list[str] = data.get("ids", []) or []
    metadatas: list[dict] = data.get("metadatas", []) or []
    documents: list[str] = data.get("documents", []) or []
    # Keyword corpus: each chunk's code plus its symbol name, tokenized code-aware.
    corpus = [
        tokenize_code(f"{doc} {meta.get('symbol_name', '')}")
        for doc, meta in zip(documents, metadatas, strict=False)
    ]
    return _KeywordIndex(
        ids=ids,
        meta_by_id=dict(zip(ids, metadatas, strict=False)),
        code_by_id=dict(zip(ids, documents, strict=False)),
        bm25=BM25Okapi(corpus) if corpus else None,
        count=len(ids),
    )


def _index_for(store: ChromaStore) -> _KeywordIndex:
    """Return the cached keyword index for this store, rebuilding only if it changed.

    The cheap chunk count is the freshness check: ingest only ever adds chunks, so a
    changed count means the index is stale and must be rebuilt.
    """
    cached = _INDEX_CACHE.get(store)
    if cached is not None and cached.count == store.count():
        return cached
    index = _build_index(store)
    _INDEX_CACHE[store] = index
    return index


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
        index = _index_for(store)
        self._ids = index.ids
        self._meta_by_id = index.meta_by_id
        self._code_by_id = index.code_by_id
        self._bm25 = index.bm25

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
        row["code"] = self._code_by_id.get(chunk_id, "")
        return row
