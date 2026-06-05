"""Tests for the per-client rate limiter that protects the public endpoints."""

from app.main import _rate_hits, app
from fastapi.testclient import TestClient


def test_rate_limit_blocks_after_threshold(monkeypatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    _rate_hits.clear()
    client = TestClient(app)
    # Two requests pass through (and 404 on routing); the third trips the limiter.
    assert client.get("/api/does-not-exist").status_code == 404
    assert client.get("/api/does-not-exist").status_code == 404
    blocked = client.get("/api/does-not-exist")
    assert blocked.status_code == 429
    assert "rate limit" in blocked.json()["detail"]


def test_health_is_exempt(monkeypatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "1")
    _rate_hits.clear()
    client = TestClient(app)
    # Health probes are never throttled, even past the limit.
    for _ in range(3):
        assert client.get("/api/health").status_code == 200


def test_rate_limit_disabled_when_zero(monkeypatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "0")
    _rate_hits.clear()
    client = TestClient(app)
    for _ in range(5):
        assert client.get("/api/does-not-exist").status_code == 404
