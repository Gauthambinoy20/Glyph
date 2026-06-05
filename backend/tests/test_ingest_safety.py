"""Security tests: local-folder ingestion must stay inside the configured base dir.

These guard against a remote caller pointing /api/ingest at arbitrary server files
(e.g. /etc) on a public deployment where ingest_base_dir is set.
"""

import pytest
from app.ingest.walker import ensure_path_allowed
from app.main import app, get_embedder, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder


def test_no_base_dir_allows_any_path() -> None:
    # Local dev: with no base dir configured, any path is allowed.
    ensure_path_allowed("/etc", None)


def test_base_dir_itself_is_allowed(tmp_path) -> None:
    ensure_path_allowed(str(tmp_path), str(tmp_path))


def test_path_inside_base_is_allowed(tmp_path) -> None:
    sub = tmp_path / "repo"
    sub.mkdir()
    ensure_path_allowed(str(sub), str(tmp_path))


def test_absolute_path_outside_base_is_rejected(tmp_path) -> None:
    with pytest.raises(ValueError, match="outside the allowed directory"):
        ensure_path_allowed("/etc", str(tmp_path))


def test_traversal_escape_is_rejected(tmp_path) -> None:
    sub = tmp_path / "repo"
    sub.mkdir()
    with pytest.raises(ValueError, match="outside the allowed directory"):
        ensure_path_allowed(str(sub / ".." / ".." / "etc"), str(tmp_path))


def test_ingest_endpoint_rejects_out_of_base_path(tmp_path, monkeypatch) -> None:
    # With a base dir set, the API rejects an absolute path outside it with a 400,
    # before any embedding/storage work happens.
    monkeypatch.setenv("INGEST_BASE_DIR", str(tmp_path))
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    try:
        client = TestClient(app)
        res = client.post("/api/ingest", json={"local_path": "/etc"})
        assert res.status_code == 400
        assert "allowed directory" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()
