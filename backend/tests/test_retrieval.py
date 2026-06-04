"""Unit tests for hybrid retrieval (tokenizer + the HybridRetriever)."""

from app.ingest.cache import embed_new_chunks
from app.retrieve.hybrid import HybridRetriever
from app.retrieve.tokenize import tokenize_code
from app.store.chroma_store import ChromaStore

from tests.helpers import FakeEmbedder, make_chunk


def _store_with(tmp_path, chunks) -> ChromaStore:
    """Build a fresh store and load it with the given chunks via the fake embedder."""
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


def test_tokenizer_splits_identifiers() -> None:  # T29
    tokens = tokenize_code("getUserById and snake_case_name")
    for expected in ["get", "user", "by", "id", "snake", "case", "name"]:
        assert expected in tokens


def test_exact_symbol_is_found(tmp_path) -> None:  # T30
    names = ["alpha", "multiply", "gamma", "delta", "epsilon", "zeta"]
    store = _store_with(tmp_path, [make_chunk(f"def {n}(): pass", name=n) for n in names])

    results = HybridRetriever(store, FakeEmbedder(dim=8)).search(
        "where is the multiply function defined", top_k=5
    )

    assert any(row["symbol_name"] == "multiply" for row in results)


def test_semantic_match_ranks_first(tmp_path) -> None:  # T31
    target = "def the_target_function(): return 42"
    chunks = [
        make_chunk("def alpha(): return 1", name="alpha"),
        make_chunk(target, name="the_target_function"),
        make_chunk("def gamma(): return 3", name="gamma"),
    ]
    store = _store_with(tmp_path, chunks)

    # Querying with the chunk's own text should make it the top hit.
    results = HybridRetriever(store, FakeEmbedder(dim=8)).search(target, top_k=3)

    assert results[0]["symbol_name"] == "the_target_function"


def test_empty_index_returns_nothing(tmp_path) -> None:  # T32
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    assert HybridRetriever(store, FakeEmbedder(dim=8)).search("anything", top_k=5) == []


def test_results_are_stable(tmp_path) -> None:  # T33
    store = _store_with(
        tmp_path, [make_chunk(f"def fn{i}(): return {i}", name=f"fn{i}") for i in range(8)]
    )
    retriever = HybridRetriever(store, FakeEmbedder(dim=8))

    first = [row["id"] for row in retriever.search("return a value", top_k=5)]
    second = [row["id"] for row in retriever.search("return a value", top_k=5)]

    assert first == second
    assert len(first) == 5
