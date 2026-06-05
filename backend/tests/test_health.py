"""Unit tests for the health and readiness endpoints."""

from app.main import app, get_embedder, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder

# A test client that calls the app in-process, so no real network is involved.
client = TestClient(app)


def test_health_returns_ok() -> None:
    """The health endpoint returns 200 with status ok and the app name."""
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "Glyph"


def test_ready_reports_model_and_store_loaded(tmp_path) -> None:  # T02
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    try:
        response = TestClient(app).get("/api/ready")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["dim"] == 8
    assert body["chunks"] == 0  # nothing ingested in this test
