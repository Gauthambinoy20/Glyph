"""Tests for real framework/library (stack) detection from the code's imports."""

from app.analyze.stack import detect_stack
from app.ingest.cache import embed_new_chunks
from app.store.chroma_store import ChromaStore

from tests.helpers import FakeEmbedder, make_chunk


def test_detects_known_frameworks_and_counts_files(tmp_path) -> None:  # T89
    """It reports recognised frameworks, folds react + react-dom, and counts files per name."""
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    chunks = [
        make_chunk(
            "from fastapi import FastAPI\nimport chromadb\n", name="<module>", path="api.py"
        ),
        make_chunk("from fastapi import APIRouter\n", name="<module>", path="routes.py"),
        make_chunk(
            'import React from "react";\nimport { render } from "react-dom";',
            name="<module>",
            path="ui.tsx",
        ),
    ]
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))

    stack = detect_stack(store)
    by_name = {item["name"]: item for item in stack}

    assert by_name["FastAPI"]["files"] == 2  # imported in two files
    assert by_name["Chroma"]["files"] == 1
    assert by_name["React"]["files"] == 1  # react + react-dom in one file fold to one React
    # Most-used framework comes first.
    assert stack[0]["name"] == "FastAPI"


def test_ignores_stdlib_and_internal_imports(tmp_path) -> None:  # T90
    """The Python stdlib and relative/internal imports are never reported as a framework."""
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    chunks = [
        make_chunk(
            "import os\nimport json\nfrom .helpers import thing\n", name="<module>", path="util.py"
        ),
        make_chunk('import { x } from "./local";\n', name="<module>", path="a.ts"),
    ]
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))

    assert detect_stack(store) == []  # nothing recognised → empty, not a guess


def test_empty_store_returns_empty_stack(tmp_path) -> None:  # T90
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    assert detect_stack(store) == []
