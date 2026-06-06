"""Real cross-language retrieval eval over pinned public repos, in both shipped modes.

Clone each golden repo at its pinned commit, ingest it for real, and measure how often the
expected file is retrieved.

Nothing here is mocked. It uses the real embedders (fast = Model2Vec, careful = bge-small), the
real cross-encoder reranker, and real repositories checked out at a fixed SHA. So the hit-rate
it prints is the hit-rate a user would actually get — it is the headline accuracy number behind
the "fast AND accurate" claim, and the test that would have caught a fast-mode regression.

    python -m app.quality.evaluate_repos

(The offline unit tests drive this same code with fakes to keep it covered; the numbers in the
docs always come from a real run, never from those fakes.)
"""

import json
import shutil
import tempfile

from app.config import Settings
from app.embed.factory import effective_embed_model, make_embedder
from app.ingest.cloner import clone_at_commit
from app.ingest.pipeline import ingest_path
from app.quality.compare import _RerankedRetriever
from app.quality.evaluate import evaluate
from app.quality.golden_repos import REPO_GOLDEN
from app.rerank.cross_encoder import CrossEncoderReranker
from app.retrieve.hybrid import HybridRetriever
from app.store.chroma_store import ChromaStore

# The two shipped modes, labelled by the embed_backend each one selects.
_MODES = [("fast", "static"), ("careful", "local")]

# Where the machine-readable report is written (and uploaded as a CI artifact).
REPORT_PATH = "eval_report.json"


def _score(repo_dir: str, questions: list[dict], settings: Settings, reranker) -> dict:
    """Ingest one checked-out repo and return its golden-set report (reranked, like production)."""
    embedder = make_embedder(settings)
    with tempfile.TemporaryDirectory() as tmp:
        store = ChromaStore(path=tmp, embed_model=effective_embed_model(settings), dim=embedder.dim)
        ingest_path(repo_dir, store, embedder)
        base = HybridRetriever(store, embedder)
        retriever = _RerankedRetriever(base, reranker, settings.rerank_candidates)
        return evaluate(retriever, questions)


def evaluate_repo(repo: dict, backend: str, reranker) -> dict:
    """Check out one golden repo (local folder or pinned clone) and score it in one mode."""
    settings = Settings(embed_backend=backend)
    local = repo.get("local_path")
    repo_dir = local or clone_at_commit(repo["url"], repo["commit"])
    try:
        return _score(repo_dir, repo["questions"], settings, reranker)
    finally:
        if not local:
            shutil.rmtree(repo_dir, ignore_errors=True)


def run(repos: list[dict] = REPO_GOLDEN) -> dict:
    """Score every repo in every shipped mode and return a structured report."""
    reranker = CrossEncoderReranker(model_name=Settings().reranker_model)
    results = []
    for repo in repos:
        row: dict = {"repo": repo["name"], "language": repo["language"], "modes": {}}
        for label, backend in _MODES:
            report = evaluate_repo(repo, backend, reranker)
            row["modes"][label] = {
                "hits": report["hits"],
                "total": report["total"],
                "hit_rate": report["hit_rate"],
            }
        results.append(row)
    return {"repos": results, "modes": [label for label, _ in _MODES]}


def _overall(results: list[dict], mode: str) -> float:
    """Aggregate hit-rate across all repos for one mode (questions weighted equally)."""
    hits = sum(r["modes"][mode]["hits"] for r in results)
    total = sum(r["modes"][mode]["total"] for r in results)
    return hits / total if total else 0.0


def main() -> None:
    """Run the full real evaluation, print a per-repo table, and write the JSON report."""
    report = run()
    results, modes = report["repos"], report["modes"]

    print("\n  GLYPH RETRIEVAL QUALITY — real repos x mode (top-5, reranked)\n  " + "-" * 60)
    print(f"  {'repo':<22}{'lang':<12}" + "".join(f"{m:>12}" for m in modes))
    print("  " + "-" * 60)
    for r in results:
        cells = "".join(f"{r['modes'][m]['hit_rate'] * 100:>11.0f}%" for m in modes)
        print(f"  {r['repo']:<22}{r['language']:<12}{cells}")
    print("  " + "-" * 60)
    overall = "".join(f"{_overall(results, m) * 100:>11.0f}%" for m in modes)
    print(f"  {'OVERALL':<22}{'':<12}{overall}")

    with open(REPORT_PATH, "w") as handle:
        json.dump(report, handle, indent=2)
    print(f"\n  wrote {REPORT_PATH}\n")


if __name__ == "__main__":
    main()
