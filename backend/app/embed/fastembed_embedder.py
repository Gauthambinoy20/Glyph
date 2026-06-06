"""The local embedding model: free, no API key, runs on the CPU.

Uses fastembed, which runs BAAI/bge-small-en-v1.5 through ONNX Runtime. That avoids a
heavy PyTorch install and gives a fast cold start. Each vector is 384 numbers long.
The model file downloads once on first use, then it is cached and reused.
"""

import logging
import os
from collections.abc import Sequence

from fastembed import TextEmbedding

logger = logging.getLogger(__name__)

# bge-small always produces 384-dimensional vectors.
_BGE_SMALL_DIM = 384

# bge-small is small enough that pinning every core as an ONNX intra-op thread hurts more
# than it helps on a many-core box: the threads contend and the first batch stalls. Cap the
# auto default here; an explicit embed_threads > 0 always overrides it.
_DEFAULT_MAX_THREADS = 8


class FastEmbedEmbedder:
    """Turn text into vectors locally with bge-small."""

    def __init__(
        self,
        model_name: str = "BAAI/bge-small-en-v1.5",
        cache_dir: str | None = None,
        threads: int = 0,
        batch_size: int = 256,
        use_gpu: bool = False,
    ) -> None:
        # threads<=0 → auto: use the cores we have, but capped so a many-core box does not
        # oversubscribe ONNX and stall the first batch. An explicit threads > 0 always wins.
        cores = os.cpu_count() or 1
        resolved_threads = threads if threads > 0 else min(_DEFAULT_MAX_THREADS, cores)

        # Load the model once. fastembed downloads it on first use, then caches it.
        def _build(cuda: bool) -> TextEmbedding:
            return TextEmbedding(
                model_name=model_name, cache_dir=cache_dir, threads=resolved_threads, cuda=cuda
            )

        # GPU is opt-in and best-effort: if onnxruntime-gpu or a CUDA device is missing, degrade
        # to CPU instead of crashing. Off by default, so the normal path is plain CPU.
        if use_gpu:
            try:
                self._model = _build(cuda=True)
            except Exception:  # noqa: BLE001 - any GPU init failure should fall back to CPU
                logger.warning("GPU embedding unavailable; falling back to CPU")
                self._model = _build(cuda=False)
        else:
            self._model = _build(cuda=False)
        self._batch_size = max(1, batch_size)
        self.dim = _BGE_SMALL_DIM

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed code passages. fastembed yields numpy arrays, so we convert to lists."""
        return [
            vector.tolist()
            for vector in self._model.embed(list(texts), batch_size=self._batch_size)
        ]

    def embed_query(self, text: str) -> list[float]:
        """Embed one question.

        bge-small v1.5 works well without a special query prefix, and the golden rule is
        to embed queries and passages the same way, so we reuse embed_documents here.
        """
        return self.embed_documents([text])[0]
