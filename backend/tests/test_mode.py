"""Tests for choosing the embedding backend (fast vs careful) at ingest time.

The unit + endpoint tests cover the routing logic offline; an integration test proves the real
fast-mode path wires the 256-dim static index.
"""

import app.main as main
import pytest
from app.main import _active_settings, app, set_active_backend
from fastapi.testclient import TestClient


def test_set_active_backend_maps_friendly_names() -> None:  # T86
    set_active_backend("fast")
    assert _active_settings().embed_backend == "static"
    set_active_backend("careful")
    assert _active_settings().embed_backend == "local"
    set_active_backend("static")  # raw backend names pass through unchanged
    assert _active_settings().embed_backend == "static"


def test_default_backend_is_the_configured_one() -> None:  # T86
    # With nothing set, the active backend falls back to the configured default.
    assert main._active_backend is None
    assert _active_settings().embed_backend == "local"


def test_mode_endpoint_switches_backend() -> None:  # T87
    client = TestClient(app)
    body = client.post("/api/mode", json={"mode": "fast"}).json()
    assert body["backend"] == "static"
    assert _active_settings().embed_backend == "static"


def test_mode_endpoint_rejects_unknown_mode() -> None:  # T87
    client = TestClient(app)
    res = client.post("/api/mode", json={"mode": "turbo"})
    assert res.status_code == 400


@pytest.mark.integration
def test_fast_mode_reports_the_static_index() -> None:  # T88
    """With fast mode active, the real embedder/store route to the 256-dim static index."""
    set_active_backend("fast")
    client = TestClient(app)
    ready = client.get("/api/ready").json()

    assert ready["backend"] == "static"
    assert ready["dim"] == 256
