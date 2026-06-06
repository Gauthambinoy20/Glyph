"""Cover the real cross-language eval runner offline (no clone, no models, no network).

The hit-rate numbers in the docs always come from running this for real
(``python -m app.quality.evaluate_repos``). Here we drive the same code with fakes so every
line is exercised and the aggregation maths is pinned, while CI stays fast and offline.
Running the module under ``runpy`` with ``run_name="__main__"`` re-imports it after the source
modules are patched, so its ``from x import y`` names bind to the fakes (no real model loads).
"""

import json
import runpy

import app.embed.factory as factory
import app.ingest.cloner as cloner
import app.ingest.pipeline as pipeline
import app.quality.evaluate_repos as evaluate_repos
import app.rerank.cross_encoder as cross_encoder
import app.retrieve.hybrid as hybrid
import app.store.chroma_store as chroma_store

from tests.helpers import FakeEmbedder, FakeReranker


class _FakeStore:
    """Accepts ChromaStore's constructor args and does nothing — the runner never queries it."""

    def __init__(self, *args, **kwargs) -> None:
        pass


class _FakeRetriever:
    """Stands in for HybridRetriever: returns one deterministic result per query."""

    def __init__(self, *args, **kwargs) -> None:
        pass

    def search(self, question, top_k=5, pool=None, **kwargs):
        return [{"file_path": "src/click/core.py"}]


def _patch_pipeline(monkeypatch) -> None:
    """Swap the heavy ingest/retrieve/clone pieces for offline fakes on their source modules."""
    monkeypatch.setattr(factory, "make_embedder", lambda *a, **k: FakeEmbedder())
    monkeypatch.setattr(pipeline, "ingest_path", lambda *a, **k: {"added": 0})
    monkeypatch.setattr(hybrid, "HybridRetriever", _FakeRetriever)
    monkeypatch.setattr(chroma_store, "ChromaStore", _FakeStore)
    monkeypatch.setattr(cross_encoder, "CrossEncoderReranker", lambda *a, **k: FakeReranker())
    # No network: a pinned clone returns a throwaway path that need not exist (rmtree ignores it).
    monkeypatch.setattr(cloner, "clone_at_commit", lambda url, commit, **k: "/tmp/glyph_eval_fake")


def test_overall_aggregates_hits_across_repos() -> None:
    results = [
        {"modes": {"fast": {"hits": 4, "total": 5}}},
        {"modes": {"fast": {"hits": 3, "total": 5}}},
    ]
    assert evaluate_repos._overall(results, "fast") == 0.7  # 7 hits of 10 questions
    assert evaluate_repos._overall([], "fast") == 0.0  # an empty set never divides by zero


def test_run_scores_every_repo_in_every_mode(monkeypatch) -> None:
    monkeypatch.setattr(evaluate_repos, "CrossEncoderReranker", lambda *a, **k: FakeReranker())
    monkeypatch.setattr(
        evaluate_repos,
        "evaluate_repo",
        lambda repo, backend, reranker: {"hits": 1, "total": 1, "hit_rate": 1.0},
    )
    repos = [
        {
            "name": "local-one",
            "language": "python",
            "local_path": "app",
            "questions": [{"question": "q", "expect": "x"}],
        },
        {
            "name": "pinned/two",
            "language": "javascript",
            "url": "https://github.com/pinned/two",
            "commit": "a" * 40,
            "questions": [{"question": "q", "expect": "x"}],
        },
    ]

    report = evaluate_repos.run(repos)

    assert [r["repo"] for r in report["repos"]] == ["local-one", "pinned/two"]
    assert report["modes"] == ["fast", "careful"]
    for row in report["repos"]:
        assert set(row["modes"]) == {"fast", "careful"}  # both shipped modes scored
        assert row["modes"]["fast"]["hit_rate"] == 1.0


def test_evaluate_repos_script_prints_table_and_writes_report(
    monkeypatch, tmp_path, capsys
) -> None:
    _patch_pipeline(monkeypatch)
    monkeypatch.chdir(tmp_path)  # the JSON report lands in the temp dir, not the repo

    runpy.run_module("app.quality.evaluate_repos", run_name="__main__")

    out = capsys.readouterr().out
    assert "OVERALL" in out  # the summary row printed
    report = json.loads((tmp_path / "eval_report.json").read_text())
    assert report["modes"] == ["fast", "careful"]
    assert len(report["repos"]) == len(evaluate_repos.REPO_GOLDEN)  # every golden repo scored
