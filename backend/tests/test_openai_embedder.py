"""Unit tests for the OpenAI embedder and the factory's OpenAI branch (mocked, no network)."""

from types import SimpleNamespace

import openai
from app.config import Settings
from app.embed.factory import make_embedder
from app.embed.openai_embedder import OpenAIEmbedder


class _FakeEmbeddings:
    """Stands in for client.embeddings; returns a fixed 1536-dim vector per input."""

    def create(self, model: str, input: list[str]):  # noqa: A002 - mirror the OpenAI SDK arg name
        return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 1536) for _ in input])


class _FakeOpenAI:
    def __init__(self, api_key: str | None = None) -> None:
        self.embeddings = _FakeEmbeddings()


def test_openai_embedder_returns_1536_dim_vectors(monkeypatch) -> None:
    monkeypatch.setattr(openai, "OpenAI", _FakeOpenAI)

    embedder = OpenAIEmbedder(api_key="k")

    assert embedder.dim == 1536
    vectors = embedder.embed_documents(["a", "b"])
    assert len(vectors) == 2
    assert all(len(v) == 1536 for v in vectors)
    assert embedder.embed_query("q") == [0.1] * 1536


def test_factory_builds_the_openai_embedder_when_selected(monkeypatch) -> None:
    monkeypatch.setattr(openai, "OpenAI", _FakeOpenAI)
    settings = Settings(embed_backend="openai", openai_api_key="k")

    embedder = make_embedder(settings)

    assert isinstance(embedder, OpenAIEmbedder)
    assert embedder.dim == 1536
