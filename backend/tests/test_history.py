"""Unit tests for SQLite chat history (the store and the /api/history endpoints)."""

from app.db.history import History
from app.main import app, get_history
from fastapi.testclient import TestClient


def test_save_and_load_roundtrip(tmp_path) -> None:  # T46
    store = History(str(tmp_path / "h.db"))
    sid = store.save(
        "glyph-dev/glyph",
        [
            {"role": "user", "content": "hi", "data": None},
            {"role": "glyph", "content": "hello", "data": {"answer": "hello"}},
        ],
    )

    loaded = store.load(sid)

    assert loaded is not None
    assert loaded["repo"] == "glyph-dev/glyph"
    assert len(loaded["messages"]) == 2
    assert loaded["messages"][0]["role"] == "user"
    assert loaded["messages"][1]["data"]["answer"] == "hello"  # JSON payload round-trips


def test_saving_an_existing_session_replaces_its_messages(tmp_path) -> None:
    store = History(str(tmp_path / "h.db"))
    sid = store.save("r", [{"role": "user", "content": "a"}])
    store.save(
        "r", [{"role": "user", "content": "b"}, {"role": "glyph", "content": "c"}], session_id=sid
    )

    loaded = store.load(sid)

    assert loaded is not None
    assert [m["content"] for m in loaded["messages"]] == ["b", "c"]


def test_load_missing_session_returns_none(tmp_path) -> None:
    assert History(str(tmp_path / "h.db")).load("nope") is None


def test_list_sessions_reports_repo_and_count(tmp_path) -> None:
    store = History(str(tmp_path / "h.db"))
    store.save("r1", [{"role": "user", "content": "x"}])

    sessions = store.list_sessions()

    assert sessions[0]["repo"] == "r1"
    assert sessions[0]["message_count"] == 1


def test_history_endpoints_roundtrip(tmp_path) -> None:  # T46 (endpoint)
    store = History(str(tmp_path / "h.db"))
    app.dependency_overrides[get_history] = lambda: store
    try:
        client = TestClient(app)
        saved = client.post(
            "/api/history", json={"repo": "r", "messages": [{"role": "user", "content": "hi"}]}
        ).json()
        sid = saved["session_id"]
        loaded = client.get(f"/api/history/{sid}").json()
        missing = client.get("/api/history/nope")
        listing = client.get("/api/history").json()
    finally:
        app.dependency_overrides.clear()

    assert loaded["messages"][0]["content"] == "hi"
    assert missing.status_code == 404
    assert any(s["session_id"] == sid for s in listing["sessions"])
