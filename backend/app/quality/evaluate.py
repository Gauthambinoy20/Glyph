"""Measure retrieval quality: is the expected file in the top-k for each golden question.

The scoring (`evaluate`) is pure and works against any object with a `search` method, so it
is unit-tested with a fake. Running this module as a script builds the real pipeline over
Glyph's own backend and prints a hit-rate — the headline quality number.

    python -m app.quality.evaluate
"""

from collections.abc import Sequence
from typing import Protocol


class _Retriever(Protocol):
    """The slice of HybridRetriever that evaluate needs."""

    def search(self, question: str, top_k: int = ...) -> list[dict]: ...


def evaluate(retriever: _Retriever, golden: Sequence[dict], top_k: int = 5) -> dict:
    """Score a golden set: a question is a hit if its expected file is in the top-k results.

    Returns {hits, total, hit_rate, details[]} where each detail records the question, the
    expected file, whether it was found, and the files that were actually retrieved.
    """
    details = []
    hits = 0
    for item in golden:
        results = retriever.search(item["question"], top_k=top_k)
        files = [str(r.get("file_path", "")) for r in results]
        hit = any(item["expect"] in f for f in files)
        hits += 1 if hit else 0
        details.append(
            {"question": item["question"], "expect": item["expect"], "hit": hit, "files": files}
        )
    total = len(golden)
    return {
        "hits": hits,
        "total": total,
        "hit_rate": (hits / total) if total else 0.0,
        "details": details,
    }


def main() -> None:
    """Build the real index over the backend's own app/ and print the golden hit-rate."""
    import tempfile

    from app.config import get_settings
    from app.embed.factory import make_embedder
    from app.ingest.pipeline import ingest_path
    from app.quality.golden import GOLDEN
    from app.retrieve.hybrid import HybridRetriever
    from app.store.chroma_store import ChromaStore

    settings = get_settings()
    embedder = make_embedder(settings)
    with tempfile.TemporaryDirectory() as tmp:
        store = ChromaStore(path=tmp, embed_model=settings.embed_model, dim=embedder.dim)
        ingest_path("app", store, embedder)
        report = evaluate(HybridRetriever(store, embedder), GOLDEN)

    print("\n  GLYPH RETRIEVAL QUALITY (golden set)\n  " + "-" * 48)
    for d in report["details"]:
        mark = "\033[32m✓\033[0m" if d["hit"] else "\033[31m✗\033[0m"
        print(f"  {mark}  {d['question'][:52]:52}  → {d['expect']}")
    pct = report["hit_rate"] * 100
    print("  " + "-" * 48)
    print(f"  hit-rate: {report['hits']}/{report['total']} = {pct:.0f}%\n")


if __name__ == "__main__":
    main()
