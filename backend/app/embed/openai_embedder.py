"""The hosted embedding model (OpenAI), behind the same interface.

This is a thin, optional alternative to the local model. It exists to prove the
one-setting swap works. It is not used by default and only works if an OpenAI key is set.
Note: its vectors are 1536 long (different from bge-small's 384), so switching models
requires a fresh vector collection. That is handled by the store's collection name.
"""

from collections.abc import Sequence

# text-embedding-3-small returns 1536-dimensional vectors.
_OPENAI_SMALL_DIM = 1536


class OpenAIEmbedder:
    """Turn text into vectors with OpenAI's hosted model."""

    def __init__(
        self,
        model: str = "text-embedding-3-small",
        api_key: str | None = None,
    ) -> None:
        # Import lazily so the app does not need the openai package unless this is used.
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key)
        self._model = model
        self.dim = _OPENAI_SMALL_DIM

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed many passages in one API call."""
        response = self._client.embeddings.create(model=self._model, input=list(texts))
        return [item.embedding for item in response.data]

    def embed_query(self, text: str) -> list[float]:
        """Embed one question."""
        return self.embed_documents([text])[0]
