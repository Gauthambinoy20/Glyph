"""The local embedding model: free, no API key, runs on the CPU.

Uses fastembed, which runs BAAI/bge-small-en-v1.5 through ONNX Runtime. That avoids a
heavy PyTorch install and gives a fast cold start. Each vector is 384 numbers long.
The model file downloads once on first use, then it is cached and reused.
"""

from collections.abc import Sequence

from fastembed import TextEmbedding

# bge-small always produces 384-dimensional vectors.
_BGE_SMALL_DIM = 384


class FastEmbedEmbedder:
    """Turn text into vectors locally with bge-small."""

    def __init__(
        self,
        model_name: str = "BAAI/bge-small-en-v1.5",
        cache_dir: str | None = None,
    ) -> None:
        # Load the model once. fastembed downloads it on first use, then caches it.
        self._model = TextEmbedding(model_name=model_name, cache_dir=cache_dir)
        self.dim = _BGE_SMALL_DIM

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed code passages. fastembed yields numpy arrays, so we convert to lists."""
        return [vector.tolist() for vector in self._model.embed(list(texts))]

    def embed_query(self, text: str) -> list[float]:
        """Embed one question.

        bge-small v1.5 works well without a special query prefix, and the golden rule is
        to embed queries and passages the same way, so we reuse embed_documents here.
        """
        return self.embed_documents([text])[0]
