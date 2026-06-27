"""Unit tests for the Chroma vector store."""

import pytest
from app.store.chroma_store import ChromaStore

from tests.helpers import make_chunk


def test_store_add_and_query_roundtrip(tmp_path) -> None:  # T16
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=4)
    chunk = make_chunk("def add(): pass", name="add", path="x.py", start=1, end=1)

    store.add(["id1"], [chunk], [[1.0, 0.0, 0.0, 0.0]])
    result = store.query([1.0, 0.0, 0.0, 0.0], k=1)

    assert result["ids"][0][0] == "id1"
    assert result["metadatas"][0][0]["symbol_name"] == "add"
    assert result["metadatas"][0][0]["start_line"] == 1


def test_store_returns_nearest_by_similarity(tmp_path) -> None:  # T17
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=2)
    store.add(
        ["a", "b"], [make_chunk("a", name="a"), make_chunk("b", name="b")], [[1.0, 0.0], [0.0, 1.0]]
    )

    result = store.query([1.0, 0.1], k=2)

    assert result["ids"][0][0] == "a"  # closest to the [1, 0] vector


def test_store_rejects_wrong_vector_size(tmp_path) -> None:  # T18
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=4)
    with pytest.raises(ValueError):
        store.add(["id1"], [make_chunk("x")], [[1.0, 0.0, 0.0]])  # length 3, not 4


def test_all_chunks_is_memoised_and_invalidated(tmp_path) -> None:  # T18b
    """all_chunks caches the full read, and adding or resetting drops the cache."""
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=4)
    store.add(["id1"], [make_chunk("a", path="a.py")], [[1.0, 0.0, 0.0, 0.0]])

    first = store.all_chunks()
    assert store.all_chunks() is first  # second call returns the same cached object

    # Adding a chunk invalidates the cache, so the next read reflects the new chunk.
    store.add(["id2"], [make_chunk("b", path="b.py")], [[0.0, 1.0, 0.0, 0.0]])
    refreshed = store.all_chunks()
    assert refreshed is not first
    assert len(refreshed["ids"]) == 2

    store.reset()
    assert store.all_chunks()["ids"] == []  # reset drops everything and the cache
