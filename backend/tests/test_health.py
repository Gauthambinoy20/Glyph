"""Unit test for the health endpoint."""

from app.main import app
from fastapi.testclient import TestClient

# A test client that calls the app in-process, so no real network is involved.
client = TestClient(app)


def test_health_returns_ok() -> None:
    """The health endpoint returns 200 with status ok and the app name."""
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "Glyph"
