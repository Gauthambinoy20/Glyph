"""In-memory metrics over recent queries, for the observability panel.

``log_query`` feeds every answered question into a bounded ring buffer here, and ``/api/metrics``
reads a small aggregate back out. It is process-local and resets on restart — enough to watch
live behaviour (refusal rate, latency, which files answers used) on the single-box deployment
without standing up a metrics backend. A multi-instance setup would ship the same log lines to a
shared store instead.
"""

from collections import deque

# Keep the last N query records; bounded so memory never grows without limit.
_MAX_RECENT = 200
_recent: deque[dict] = deque(maxlen=_MAX_RECENT)


def record(query: dict) -> None:
    """Add one query record (the dict ``log_query`` built) to the ring buffer."""
    _recent.append(query)


def reset() -> None:
    """Clear the buffer. Used to keep tests isolated from each other."""
    _recent.clear()


def snapshot(limit: int = 20) -> dict:
    """Return an aggregate over recent queries plus the most recent few.

    ``refusal_rate`` is the share of answers that were refusals (``grounded`` is False);
    ``avg_latency_ms`` is the mean wall-clock latency. ``recent`` carries the last ``limit``
    queries, newest first, trimmed to the fields the UI shows.
    """
    records = list(_recent)
    count = len(records)
    if count == 0:
        return {"count": 0, "refusal_rate": 0.0, "avg_latency_ms": 0, "recent": []}
    refusals = sum(1 for item in records if item.get("grounded") is False)
    avg_latency = round(sum(item.get("latency_ms", 0) for item in records) / count)
    recent = [
        {
            "question": item.get("question", ""),
            "grounded": item.get("grounded"),
            "latency_ms": item.get("latency_ms", 0),
            "retrieved_files": item.get("retrieved_files", []),
        }
        for item in reversed(records[-limit:])
    ]
    return {
        "count": count,
        "refusal_rate": round(refusals / count, 3),
        "avg_latency_ms": avg_latency,
        "recent": recent,
    }
