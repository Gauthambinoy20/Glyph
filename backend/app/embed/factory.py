"""Pick the embedder based on settings.

Keeps the choice of local vs hosted in one place. The local model is the default so
the app stays free and offline; switching to OpenAI is a single env change.
"""

from app.config import Settings
from app.embed.base import Embedder


def make_embedder(settings: Settings) -> Embedder:
    """Build the embedder named by settings.embed_backend."""
    if settings.embed_backend == "openai":
        # Imported here so the openai package is only needed when actually used.
        from app.embed.openai_embedder import OpenAIEmbedder

        return OpenAIEmbedder(
            model=settings.embed_model,
            api_key=settings.openai_api_key or None,
        )

    from app.embed.fastembed_embedder import FastEmbedEmbedder

    return FastEmbedEmbedder(
        model_name=settings.embed_model,
        cache_dir=settings.model_cache_dir,
    )
