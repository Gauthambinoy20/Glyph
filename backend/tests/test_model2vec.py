"""Tests for the Model2Vec static embedder (the optional fast-mode backend).

The unit tests fake StaticModel so they run offline in CI; the integration test loads the real
potion-base-8M model and is skipped in CI (no network).
"""

import numpy as np
import pytest
from app.config import Settings
from app.embed.factory import effective_embed_model, make_embedder


class _FakeStaticModel:
    """A stand-in for model2vec's StaticModel: fixed 256-dim zero vectors, no download."""

    dim = 256

    @classmethod
    def from_pretrained(cls, path, **kwargs):
        model = cls()
        model.path = path
        return model

    def encode(self, sentences, **kwargs):
        return np.zeros((len(list(sentences)), self.dim))


def test_static_embedder_dim_and_shapes(monkeypatch) -> None:  # T81
    """The static embedder reports its dim and returns one vector of that size per text."""
    monkeypatch.setattr("app.embed.model2vec_embedder.StaticModel", _FakeStaticModel)
    from app.embed.model2vec_embedder import Model2VecEmbedder

    embedder = Model2VecEmbedder(model_name="minishlab/potion-base-8M")

    assert embedder.dim == 256
    vectors = embedder.embed_documents(["a", "b", "c"])
    assert len(vectors) == 3
    assert all(len(vector) == 256 for vector in vectors)
    assert len(embedder.embed_query("q")) == 256  # query embeds like a passage


def test_factory_builds_static_embedder_when_selected(monkeypatch) -> None:  # T82
    """embed_backend=static builds the Model2Vec embedder with the configured static_model."""
    monkeypatch.setattr("app.embed.model2vec_embedder.StaticModel", _FakeStaticModel)
    from app.embed.model2vec_embedder import Model2VecEmbedder

    embedder = make_embedder(
        Settings(embed_backend="static", static_model="minishlab/potion-base-8M")
    )
    assert isinstance(embedder, Model2VecEmbedder)


def test_effective_embed_model_tracks_the_backend() -> None:  # T82
    """The store's collection name follows the active model, so backends never collide."""
    assert effective_embed_model(Settings(embed_backend="local")) == "BAAI/bge-small-en-v1.5"
    assert (
        effective_embed_model(
            Settings(embed_backend="static", static_model="minishlab/potion-base-8M")
        )
        == "minishlab/potion-base-8M"
    )


@pytest.mark.integration
def test_static_embedder_returns_256_dim_vector() -> None:  # T83
    from app.embed.model2vec_embedder import Model2VecEmbedder

    embedder = Model2VecEmbedder()
    vector = embedder.embed_query("def add(a, b): return a + b")

    assert embedder.dim == 256
    assert len(vector) == 256
