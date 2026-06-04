"""Unit tests for the local embedding model.

These run the real bge-small model, which downloads once on first use (about 30 to
130 MB) and is cached afterwards. They confirm the model produces 384-number vectors.
"""

from app.embed.fastembed_embedder import FastEmbedEmbedder


def test_local_embedder_returns_384_dim_vector() -> None:  # T14
    embedder = FastEmbedEmbedder(cache_dir=".model_cache")
    vector = embedder.embed_query("def add(a, b): return a + b")

    assert embedder.dim == 384
    assert len(vector) == 384
    assert all(isinstance(value, float) for value in vector[:5])


def test_local_embedder_embeds_many_documents() -> None:  # T15
    embedder = FastEmbedEmbedder(cache_dir=".model_cache")
    vectors = embedder.embed_documents(["hello world", "def f(): pass"])

    assert len(vectors) == 2
    assert all(len(vector) == 384 for vector in vectors)
