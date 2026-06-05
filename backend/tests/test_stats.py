"""Unit tests for repo stats (the build_stats summary and the /api/stats endpoint)."""

from app.analyze.stats import build_stats
from app.ingest.cache import embed_new_chunks
from app.main import app, get_embedder, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, make_chunk


def _store_with(tmp_path, chunks) -> ChromaStore:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


def test_stats_counts_files_chunks_and_languages(tmp_path) -> None:  # T61
    chunks = [
        make_chunk("def a(): pass", name="a", path="x.py"),
        make_chunk("def b(): pass", name="b", path="x.py"),  # same file, second chunk
        make_chunk("def c(): pass", name="c", path="y.py"),
    ]
    for chunk in chunks:  # make_chunk defaults to python; set language explicitly for clarity
        chunk.language = "python"
    js = make_chunk("function d() {}", name="d", path="z.js")
    js.language = "javascript"
    store = _store_with(tmp_path, [*chunks, js])

    stats = build_stats(store)

    assert stats["files"] == 3  # x.py, y.py, z.js
    assert stats["chunks"] == 4  # four chunks total
    by_lang = {row["language"]: row for row in stats["languages"]}
    assert by_lang["python"] == {"language": "python", "files": 2, "chunks": 3}
    assert by_lang["javascript"] == {"language": "javascript", "files": 1, "chunks": 1}
    # Per-language counts add up to the totals.
    assert sum(row["chunks"] for row in stats["languages"]) == stats["chunks"]
    # Most-used language is listed first.
    assert stats["languages"][0]["language"] == "python"


def test_stats_endpoint_returns_breakdown(tmp_path) -> None:  # T61 (endpoint)
    store = _store_with(tmp_path, [make_chunk("def a(): pass", name="a", path="x.py")])
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    try:
        body = TestClient(app).get("/api/stats").json()
    finally:
        app.dependency_overrides.clear()

    assert body["files"] == 1
    assert body["chunks"] == 1
    assert body["languages"][0]["language"] == "python"


def test_stats_on_empty_index_is_zero(tmp_path) -> None:  # edge: nothing ingested yet
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)

    stats = build_stats(store)

    assert stats == {"files": 0, "chunks": 0, "languages": []}
