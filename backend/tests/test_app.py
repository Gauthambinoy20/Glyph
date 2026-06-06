"""Unit tests for the app-wide middleware: request id, CORS, and the error handler."""

from app.main import app, get_embedder
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder


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


def test_embedder_is_warmed_on_startup(monkeypatch) -> None:  # #105
    # Entering the lifespan (via the context manager) should warm the embedder once.
    calls: list[int] = []
    monkeypatch.setattr("app.main.get_embedder", lambda: calls.append(1))
    with TestClient(app):
        pass
    assert calls  # warmup ran at startup


def test_get_store_builds_one_store_per_backend(monkeypatch) -> None:  # provider
    # get_store sizes the vector store to the embedder's dim and builds it once per backend.
    # Patch the embedder (no model download) and the store class (no disk) to stay offline.
    import app.main as main

    monkeypatch.setattr(main, "get_embedder", lambda: FakeEmbedder(dim=8))
    built: list[int] = []

    def fake_store(*, path: str, embed_model: str, dim: int) -> object:
        built.append(dim)
        return object()

    monkeypatch.setattr(main, "ChromaStore", fake_store)
    main._stores.clear()
    try:
        store = main.get_store()
        assert store is main.get_store()  # the second call returns the cached store
    finally:
        main._stores.clear()
    assert built == [8]  # built exactly once, sized to the embedder's dim


def test_get_llm_builds_a_client() -> None:  # provider
    # get_llm just constructs the OpenRouter client from settings — no network on construction.
    from app.main import get_llm

    get_llm.cache_clear()
    try:
        assert get_llm() is not None
    finally:
        get_llm.cache_clear()
