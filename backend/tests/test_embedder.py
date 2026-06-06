"""Tests for the local embedding model.

These are marked `integration` because they run the real bge-small model, which is
downloaded from HuggingFace on first use. They run locally (where the model is cached),
but are skipped in CI, where shared runner IPs get rate-limited by HuggingFace. The fast
offline suite (store + cache, using a fake embedder) still covers the surrounding logic.
"""

import pytest
from app.embed.fastembed_embedder import FastEmbedEmbedder


def test_embedder_passes_threads_and_batch_to_fastembed(
    monkeypatch,
) -> None:  # T67 (CI-safe, no model)
    """The threads + batch-size knobs reach fastembed (the ingest-speed levers)."""
    captured: dict = {}

    class _FakeModel:
        def __init__(self, model_name: str, cache_dir=None, threads=None, cuda=False) -> None:
            captured["threads"] = threads

        def embed(self, texts, batch_size=256):
            captured["batch_size"] = batch_size
            return [_FakeVec() for _ in texts]

    class _FakeVec:
        def tolist(self) -> list[float]:
            return [0.0] * 384

    monkeypatch.setattr("app.embed.fastembed_embedder.TextEmbedding", _FakeModel)

    embedder = FastEmbedEmbedder(threads=4, batch_size=128)
    vectors = embedder.embed_documents(["a", "b"])

    assert captured["threads"] == 4  # explicit thread count reaches the model
    assert captured["batch_size"] == 128  # batch size reaches embed()
    assert len(vectors) == 2 and len(vectors[0]) == 384


def test_embedder_threads_zero_is_auto_capped(monkeypatch) -> None:  # T67
    import os

    captured: dict = {}
    monkeypatch.setattr(
        "app.embed.fastembed_embedder.TextEmbedding",
        lambda model_name, cache_dir=None, threads=None, cuda=False: captured.setdefault(
            "threads", threads
        ),
    )
    FastEmbedEmbedder(threads=0)
    # 0 → auto: use the cores, but capped at 8 so a many-core box does not oversubscribe ONNX.
    assert captured["threads"] == min(8, os.cpu_count() or 1)


def test_make_embedder_builds_the_local_fastembed_backend(monkeypatch) -> None:  # factory default
    """make_embedder's default ("local") branch constructs the fastembed embedder, no download."""
    monkeypatch.setattr(
        "app.embed.fastembed_embedder.TextEmbedding",
        lambda model_name, cache_dir=None, threads=None, cuda=False: object(),
    )
    from app.config import Settings
    from app.embed.factory import make_embedder

    embedder = make_embedder(Settings(embed_backend="local"))
    assert isinstance(embedder, FastEmbedEmbedder)


def test_embedder_requests_gpu_when_enabled(monkeypatch) -> None:  # GPU opt-in
    """use_gpu=True passes cuda=True through to fastembed."""
    captured: dict = {}
    monkeypatch.setattr(
        "app.embed.fastembed_embedder.TextEmbedding",
        lambda model_name, cache_dir=None, threads=None, cuda=False: captured.setdefault(
            "cuda", cuda
        ),
    )
    FastEmbedEmbedder(use_gpu=True)
    assert captured["cuda"] is True


def test_embedder_falls_back_to_cpu_when_gpu_unavailable(monkeypatch) -> None:  # GPU fallback
    """If the CUDA build raises (no onnxruntime-gpu / no device), it retries on CPU."""
    seen: list[bool] = []

    def fake(model_name, cache_dir=None, threads=None, cuda=False):
        seen.append(cuda)
        if cuda:
            raise RuntimeError("no CUDA execution provider")
        return object()

    monkeypatch.setattr("app.embed.fastembed_embedder.TextEmbedding", fake)
    FastEmbedEmbedder(use_gpu=True)
    assert seen == [True, False]  # tried GPU, then fell back to CPU


@pytest.mark.integration
def test_local_embedder_returns_384_dim_vector() -> None:  # T14
    embedder = FastEmbedEmbedder(cache_dir=".model_cache")
    vector = embedder.embed_query("def add(a, b): return a + b")

    assert embedder.dim == 384
    assert len(vector) == 384
    assert all(isinstance(value, float) for value in vector[:5])


@pytest.mark.integration
def test_local_embedder_embeds_many_documents() -> None:  # T15
    embedder = FastEmbedEmbedder(cache_dir=".model_cache")
    vectors = embedder.embed_documents(["hello world", "def f(): pass"])

    assert len(vectors) == 2
    assert all(len(vector) == 384 for vector in vectors)
