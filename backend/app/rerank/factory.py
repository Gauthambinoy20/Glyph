"""Pick the reranker based on settings — or None when reranking is turned off.

Keeps the on/off choice in one place so the rest of the app just asks for a reranker and gets
either a real one or None, and behaves the same either way.
"""

from app.config import Settings
from app.rerank.base import Reranker


def make_reranker(settings: Settings) -> Reranker | None:
    """Build the configured reranker, or None when reranker_enabled is False."""
    if not settings.reranker_enabled:
        return None

    # Imported here so the cross-encoder model is only pulled in when reranking is actually on.
    from app.rerank.cross_encoder import CrossEncoderReranker

    return CrossEncoderReranker(
        model_name=settings.reranker_model,
        cache_dir=settings.model_cache_dir,
    )
