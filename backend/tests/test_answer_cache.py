"""Unit tests for the answer cache (the class and its effect on /api/ask)."""

from app.ingest.cache import embed_new_chunks
from app.main import answer_cache, app, get_embedder, get_llm, get_store
from app.rag.cache import AnswerCache
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, FakeLLM, make_chunk


def test_cache_returns_stored_value_and_normalizes_question() -> None:
    cache = AnswerCache()
    cache.put(3, "Where Is Login?", "m", {"answer": "here"})

    assert cache.get(3, "  where is login?  ", "m") == {"answer": "here"}  # case + spacing ignored
    assert cache.get(3, "where is login?", "other") is None  # different model → miss
    assert cache.get(4, "where is login?", "m") is None  # different chunk count → miss


def test_cache_evicts_least_recently_used() -> None:
    cache = AnswerCache(max_size=2)
    cache.put(1, "a", None, {"answer": "A"})
    cache.put(1, "b", None, {"answer": "B"})
    cache.get(1, "a", None)  # touch "a" so "b" is now least-recently-used
    cache.put(1, "c", None, {"answer": "C"})  # evicts "b"

    assert cache.get(1, "a", None) is not None
    assert cache.get(1, "c", None) is not None
    assert cache.get(1, "b", None) is None


def _store_with(tmp_path, chunks) -> ChromaStore:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))
    return store


class _CountingLLM(FakeLLM):
    """A FakeLLM that records how many times the model was actually called."""

    def __init__(self, answer: str) -> None:
        super().__init__(answer)
        self.calls = 0

    def complete(self, system_prompt, user_prompt, model=None):
        self.calls += 1
        return super().complete(system_prompt, user_prompt, model)


def test_repeat_question_is_served_from_cache_without_calling_the_model(tmp_path) -> None:  # T52
    answer_cache.clear()
    chunk = make_chunk("def login(): ...", name="login", path="auth.py", start=1, end=2)
    llm = _CountingLLM("Login lives in [auth.py:1-2].")
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: _store_with(tmp_path, [chunk])
    app.dependency_overrides[get_llm] = lambda: llm
    try:
        client = TestClient(app)
        first = client.post("/api/ask", json={"question": "where is login"}).json()
        second = client.post("/api/ask", json={"question": "where is login"}).json()
    finally:
        app.dependency_overrides.clear()
        answer_cache.clear()

    assert llm.calls == 1  # second answer came from the cache, not the model
    assert first["meta"]["cached"] is False
    assert second["meta"]["cached"] is True
    assert second["answer"] == first["answer"]
