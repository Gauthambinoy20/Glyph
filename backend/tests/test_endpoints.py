"""Unit tests for API-route detection (detect_endpoints + the /api/endpoints route)."""

from app.analyze.endpoints import detect_endpoints
from app.ingest.cache import embed_new_chunks
from app.main import app, get_embedder, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, make_chunk


def _store_with(tmp_path, chunks) -> ChromaStore:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


def test_detects_fastapi_and_express_routes(tmp_path) -> None:  # T63
    fastapi_code = '@app.post("/api/ask")\ndef ask(): ...'
    express_code = 'router.get("/users/:id", (req, res) => res.json({}))'
    store = _store_with(
        tmp_path,
        [
            make_chunk(fastapi_code, name="ask", path="server/main.py"),
            make_chunk(express_code, name="users", path="src/routes.js"),
        ],
    )

    found = detect_endpoints(store)

    assert {"method": "POST", "path": "/api/ask"} in found
    assert {"method": "GET", "path": "/users/:id"} in found


def test_detects_flask_route_with_methods(tmp_path) -> None:  # T63 (Flask)
    flask_code = '@app.route("/login", methods=["GET", "POST"])\ndef login(): ...'
    store = _store_with(tmp_path, [make_chunk(flask_code, name="login", path="app.py")])

    found = detect_endpoints(store)
    pairs = {(e["method"], e["path"]) for e in found}

    assert ("GET", "/login") in pairs
    assert ("POST", "/login") in pairs


def test_no_routes_returns_empty(tmp_path) -> None:
    store = _store_with(tmp_path, [make_chunk("def helper(): return 1", name="helper")])
    assert detect_endpoints(store) == []


def test_endpoints_route_returns_sorted_list(tmp_path) -> None:  # T63 (endpoint)
    code = '@app.get("/b")\ndef b(): ...\n@app.get("/a")\ndef a(): ...'
    store = _store_with(tmp_path, [make_chunk(code, name="routes", path="main.py")])
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    try:
        body = TestClient(app).get("/api/endpoints").json()
    finally:
        app.dependency_overrides.clear()

    paths = [e["path"] for e in body["endpoints"]]
    assert paths == ["/a", "/b"]  # sorted by path
