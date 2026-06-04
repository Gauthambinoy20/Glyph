"""Tests for the local embedding model.

These are marked `integration` because they run the real bge-small model, which is
downloaded from HuggingFace on first use. They run locally (where the model is cached),
but are skipped in CI, where shared runner IPs get rate-limited by HuggingFace. The fast
offline suite (store + cache, using a fake embedder) still covers the surrounding logic.
"""

import pytest
from app.embed.fastembed_embedder import FastEmbedEmbedder


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
