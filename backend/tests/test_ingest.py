"""Unit tests for the ingest pipeline (walker, cloner, pipeline, and the endpoint)."""

import shutil
import subprocess
from pathlib import Path

import pytest
from app.ingest import pipeline as pipeline_mod
from app.ingest.cloner import clone_repo, is_valid_github_url
from app.ingest.pipeline import ingest_path, ingest_path_events, ingest_repo_events
from app.ingest.walker import walk_files
from app.main import app, get_embedder, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder

FIXTURES = Path(__file__).parent / "fixtures"


# ----- Walker -----


def test_walker_keeps_source_files_and_skips_junk(tmp_path) -> None:  # T22
    (tmp_path / "a.py").write_text("def f(): pass\n")
    (tmp_path / "notes.md").write_text("# not code\n")
    node_modules = tmp_path / "node_modules"
    node_modules.mkdir()
    (node_modules / "lib.js").write_text("x")

    files = walk_files(str(tmp_path))
    names = [name for name, _ in files]

    assert names == ["a.py"]  # only the supported file, junk dir and .md skipped


def test_walker_rejects_symlink_escaping_root(tmp_path) -> None:  # T23
    outside = tmp_path / "outside.py"
    outside.write_text("secret = 1\n")
    root = tmp_path / "root"
    root.mkdir()
    (root / "real.py").write_text("def g(): pass\n")
    try:
        (root / "link.py").symlink_to(outside)
    except OSError:
        pytest.skip("symlinks not supported on this platform")

    names = [name for name, _ in walk_files(str(root))]

    assert "real.py" in names
    assert "link.py" not in names  # a symlink leaving the root is not followed


# ----- Cloner -----


def test_cloner_rejects_invalid_url() -> None:  # T24
    assert not is_valid_github_url("not-a-url")
    assert not is_valid_github_url("https://gitlab.com/a/b")
    assert is_valid_github_url("https://github.com/owner/repo")
    with pytest.raises(ValueError):
        clone_repo("ftp://github.com/owner/repo")


def test_cloner_handles_clone_failure(monkeypatch) -> None:  # T25
    def boom(*args, **kwargs):
        raise subprocess.CalledProcessError(1, "git clone")

    monkeypatch.setattr(subprocess, "run", boom)
    with pytest.raises(ValueError):
        clone_repo("https://github.com/owner/does-not-exist")


def test_cloner_reports_missing_git(monkeypatch) -> None:  # T25 (git not installed)
    # If git is not on the machine/image, the user must get a clear error, not a 500.
    def no_git(*args, **kwargs):
        raise FileNotFoundError(2, "No such file or directory", "git")

    monkeypatch.setattr(subprocess, "run", no_git)
    with pytest.raises(ValueError, match="git is not installed"):
        clone_repo("https://github.com/owner/repo")


# ----- Pipeline -----


def _fresh_store(tmp_path) -> ChromaStore:
    return ChromaStore(path=str(tmp_path / "chroma"), embed_model="fake", dim=8)


def test_pipeline_ingests_a_folder(tmp_path) -> None:  # T26
    store, embedder = _fresh_store(tmp_path), FakeEmbedder(dim=8)

    result = ingest_path(str(FIXTURES), store, embedder)

    assert result["files"] == 4  # the four sample fixtures
    assert result["added"] > 0
    assert "python" in result["languages"]


def test_pipeline_caches_on_re_ingest(tmp_path) -> None:  # T27
    store, embedder = _fresh_store(tmp_path), FakeEmbedder(dim=8)

    first = ingest_path(str(FIXTURES), store, embedder)
    second = ingest_path(str(FIXTURES), store, embedder)

    assert first["added"] > 0
    assert second["added"] == 0  # everything already cached


def test_pipeline_rejects_folder_with_no_source(tmp_path) -> None:  # T28
    (tmp_path / "readme.md").write_text("# just docs\n")
    with pytest.raises(ValueError):
        ingest_path(str(tmp_path), _fresh_store(tmp_path), FakeEmbedder(dim=8))


# ----- Pipeline event stream (live progress) -----


def test_ingest_events_yields_stages_in_order(tmp_path) -> None:  # T67
    store, embedder = _fresh_store(tmp_path), FakeEmbedder(dim=8)

    events = list(ingest_path_events(str(FIXTURES), store, embedder))
    stages = [event["stage"] for event in events]

    # walk happens before chunk, which happens before embedding, which ends in done.
    assert stages[0] == "walk"
    assert stages.index("chunk") < stages.index("embed")
    assert stages[-1] == "done"

    walk = next(e for e in events if e["stage"] == "walk")
    done = events[-1]
    assert walk["files"] == 4  # the four sample fixtures
    assert done["files"] == 4
    assert done["added"] > 0
    assert "python" in done["languages"]


def test_ingest_events_embed_progress_reaches_total(tmp_path) -> None:  # T68
    store, embedder = _fresh_store(tmp_path), FakeEmbedder(dim=8)

    all_events = ingest_path_events(str(FIXTURES), store, embedder)
    embed_events = [e for e in all_events if e["stage"] == "embed"]

    total = embed_events[-1]["total"]
    assert total > 0
    assert embed_events[0]["done"] == 0  # starts at zero
    assert embed_events[-1]["done"] == total  # and finishes at the total
    # progress never moves backwards and never overshoots the total
    dones = [e["done"] for e in embed_events]
    assert dones == sorted(dones)
    assert all(d <= total for d in dones)


def test_ingest_events_match_blocking_summary(tmp_path) -> None:  # T69
    # The streaming "done" event must carry exactly what the blocking ingest_path returns.
    events_store, events_emb = _fresh_store(tmp_path / "a"), FakeEmbedder(dim=8)
    blocking_store, blocking_emb = _fresh_store(tmp_path / "b"), FakeEmbedder(dim=8)

    done = list(ingest_path_events(str(FIXTURES), events_store, events_emb))[-1]
    summary = ingest_path(str(FIXTURES), blocking_store, blocking_emb)

    assert {k: v for k, v in done.items() if k != "stage"} == summary


def test_ingest_repo_events_clone_then_ingest(tmp_path, monkeypatch) -> None:  # T70
    # Mock the clone so no network is touched: hand back a copy of the fixtures.
    clone_dir = tmp_path / "clone"
    shutil.copytree(FIXTURES, clone_dir)
    monkeypatch.setattr(pipeline_mod, "clone_repo", lambda url: str(clone_dir))

    store, embedder = _fresh_store(tmp_path), FakeEmbedder(dim=8)
    events = list(ingest_repo_events("https://github.com/owner/repo", store, embedder))
    stages = [event["stage"] for event in events]

    assert stages[0] == "clone" and events[0]["status"] == "start"
    assert stages[1] == "clone" and events[1]["status"] == "done"
    assert "walk" in stages and stages[-1] == "done"
    assert not clone_dir.exists()  # the temporary clone is cleaned up afterwards


def test_ingest_repo_events_reports_the_real_branch(tmp_path, monkeypatch) -> None:  # T91
    """The final summary carries the clone's actual branch, not a guessed "main"."""
    clone_dir = tmp_path / "clone"
    shutil.copytree(FIXTURES, clone_dir)
    monkeypatch.setattr(pipeline_mod, "clone_repo", lambda url: str(clone_dir))
    monkeypatch.setattr(pipeline_mod, "read_default_branch", lambda _dir: "develop")

    store, embedder = _fresh_store(tmp_path), FakeEmbedder(dim=8)
    done = list(ingest_repo_events("https://github.com/owner/repo", store, embedder))[-1]

    assert done["stage"] == "done"
    assert done["branch"] == "develop"


def test_read_default_branch_parses_git_output(monkeypatch) -> None:  # T92
    from app.ingest import cloner

    class _Result:
        stdout = "release-2.0\n"

    monkeypatch.setattr(cloner.subprocess, "run", lambda *a, **k: _Result())
    assert cloner.read_default_branch("/tmp/x") == "release-2.0"


def test_read_default_branch_none_when_git_missing(monkeypatch) -> None:  # T92
    from app.ingest import cloner

    def _boom(*a, **k):
        raise FileNotFoundError

    monkeypatch.setattr(cloner.subprocess, "run", _boom)
    assert cloner.read_default_branch("/tmp/x") is None


# ----- Endpoint -----


def test_ingest_endpoint_with_local_path(tmp_path) -> None:
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _fresh_store(tmp_path)
    try:
        response = TestClient(app).post("/api/ingest", json={"local_path": str(FIXTURES)})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["added"] > 0


def test_ingest_endpoint_requires_input() -> None:
    # Override the deps so the endpoint does not try to build the real model just to 400.
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: None
    try:
        response = TestClient(app).post("/api/ingest", json={})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400


def test_ingest_endpoint_rejects_bad_repo_url(tmp_path) -> None:
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _fresh_store(tmp_path)
    try:
        response = TestClient(app).post("/api/ingest", json={"repo_url": "not-a-github-url"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400


def test_ingesting_a_different_repo_replaces_the_previous_one(tmp_path) -> None:
    """The store holds only the repo on screen: ingesting B after A drops A's chunks (no
    cross-repo bleed), while re-ingesting the same repo keeps its content-hash cache."""
    store = _fresh_store(tmp_path)
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    repo_a, repo_b = tmp_path / "a", tmp_path / "b"
    repo_a.mkdir()
    repo_b.mkdir()
    (repo_a / "a.py").write_text("def alpha():\n    return 1\n")
    (repo_b / "b.py").write_text("def bravo():\n    return 2\n")
    try:
        client = TestClient(app)
        client.post("/api/ingest", json={"local_path": str(repo_a)})  # loads A
        client.post("/api/ingest", json={"local_path": str(repo_b)})  # different repo -> reset
        again = client.post(
            "/api/ingest", json={"local_path": str(repo_b)}
        ).json()  # same -> cached
    finally:
        app.dependency_overrides.clear()

    docs = store.all_chunks()["documents"]
    assert any("def bravo" in d for d in docs)  # B is present
    assert not any("def alpha" in d for d in docs)  # A was wiped, not mixed in
    assert again["added"] == 0  # re-ingesting the same repo is fully cached (no reset)


# ----- Streaming endpoint -----


def _parse_sse(body: str) -> list[dict]:
    """Pull the JSON payloads out of an SSE response body."""
    import json

    return [
        json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")
    ]


def test_ingest_stream_endpoint_emits_stages_then_done(tmp_path) -> None:  # T71
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _fresh_store(tmp_path)
    try:
        response = TestClient(app).post("/api/ingest/stream", json={"local_path": str(FIXTURES)})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    events = _parse_sse(response.text)
    stages = [event["stage"] for event in events]
    assert "walk" in stages and "embed" in stages
    assert stages[-1] == "done"
    assert events[-1]["added"] > 0


def test_ingest_stream_endpoint_requires_input() -> None:  # T72
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: None
    try:
        response = TestClient(app).post("/api/ingest/stream", json={})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400


def test_ingest_stream_endpoint_reports_bad_url_as_error_event(tmp_path) -> None:  # T73
    # A bad URL only fails once cloning starts, so it arrives as an error event, not a 400.
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _fresh_store(tmp_path)
    try:
        response = TestClient(app).post("/api/ingest/stream", json={"repo_url": "not-a-github-url"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert events[-1]["stage"] == "error"
    assert "detail" in events[-1]
