"""Unit tests for the ingest pipeline (walker, cloner, pipeline, and the endpoint)."""

import subprocess
from pathlib import Path

import pytest
from app.ingest.cloner import clone_repo, is_valid_github_url
from app.ingest.pipeline import ingest_path
from app.ingest.walker import walk_files
from app.main import app, get_embedder, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder

FIXTURES = Path(__file__).parent / "fixtures"


# ----- Walker -----


def test_walker_keeps_source_files_and_skips_junk(tmp_path) -> None:  # T22
    (tmp_path / "a.py").write_text("def f(): pass\n")
    (tmp_path / "notes.md").write_text("# not code\n")
    node_modules = tmp_path / "node_modules"
    node_modules.mkdir()
    (node_modules / "lib.js").write_text("x")

    files = walk_files(str(tmp_path))
    names = [name for name, _ in files]

    assert names == ["a.py"]  # only the supported file, junk dir and .md skipped


def test_walker_rejects_symlink_escaping_root(tmp_path) -> None:  # T23
    outside = tmp_path / "outside.py"
    outside.write_text("secret = 1\n")
    root = tmp_path / "root"
    root.mkdir()
    (root / "real.py").write_text("def g(): pass\n")
    try:
        (root / "link.py").symlink_to(outside)
    except OSError:
        pytest.skip("symlinks not supported on this platform")

    names = [name for name, _ in walk_files(str(root))]

    assert "real.py" in names
    assert "link.py" not in names  # a symlink leaving the root is not followed


# ----- Cloner -----


def test_cloner_rejects_invalid_url() -> None:  # T24
    assert not is_valid_github_url("not-a-url")
    assert not is_valid_github_url("https://gitlab.com/a/b")
    assert is_valid_github_url("https://github.com/owner/repo")
    with pytest.raises(ValueError):
        clone_repo("ftp://github.com/owner/repo")


def test_cloner_handles_clone_failure(monkeypatch) -> None:  # T25
    def boom(*args, **kwargs):
        raise subprocess.CalledProcessError(1, "git clone")

    monkeypatch.setattr(subprocess, "run", boom)
    with pytest.raises(ValueError):
        clone_repo("https://github.com/owner/does-not-exist")


# ----- Pipeline -----


def _fresh_store(tmp_path) -> ChromaStore:
    return ChromaStore(path=str(tmp_path / "chroma"), embed_model="fake", dim=8)


def test_pipeline_ingests_a_folder(tmp_path) -> None:  # T26
    store, embedder = _fresh_store(tmp_path), FakeEmbedder(dim=8)

    result = ingest_path(str(FIXTURES), store, embedder)

    assert result["files"] == 4  # the four sample fixtures
    assert result["added"] > 0
    assert "python" in result["languages"]


def test_pipeline_caches_on_re_ingest(tmp_path) -> None:  # T27
    store, embedder = _fresh_store(tmp_path), FakeEmbedder(dim=8)

    first = ingest_path(str(FIXTURES), store, embedder)
    second = ingest_path(str(FIXTURES), store, embedder)

    assert first["added"] > 0
    assert second["added"] == 0  # everything already cached


def test_pipeline_rejects_folder_with_no_source(tmp_path) -> None:  # T28
    (tmp_path / "readme.md").write_text("# just docs\n")
    with pytest.raises(ValueError):
        ingest_path(str(tmp_path), _fresh_store(tmp_path), FakeEmbedder(dim=8))


# ----- Endpoint -----


def test_ingest_endpoint_with_local_path(tmp_path) -> None:
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _fresh_store(tmp_path)
    try:
        response = TestClient(app).post("/api/ingest", json={"local_path": str(FIXTURES)})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["added"] > 0


def test_ingest_endpoint_requires_input() -> None:
    assert TestClient(app).post("/api/ingest", json={}).status_code == 400


def test_ingest_endpoint_rejects_bad_repo_url() -> None:
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: None  # not reached; URL fails first
    try:
        response = TestClient(app).post("/api/ingest", json={"repo_url": "not-a-github-url"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
