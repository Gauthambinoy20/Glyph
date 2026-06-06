"""Cover the small defensive/edge branches across modules to reach full coverage.

Each test targets one or two specific lines that the happy-path suite never reaches:
empty inputs, not-found ranges, oversized/blank files, scoped imports, the older-Chroma
config fallback, and the offline-only success paths of the cloner and embedder. All run
offline with fakes or tiny on-disk fixtures.
"""

import os
import shutil

import chromadb
import pytest
from app.llm.client import LLMError
from app.store.chroma_store import ChromaStore

from tests.helpers import FakeEmbedder


class _FakeStore:
    """A minimal store stand-in exposing only all_chunks(), for the analyze/rag helpers."""

    def __init__(self, docs: list[str], metas: list[dict]) -> None:
        self._docs = docs
        self._metas = metas

    def all_chunks(self) -> dict:
        return {"documents": self._docs, "metadatas": self._metas}


# ---- analyze/endpoints.py: Flask route with no methods (-> GET) and a non-"/" path ----


def test_detect_endpoints_flask_default_get_and_skips_relative_path() -> None:
    from app.analyze.endpoints import detect_endpoints

    code = '@app.route("/items")\n@app.route("relative", methods=["GET"])'
    routes = detect_endpoints(_FakeStore([code], [{}]))

    assert {"method": "GET", "path": "/items"} in routes  # no methods -> GET
    assert all(route["path"] != "relative" for route in routes)  # non-"/" path skipped


# ---- analyze/files.py: a line range that matches nothing in the file -> None ----


def test_read_indexed_file_range_matches_nothing() -> None:
    from app.analyze.files import read_indexed_file

    meta = {
        "file_path": "a.py",
        "start_line": 1,
        "end_line": 2,
        "language": "python",
        "symbol_name": "f",
        "type": "function",
    }
    store = _FakeStore(["def f(): ..."], [meta])

    assert read_indexed_file(store, "a.py", start=100, end=200) is None


# ---- analyze/graph.py: a relative JS import that resolves to no known file ----


def test_build_import_graph_unresolved_relative_import_adds_no_edge() -> None:
    from app.analyze.graph import build_import_graph

    store = _FakeStore(["import {x} from './missing'"], [{"file_path": "a.ts", "language": "ts"}])

    graph = build_import_graph(store)

    assert graph["edges"] == []  # './missing' is not a known file, so no edge


# ---- analyze/stack.py: _top_level for scoped, relative and dotted specs ----


def test_stack_top_level_handles_scoped_relative_and_dotted() -> None:
    from app.analyze.stack import _top_level

    assert _top_level("@scope/pkg") == "@scope/pkg"  # scoped package keeps @scope/name
    assert _top_level("./x") == ""  # relative/internal import
    assert _top_level("fastapi.responses") == "fastapi"


# ---- embed/fastembed_embedder.py: embed_query (with a fake ONNX model) ----


def test_fastembed_embed_query_uses_embed_documents(monkeypatch) -> None:
    import app.embed.fastembed_embedder as module

    class _FakeVec:
        def tolist(self) -> list[float]:
            return [0.0, 1.0]

    class _FakeTextEmbedding:
        def __init__(self, **kwargs) -> None:
            pass

        def embed(self, texts, batch_size=None):
            return [_FakeVec() for _ in texts]

    monkeypatch.setattr(module, "TextEmbedding", _FakeTextEmbedding)

    embedder = module.FastEmbedEmbedder()
    assert embedder.embed_query("hello") == [0.0, 1.0]


# ---- ingest/chunker.py: no extension, anonymous node, decorated-with-no-inner, blank block ----


def test_language_for_path_returns_none_without_extension() -> None:
    from app.ingest.chunker import language_for_path

    assert language_for_path("Makefile") is None


def test_name_of_returns_anonymous_when_name_missing() -> None:
    from app.ingest.chunker import _name_of

    class _NoName:
        def child_by_field_name(self, field):
            return None

    assert _name_of(_NoName()) == "<anonymous>"


def test_decorated_inner_returns_none_without_function_or_class() -> None:
    from app.ingest.chunker import _decorated_inner

    class _Empty:
        named_children: list = []

    assert _decorated_inner(_Empty()) is None


def test_text_fallback_skips_entirely_blank_blocks() -> None:
    from app.ingest.chunker import chunk_text_fallback

    assert chunk_text_fallback("notes.txt", b"\n\n\n") == []


# ---- ingest/cloner.py: the success return (offline, with git mocked) ----


def test_clone_repo_returns_dest_on_success(monkeypatch) -> None:
    import app.ingest.cloner as cloner

    monkeypatch.setattr(cloner.subprocess, "run", lambda *args, **kwargs: None)
    dest = cloner.clone_repo("https://github.com/octocat/hello")
    try:
        assert os.path.isdir(dest)
    finally:
        shutil.rmtree(dest, ignore_errors=True)


# ---- ingest/pipeline.py: files present but no chunks produced -> ValueError ----


def test_ingest_events_raise_when_no_chunks(tmp_path, monkeypatch) -> None:
    import app.ingest.pipeline as pipeline

    (tmp_path / "a.py").write_text("x = 1\n")
    monkeypatch.setattr(pipeline, "chunk_file", lambda *args, **kwargs: [])
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)

    with pytest.raises(ValueError, match="no code chunks"):
        list(pipeline.ingest_path_events(str(tmp_path), store, FakeEmbedder(dim=8)))


# ---- ingest/walker.py: not-a-directory, max_files cap, oversized-file skip ----


def test_walk_files_rejects_non_directory(tmp_path) -> None:
    from app.ingest.walker import walk_files

    with pytest.raises(ValueError, match="not a directory"):
        walk_files(str(tmp_path / "does-not-exist"))


def test_walk_files_honours_max_files(tmp_path) -> None:
    from app.ingest.walker import walk_files

    (tmp_path / "a.py").write_text("a = 1")
    (tmp_path / "b.py").write_text("b = 2")

    assert len(walk_files(str(tmp_path), max_files=1)) == 1


def test_walk_files_skips_oversized_files(tmp_path) -> None:
    from app.ingest.walker import walk_files

    (tmp_path / "big.py").write_text("x = 1\n" * 100)

    assert walk_files(str(tmp_path), max_file_bytes=1) == []


# ---- rag/overview.py: empty store -> "", and the LLMError fallback summary ----


def test_overview_on_empty_store_is_empty() -> None:
    from app.rag.overview import build_overview

    from tests.helpers import FakeLLM

    assert build_overview(_FakeStore([], []), FakeLLM("x")) == ""


def test_overview_falls_back_to_stats_when_llm_errors() -> None:
    from app.rag.overview import build_overview

    class _ErrLLM:
        def complete(self, *args, **kwargs):
            raise LLMError("down")

    meta = {"file_path": "a.py", "language": "python", "symbol_name": "f"}
    text = build_overview(_FakeStore(["def f(): ..."], [meta]), _ErrLLM())

    assert "files" in text  # the deterministic stats fallback, not a model answer


# ---- rag/prompt.py: a duplicate citation is only kept once ----


def test_parse_citations_skips_duplicates() -> None:
    from app.rag.prompt import parse_citations

    chunks = [{"file_path": "a.py", "start_line": 1, "end_line": 2}]
    out = parse_citations("see [a.py:1-2] and again [a.py:1-2]", chunks)

    assert out == [{"file_path": "a.py", "start_line": 1, "end_line": 2}]


# ---- retrieve/tokenize.py: empty pieces from the split are skipped ----


def test_tokenize_skips_empty_pieces() -> None:
    from app.retrieve.tokenize import tokenize_code

    assert tokenize_code("(a)") == ["a"]


# ---- store/chroma_store.py: empty-ids fast paths, and the older-Chroma config fallback ----


def test_store_existing_ids_and_add_handle_empty(tmp_path) -> None:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)

    assert store.existing_ids([]) == set()
    store.add([], [], [])  # returns immediately, no error


def test_store_falls_back_to_metadata_config(monkeypatch, tmp_path) -> None:
    class _FakeCollection:
        pass

    class _FakeClient:
        def __init__(self, path: str) -> None:
            pass

        def get_or_create_collection(self, name, configuration=None, metadata=None):
            if configuration is not None:
                raise TypeError("this Chroma version does not accept `configuration`")
            return _FakeCollection()

    monkeypatch.setattr(chromadb, "PersistentClient", _FakeClient)

    store = ChromaStore(path=str(tmp_path / "c"), embed_model="m", dim=8)
    assert store is not None  # constructed via the metadata= fallback path
