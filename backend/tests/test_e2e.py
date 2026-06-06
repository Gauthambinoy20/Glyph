"""End-to-end tests: the whole real pipeline through the HTTP endpoints.

Only the embedder and the LLM are deterministic fakes (so it runs offline and in CI). The
chunker, the content-hash cache, the Chroma store and the hybrid retriever are all real, so
these tests catch wiring bugs that the per-module unit tests cannot. They exercise both the
local-folder and the GitHub-URL ingest paths, then a grounded ask and a streamed ask.
"""

import json
import shutil
import tempfile
from pathlib import Path

from app.main import app, get_embedder, get_llm, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, FakeLLM

# A tiny but realistic repo: two python files with clearly named functions, plus a JS file.
_AUTH_PY = '''\
def authenticate_user(username, password):
    """Check a username and password and return True when they match."""
    return username == "admin" and password == "secret"
'''

_MATH_PY = '''\
def add_numbers(a, b):
    """Return the sum of two numbers."""
    return a + b
'''

_UTIL_JS = """\
export function formatName(first, last) {
  return `${first} ${last}`;
}
"""


def _make_repo(root: Path) -> Path:
    """Write the fixture repo to disk and return its path."""
    root.mkdir(parents=True, exist_ok=True)
    (root / "auth.py").write_text(_AUTH_PY)
    (root / "math_utils.py").write_text(_MATH_PY)
    (root / "util.js").write_text(_UTIL_JS)
    return root


def _wire(store: ChromaStore, answer: str = "See [auth.py:1-3].") -> None:
    """Point the endpoints at a shared store and deterministic fakes."""
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_llm] = lambda: FakeLLM(answer)


def _fresh_store(tmp_path) -> ChromaStore:
    return ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)


def test_ingest_local_then_ask_cites_the_right_file(tmp_path) -> None:  # T49 (the big one)
    repo = _make_repo(tmp_path / "repo")
    store = _fresh_store(tmp_path)
    _wire(store)
    try:
        client = TestClient(app)
        ingested = client.post("/api/ingest", json={"local_path": str(repo)}).json()
        body = client.post("/api/ask", json={"question": "how does authenticate_user work"}).json()
    finally:
        app.dependency_overrides.clear()

    # Ingest really chunked and stored the repo.
    assert ingested["files"] == 3
    assert ingested["added"] > 0
    assert set(ingested["languages"]) >= {"python", "javascript"}

    # The real hybrid retriever surfaced the correct file for the question.
    assert any(source["file_path"] == "auth.py" for source in body["sources"])
    # The citation parsed from the answer maps onto that retrieved file.
    assert {"file_path": "auth.py", "start_line": 1, "end_line": 3} in body["citations"]


def test_reingest_uses_the_cache(tmp_path) -> None:  # cache works through the whole stack
    repo = _make_repo(tmp_path / "repo")
    store = _fresh_store(tmp_path)
    _wire(store)
    try:
        client = TestClient(app)
        first = client.post("/api/ingest", json={"local_path": str(repo)}).json()
        second = client.post("/api/ingest", json={"local_path": str(repo)}).json()
    finally:
        app.dependency_overrides.clear()

    assert first["added"] > 0
    assert second["added"] == 0  # nothing changed, so nothing is re-embedded
    assert second["cached"] == first["added"]


def test_ingest_via_github_url_branch(
    tmp_path, monkeypatch
) -> None:  # the path that broke in Docker
    repo = _make_repo(tmp_path / "repo")
    store = _fresh_store(tmp_path)

    # Stand in for a real clone: copy the fixture into a fresh temp dir (which ingest_repo
    # deletes afterwards), so the GitHub-URL branch runs the real pipeline without a network.
    def fake_clone(url: str, timeout: int = 120) -> str:
        dest = tempfile.mkdtemp(prefix="glyph_test_clone_")
        shutil.copytree(repo, dest, dirs_exist_ok=True)
        return dest

    monkeypatch.setattr("app.ingest.pipeline.clone_repo", fake_clone)
    _wire(store)
    try:
        body = (
            TestClient(app)
            .post("/api/ingest", json={"repo_url": "https://github.com/owner/repo"})
            .json()
        )
    finally:
        app.dependency_overrides.clear()

    assert body["files"] == 3
    assert body["added"] > 0


def test_streaming_ask_end_to_end_cites_the_right_file(tmp_path) -> None:
    repo = _make_repo(tmp_path / "repo")
    store = _fresh_store(tmp_path)
    _wire(store)
    try:
        client = TestClient(app)
        client.post("/api/ingest", json={"local_path": str(repo)})
        resp = client.post("/api/ask/stream", json={"question": "how does authenticate_user work"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    messages = [
        json.loads(block[len("data: ") :])
        for block in resp.text.strip().split("\n\n")
        if block.startswith("data: ")
    ]
    assert any(m["type"] == "token" for m in messages)
    final = messages[-1]
    assert final["type"] == "final"
    assert any(source["file_path"] == "auth.py" for source in final["sources"])


def test_ask_without_a_question_is_a_422(tmp_path) -> None:  # T03 (validation)
    # Override the heavy deps with fakes so resolving the endpoint never loads the real model
    # (CI has no model cache); the empty body still fails validation before they matter.
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: ChromaStore(
        path=str(tmp_path / "c"), embed_model="fake", dim=8
    )
    app.dependency_overrides[get_llm] = lambda: FakeLLM("unused")
    try:
        response = TestClient(app).post("/api/ask", json={})
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_unknown_route_is_a_clean_404() -> None:  # T03 (routing)
    response = TestClient(app).get("/api/does-not-exist")
    assert response.status_code == 404
