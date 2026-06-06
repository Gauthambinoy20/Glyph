"""Tests for the in-memory query metrics and the /api/metrics endpoint (offline)."""

from app.main import app
from app.obs import metrics
from app.obs.logging import log_query
from fastapi.testclient import TestClient

_USAGE = {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}


def test_snapshot_is_empty_before_any_queries() -> None:
    assert metrics.snapshot() == {
        "count": 0,
        "refusal_rate": 0.0,
        "avg_latency_ms": 0,
        "recent": [],
    }


def test_snapshot_aggregates_recent_queries() -> None:
    log_query("first", ["a"], 100, _USAGE, retrieved_files=["a.py"], grounded=True)
    log_query("second", [], 20, _USAGE, retrieved_files=[], grounded=False)

    snap = metrics.snapshot()

    assert snap["count"] == 2
    assert snap["refusal_rate"] == 0.5  # one of two answers was a refusal
    assert snap["avg_latency_ms"] == 60  # (100 + 20) / 2
    assert snap["recent"][0]["question"] == "second"  # newest first
    assert snap["recent"][0]["grounded"] is False
    assert snap["recent"][1]["retrieved_files"] == ["a.py"]


def test_snapshot_trims_recent_to_the_requested_limit() -> None:
    for i in range(5):
        log_query(f"q{i}", ["a"], 10, _USAGE, retrieved_files=["a.py"], grounded=True)

    snap = metrics.snapshot(limit=2)

    assert snap["count"] == 5  # the aggregate still counts every query
    assert [item["question"] for item in snap["recent"]] == [
        "q4",
        "q3",
    ]  # only the last 2, newest first


def test_metrics_endpoint_returns_the_live_aggregate() -> None:
    log_query("live", ["a"], 30, _USAGE, retrieved_files=["a.py"], grounded=True)

    body = TestClient(app).get("/api/metrics").json()

    assert body["count"] == 1
    assert body["refusal_rate"] == 0.0
    assert body["recent"][0]["question"] == "live"
