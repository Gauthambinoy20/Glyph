"""A static embedder: the fast path for ingest.

Model2Vec distills a transformer into static token embeddings, so embedding a passage becomes a
token lookup plus a mean-pool — no neural-network forward pass. On a CPU that is orders of
magnitude faster than bge-small, which makes ingesting a large repo near-instant. Quality is
lower than a transformer bi-encoder, but Glyph's keyword (BM25) half of hybrid retrieval and the
cross-encoder reranker recover the precision, so the pairing stays fast AND accurate.

potion-base-8M produces 256-dimensional vectors. The model downloads once, then is cached.
"""

from collections.abc import Sequence

from model2vec import StaticModel


class Model2VecEmbedder:
    """Turn text into vectors locally with Model2Vec static embeddings."""

    def __init__(self, model_name: str = "minishlab/potion-base-8M") -> None:
        # Loads (and downloads on first use) the static model; .dim is its vector length.
        self._model = StaticModel.from_pretrained(model_name)
        self.dim = int(self._model.dim)

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed many passages at once. encode() returns a numpy array, so convert to lists."""
        vectors = self._model.encode(list(texts))
        return [vector.tolist() for vector in vectors]

    def embed_query(self, text: str) -> list[float]:
        """Embed one question the same way as passages (consistent query/passage encoding)."""
        return self.embed_documents([text])[0]
