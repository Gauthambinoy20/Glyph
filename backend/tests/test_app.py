"""Unit tests for the app-wide middleware: request id, CORS, and the error handler."""

from app.main import app, get_embedder
from fastapi.testclient import TestClient


def test_every_response_carries_a_request_id() -> None:  # request-id
    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.headers.get("x-request-id")  # present and non-empty


def test_cors_allows_the_frontend_origin() -> None:  # T55
    response = TestClient(app).get("/api/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_does_not_allow_an_unknown_origin() -> None:  # T55
    response = TestClient(app).get("/api/health", headers={"Origin": "http://evil.example"})

    # The browser-facing allow header is simply absent for a disallowed origin.
    assert "access-control-allow-origin" not in response.headers


def test_unexpected_error_becomes_a_clean_500(tmp_path) -> None:  # T56
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    app.dependency_overrides[get_embedder] = boom
    try:
        # raise_server_exceptions=False so the client returns the handler's response
        # instead of re-raising, matching how a real server behaves.
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post("/api/search", json={"question": "anything"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "internal server error"  # generic, no internals
    assert body["request_id"]
    assert "secret internal detail" not in response.text  # the real error never leaks
    assert response.headers.get("x-request-id")
