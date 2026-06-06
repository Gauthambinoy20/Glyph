"""The exact two-stage retrieval used to answer a question.

Both the live ``/ask`` path (``main._retrieve``) and the offline quality harness
(``quality.compare`` and ``quality.evaluate_repos``) call this one function, so the measured
hit-rate is scored against the very pipeline users hit. There is no second, drifting copy that
could quietly rerank a different number of candidates and report a number that is not real.
"""

from app.rerank.base import Reranker
from app.retrieve.hybrid import HybridRetriever


def two_stage_search(
    retriever: HybridRetriever,
    reranker: Reranker | None,
    retrieval_query: str,
    rerank_query: str,
    top_k: int,
    candidates: int,
) -> list[dict]:
    """Return the top_k grounding chunks.

    With no reranker this is just the hybrid top_k. With one, the retriever casts a wider net of
    ``candidates`` chunks and the cross-encoder reorders that pool down to top_k by true relevance.
    ``retrieval_query`` may carry follow-up context; ``rerank_query`` is the bare question the
    cross-encoder scores against.
    """
    if reranker is None:
        return retriever.search(retrieval_query, top_k=top_k)
    pool = max(candidates, top_k)
    found = retriever.search(retrieval_query, top_k=pool, pool=max(20, pool))
    return reranker.rerank(rerank_query, found, top_k=top_k)
