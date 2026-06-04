"""Unit tests for the content-hash embedding cache."""

from app.ingest.cache import chunk_id, embed_new_chunks
from app.store.chroma_store import ChromaStore

from tests.helpers import FakeEmbedder, make_chunk


def test_chunk_id_depends_only_on_code() -> None:  # T19
    same_code_a = make_chunk("def f(): return 1", name="f")
    same_code_b = make_chunk("def f(): return 1", name="different_name")
    other_code = make_chunk("def f(): return 2", name="f")

    assert chunk_id(same_code_a) == chunk_id(same_code_b)  # name does not matter
    assert chunk_id(same_code_a) != chunk_id(other_code)  # code does


def test_unchanged_code_is_not_re_embedded(tmp_path) -> None:  # T20
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embedder = FakeEmbedder(dim=8)
    chunks = [make_chunk("def a(): pass", name="a"), make_chunk("def b(): pass", name="b")]

    first = embed_new_chunks(chunks, store, embedder)
    assert first == {"added": 2, "cached": 0}
    assert embedder.embedded == 2

    second = embed_new_chunks(chunks, store, embedder)
    assert second == {"added": 0, "cached": 2}
    assert embedder.embedded == 2  # nothing embedded the second time


def test_editing_one_chunk_re_embeds_only_it(tmp_path) -> None:  # T21
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embedder = FakeEmbedder(dim=8)
    a = make_chunk("def a(): pass", name="a")
    b = make_chunk("def b(): pass", name="b")
    embed_new_chunks([a, b], store, embedder)
    assert embedder.embedded == 2

    edited_a = make_chunk("def a(): return 99", name="a")  # different code -> new id
    result = embed_new_chunks([edited_a, b], store, embedder)

    assert result == {"added": 1, "cached": 1}
    assert embedder.embedded == 3  # only the edited chunk was embedded again
