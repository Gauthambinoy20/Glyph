"""Tests for choosing the embedding backend (fast vs careful) at ingest time.

The unit + endpoint tests cover the routing logic offline; an integration test proves the real
fast-mode path wires the 256-dim static index.
"""

import threading
import time

import app.main as main
import pytest
from app.main import _active_settings, app, set_active_backend
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder


def test_set_active_backend_maps_friendly_names() -> None:  # T86
    set_active_backend("fast")
    assert _active_settings().embed_backend == "static"
    set_active_backend("careful")
    assert _active_settings().embed_backend == "local"
    set_active_backend("static")  # raw backend names pass through unchanged
    assert _active_settings().embed_backend == "static"


def test_default_backend_is_the_configured_one() -> None:  # T86
    # With nothing set, the active backend falls back to the configured default — now the
    # "static" fast-mode embedder.
    assert main._active_backend is None
    assert _active_settings().embed_backend == "static"


def test_mode_endpoint_switches_backend() -> None:  # T87
    client = TestClient(app)
    body = client.post("/api/mode", json={"mode": "fast"}).json()
    assert body["backend"] == "static"
    assert _active_settings().embed_backend == "static"


def test_mode_endpoint_rejects_unknown_mode() -> None:  # T87
    client = TestClient(app)
    res = client.post("/api/mode", json={"mode": "turbo"})
    assert res.status_code == 400


def test_get_embedder_builds_once_under_concurrent_callers(monkeypatch) -> None:  # T89
    """The per-backend embedder build is serialized: concurrent callers don't double-build."""
    main._embedders.clear()
    builds: list[int] = []

    def fake_make(settings):
        time.sleep(0.05)  # widen the window so a missing lock would let several through
        builds.append(1)
        return FakeEmbedder(dim=8)

    monkeypatch.setattr(main, "make_embedder", fake_make)
    set_active_backend("careful")
    results: list = []
    threads = [
        threading.Thread(target=lambda: results.append(main.get_embedder())) for _ in range(5)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    try:
        assert len(builds) == 1  # the lock serialized the build to exactly one
        assert all(r is results[0] for r in results)  # everyone got the same instance
    finally:
        main._embedders.clear()


@pytest.mark.integration
def test_fast_mode_reports_the_static_index() -> None:  # T88
    """With fast mode active, the real embedder/store route to the 256-dim static index."""
    set_active_backend("fast")
    client = TestClient(app)
    ready = client.get("/api/ready").json()

    assert ready["backend"] == "static"
    assert ready["dim"] == 256
