"""Unit tests for the file + symbol index (list_symbols + the /api/symbols route)."""

from app.analyze.symbols import list_symbols
from app.ingest.cache import embed_new_chunks
from app.main import app, get_embedder, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, make_chunk


def _store_with(tmp_path, chunks) -> ChromaStore:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


def test_lists_symbols_sorted_by_file_then_line(tmp_path) -> None:  # T64
    store = _store_with(
        tmp_path,
        [
            make_chunk("def b(): ...", name="b", path="z.py", start=20, end=21),
            make_chunk("def a(): ...", name="a", path="z.py", start=1, end=2),
            make_chunk("def c(): ...", name="c", path="a.py", start=5, end=6),
        ],
    )

    rows = list_symbols(store)

    # Sorted by file path, then by start line within a file.
    assert [(r["file_path"], r["symbol_name"]) for r in rows] == [
        ("a.py", "c"),
        ("z.py", "a"),
        ("z.py", "b"),
    ]
    assert rows[0]["type"] == "function"
    assert rows[1]["start_line"] == 1


def test_symbols_on_empty_index_is_empty(tmp_path) -> None:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    assert list_symbols(store) == []


def test_symbols_endpoint_returns_the_index(tmp_path) -> None:  # T64 (endpoint)
    store = _store_with(tmp_path, [make_chunk("def f(): ...", name="f", path="m.py")])
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    try:
        body = TestClient(app).get("/api/symbols").json()
    finally:
        app.dependency_overrides.clear()

    assert body["symbols"][0]["symbol_name"] == "f"
    assert body["symbols"][0]["file_path"] == "m.py"
