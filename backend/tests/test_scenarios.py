"""End-to-end scenario tests for the failure modes unit tests miss.

These drive the real pipeline (real chunker, content-hash cache, Chroma store and hybrid
retriever) through the HTTP API; only the embedding model and the LLM are deterministic fakes
so the suite stays offline. They cover the multi-repo / mode-switch / empty / large-repo paths —
the kinds of whole-system wiring that 100% line coverage of the individual modules never proves.
"""

import app.main as main
from app.main import app, get_embedder, get_llm, get_store
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, FakeLLM
from tests.test_e2e import _make_repo

_PAYMENTS_PY = '''\
def process_payment(amount, card):
    """Charge a card for an amount and return a receipt id."""
    return f"receipt-{amount}-{card[-4:]}"
'''


def _store_at(path) -> ChromaStore:
    return ChromaStore(path=str(path), embed_model="fake", dim=8)


def test_switching_mode_keeps_each_backend_isolated(tmp_path) -> None:
    """Fast and careful keep separate indexes.

    Ingesting a different repo under each backend never bleeds one repo's code into the other's
    answers.
    """
    auth_repo = _make_repo(tmp_path / "auth_repo")  # has auth.py
    pay_repo = tmp_path / "pay_repo"
    pay_repo.mkdir()
    (pay_repo / "payments.py").write_text(_PAYMENTS_PY)

    # One real store per backend, selected by the active backend exactly like production's
    # per-backend _stores dict.
    stores = {"static": _store_at(tmp_path / "fast"), "local": _store_at(tmp_path / "careful")}
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: stores[main._active_settings().embed_backend]
    app.dependency_overrides[get_llm] = lambda: FakeLLM("ok")
    try:
        client = TestClient(app)
        client.post("/api/mode", json={"mode": "fast"})
        client.post("/api/ingest", json={"local_path": str(auth_repo)})
        client.post("/api/mode", json={"mode": "careful"})
        client.post("/api/ingest", json={"local_path": str(pay_repo)})

        # Each backend's store holds only its own repo's chunks.
        assert stores["static"].count() > 0
        assert stores["local"].count() > 0

        client.post("/api/mode", json={"mode": "fast"})
        fast = client.post("/api/ask", json={"question": "authenticate_user"}).json()
        client.post("/api/mode", json={"mode": "careful"})
        careful = client.post("/api/ask", json={"question": "process_payment"}).json()
    finally:
        app.dependency_overrides.clear()

    fast_files = {source["file_path"] for source in fast["sources"]}
    careful_files = {source["file_path"] for source in careful["sources"]}
    assert "auth.py" in fast_files and "payments.py" not in fast_files  # fast never saw payments
    assert (
        "payments.py" in careful_files and "auth.py" not in careful_files
    )  # careful never saw auth


def test_ingesting_a_repo_with_no_code_is_a_clean_400(tmp_path) -> None:
    """A folder with only non-code files fails with a clear 400, not a 500 or an empty index."""
    empty = tmp_path / "docs_only"
    empty.mkdir()
    (empty / "README.md").write_text("# just docs, no source\n")
    (empty / "notes.txt").write_text("nothing to index here\n")
    store = _store_at(tmp_path / "c")
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    try:
        response = TestClient(app).post("/api/ingest", json={"local_path": str(empty)})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "no supported source files" in response.json()["detail"].lower()
    assert store.count() == 0  # nothing was indexed


def test_ingesting_a_large_repo_indexes_every_file(tmp_path) -> None:
    """A repo of many files ingests completely and a needle symbol is findable afterwards."""
    big = tmp_path / "big_repo"
    big.mkdir()
    for i in range(50):
        (big / f"module_{i:02d}.py").write_text(f"def helper_{i:02d}(x):\n    return x + {i}\n")
    # A uniquely named needle (one token, so the symbol-name boost fires) to prove retrieval
    # reaches a file deep in a large repo, not just the first few.
    (big / "needle.py").write_text("def zzqxwidget():\n    return 'unique-marker'\n")

    store = _store_at(tmp_path / "c")
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_llm] = lambda: FakeLLM("ok")
    try:
        client = TestClient(app)
        ingested = client.post("/api/ingest", json={"local_path": str(big)}).json()
        answer = client.post("/api/ask", json={"question": "zzqxwidget"}).json()
    finally:
        app.dependency_overrides.clear()

    assert ingested["files"] == 51  # all 51 files walked
    assert ingested["added"] >= 51  # at least one chunk per file embedded and stored
    assert store.count() == ingested["added"]  # everything that was added is in the store
    assert any(source["file_path"] == "needle.py" for source in answer["sources"])


def test_full_chain_ingest_overview_stats_ask_then_read_the_file(tmp_path) -> None:
    """Walk the whole product once over one index.

    Ingest, then overview, stats, a grounded ask, and the code viewer all read back consistent
    data from the same index.
    """
    repo = _make_repo(tmp_path / "repo")  # auth.py, math_utils.py, util.js
    store = _store_at(tmp_path / "c")
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_llm] = lambda: FakeLLM("See [auth.py:1-3].")
    try:
        client = TestClient(app)
        client.post("/api/ingest", json={"local_path": str(repo)})

        overview = client.get("/api/overview").json()
        stats = client.get("/api/stats").json()
        answer = client.post(
            "/api/ask", json={"question": "how does authenticate_user work"}
        ).json()
        viewed = client.get("/api/file", params={"path": "auth.py"}).json()
    finally:
        app.dependency_overrides.clear()

    assert overview["overview"].strip()  # a non-empty summary came back
    assert stats["files"] == 3  # all three files counted
    assert any(source["file_path"] == "auth.py" for source in answer["sources"])
    assert "authenticate_user" in viewed["code"]  # the viewer read the real indexed code back
