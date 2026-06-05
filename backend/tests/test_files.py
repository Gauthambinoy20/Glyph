"""Unit tests for reading an indexed file back out (build + the /api/file endpoint)."""

from app.analyze.files import read_indexed_file
from app.ingest.cache import embed_new_chunks
from app.main import app, get_embedder, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, make_chunk


def _store_with(tmp_path, chunks) -> ChromaStore:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


def test_read_file_joins_its_chunks_in_order(tmp_path) -> None:  # T62
    chunks = [
        make_chunk("def two(): pass", name="two", path="m.py", start=10, end=11),
        make_chunk("def one(): pass", name="one", path="m.py", start=1, end=2),
        make_chunk("def other(): pass", name="other", path="n.py", start=1, end=2),
    ]
    store = _store_with(tmp_path, chunks)

    result = read_indexed_file(store, "m.py")

    assert result is not None
    assert result["file_path"] == "m.py"
    assert result["start_line"] == 1 and result["end_line"] == 11
    # Chunks come back ordered by start line, so "one" precedes "two".
    assert [c["symbol_name"] for c in result["chunks"]] == ["one", "two"]
    assert result["code"].index("def one") < result["code"].index("def two")


def test_read_file_line_range_filters_chunks(tmp_path) -> None:  # T62 (range)
    chunks = [
        make_chunk("def one(): pass", name="one", path="m.py", start=1, end=2),
        make_chunk("def two(): pass", name="two", path="m.py", start=10, end=11),
    ]
    store = _store_with(tmp_path, chunks)

    result = read_indexed_file(store, "m.py", start=9, end=12)

    assert result is not None
    assert [c["symbol_name"] for c in result["chunks"]] == ["two"]


def test_read_file_unknown_path_is_none(tmp_path) -> None:  # T62 (not found)
    store = _store_with(tmp_path, [make_chunk("def a(): pass", name="a", path="m.py")])

    assert read_indexed_file(store, "nope.py") is None


def test_file_endpoint_returns_code_and_404s(tmp_path) -> None:  # T62 (endpoint)
    store = _store_with(tmp_path, [make_chunk("def a(): pass", name="a", path="m.py")])
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    try:
        client = TestClient(app)
        ok = client.get("/api/file", params={"path": "m.py"})
        missing = client.get("/api/file", params={"path": "ghost.py"})
    finally:
        app.dependency_overrides.clear()

    assert ok.status_code == 200
    assert ok.json()["file_path"] == "m.py"
    assert missing.status_code == 404
