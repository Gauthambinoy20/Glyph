"""Cover the quality CLI scripts (evaluate / compare) end-to-end, offline.

The pure scorer is unit-tested in test_eval.py; this drives the ``python -m`` script
entrypoints themselves with fakes, so no real embedding model, reranker or network is
touched. Running each module under ``runpy`` with ``run_name="__main__"`` exercises both
``main()`` and the ``if __name__ == "__main__"`` guard.
"""

import runpy

import app.embed.factory as factory
import app.ingest.pipeline as pipeline
import app.rerank.cross_encoder as cross_encoder
import app.retrieve.hybrid as hybrid
import app.store.chroma_store as chroma_store
from tests.helpers import FakeEmbedder, FakeReranker


class _FakeStore:
    """Accepts ChromaStore's constructor args and does nothing — the scripts never query it."""

    def __init__(self, *args, **kwargs) -> None:
        pass


class _FakeRetriever:
    """Stands in for HybridRetriever: returns one deterministic result per query."""

    def __init__(self, *args, **kwargs) -> None:
        pass

    def search(self, question, top_k=5, pool=None, **kwargs):
        return [{"file_path": "app/retrieve/hybrid.py"}]


def _patch_pipeline(monkeypatch) -> None:
    """Swap the heavy ingest/retrieve pieces for offline fakes on their source modules."""
    monkeypatch.setattr(factory, "make_embedder", lambda *a, **k: FakeEmbedder())
    monkeypatch.setattr(pipeline, "ingest_path", lambda *a, **k: {"chunks_added": 0})
    monkeypatch.setattr(hybrid, "HybridRetriever", _FakeRetriever)
    monkeypatch.setattr(chroma_store, "ChromaStore", _FakeStore)


def test_evaluate_script_prints_hit_rate(monkeypatch, capsys) -> None:
    _patch_pipeline(monkeypatch)

    runpy.run_module("app.quality.evaluate", run_name="__main__")

    out = capsys.readouterr().out
    assert "hit-rate" in out


def test_compare_script_prints_backend_table(monkeypatch, capsys) -> None:
    _patch_pipeline(monkeypatch)
    monkeypatch.setattr(cross_encoder, "CrossEncoderReranker", lambda *a, **k: FakeReranker())

    runpy.run_module("app.quality.compare", run_name="__main__")

    out = capsys.readouterr().out
    assert "reranker" in out
