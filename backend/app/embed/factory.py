"""Pick the embedder based on settings.

Keeps the choice of local vs hosted in one place. The local model is the default so
the app stays free and offline; switching to OpenAI is a single env change.
"""

from app.config import Settings
from app.embed.base import Embedder


def effective_embed_model(settings: Settings) -> str:
    """Return the model id actually in use, which depends on the backend.

    The vector store keys its collection on this name + the vector size, so the static model
    (256-dim) and the transformer (384-dim) never end up sharing a collection.
    """
    if settings.embed_backend == "static":
        return settings.static_model
    return settings.embed_model


def make_embedder(settings: Settings) -> Embedder:
    """Build the embedder named by settings.embed_backend."""
    if settings.embed_backend == "openai":
        # Imported here so the openai package is only needed when actually used.
        from app.embed.openai_embedder import OpenAIEmbedder

        return OpenAIEmbedder(
            model=settings.embed_model,
            api_key=settings.openai_api_key or None,
        )

    if settings.embed_backend == "static":
        # Imported here so model2vec is only loaded when fast mode is actually selected.
        from app.embed.model2vec_embedder import Model2VecEmbedder

        return Model2VecEmbedder(model_name=settings.static_model)

    from app.embed.fastembed_embedder import FastEmbedEmbedder

    return FastEmbedEmbedder(
        model_name=settings.embed_model,
        cache_dir=settings.model_cache_dir,
        threads=settings.embed_threads,
        batch_size=settings.embed_batch_size,
    )
