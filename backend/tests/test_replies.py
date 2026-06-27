"""Conversational replies.

Greetings, thank-yous and "what can you do" questions are answered directly, without retrieval
or the model. Everything else flows through the normal pipeline. These tests pin both the pure
classifier and the two endpoints that use it.
"""

from app.main import app, get_embedder, get_llm, get_reranker, get_store
from app.rag.replies import (
    CAPABILITIES_REPLY,
    GREETING_REPLY,
    THANKS_REPLY,
    detect_smalltalk,
    smalltalk_reply,
)
from app.store.chroma_store import ChromaStore
from fastapi.testclient import TestClient

from tests.helpers import FakeEmbedder, FakeLLM


class _CountingLLM(FakeLLM):
    """A FakeLLM that records whether it was asked to answer (it must not be, for small talk)."""

    def __init__(self) -> None:
        super().__init__("should not be called")
        self.calls = 0

    def complete(self, system_prompt, user_prompt, model=None):
        self.calls += 1
        return super().complete(system_prompt, user_prompt, model)


def test_detect_smalltalk_classifies_each_kind() -> None:
    """Greetings, thanks and capability questions are detected; real questions are not."""
    assert detect_smalltalk("hi") == "greeting"
    assert detect_smalltalk("Hello!") == "greeting"
    assert detect_smalltalk("hey there") == "greeting"  # two words, leading greeting
    assert detect_smalltalk("thanks") == "thanks"
    assert detect_smalltalk("thank you so much") == "thanks"  # startswith "thank "
    assert detect_smalltalk("what can you do") == "capabilities"
    assert detect_smalltalk("help") == "capabilities"
    # Real code questions (even ones that contain a greeting-ish word) are not small talk.
    assert detect_smalltalk("where is the hello route defined") is None
    assert detect_smalltalk("how does the help command work") is None
    assert detect_smalltalk("") is None
    assert detect_smalltalk("...") is None  # punctuation-only normalises to empty


def test_smalltalk_reply_returns_the_text_for_each_kind() -> None:
    """Each classified kind maps to its formal reply."""
    assert smalltalk_reply("greeting") == GREETING_REPLY
    assert smalltalk_reply("thanks") == THANKS_REPLY
    assert smalltalk_reply("capabilities") == CAPABILITIES_REPLY


def _override_offline(tmp_path) -> _CountingLLM:
    """Point the app at offline fakes (no model downloads) and return the counting LLM."""
    llm = _CountingLLM()
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder(dim=8)
    app.dependency_overrides[get_store] = lambda: ChromaStore(
        path=str(tmp_path / "c"), embed_model="fake", dim=8
    )
    app.dependency_overrides[get_reranker] = lambda: None
    app.dependency_overrides[get_llm] = lambda: llm
    return llm


def test_ask_greeting_replies_without_calling_the_model(tmp_path) -> None:
    """A greeting returns the welcome message, flagged as a greeting note, with no LLM call."""
    llm = _override_offline(tmp_path)
    try:
        body = TestClient(app).post("/api/ask", json={"question": "hii"}).json()
    finally:
        app.dependency_overrides.clear()

    assert body["answer"] == GREETING_REPLY
    assert body["sources"] == []
    assert body["meta"]["grounded"] is False
    assert body["meta"]["kind"] == "greeting"
    assert llm.calls == 0


def test_ask_capabilities_and_thanks(tmp_path) -> None:
    """Capability and thank-you messages get their own canned replies, no model call."""
    llm = _override_offline(tmp_path)
    try:
        client = TestClient(app)
        caps = client.post("/api/ask", json={"question": "what can you do"}).json()
        thanks = client.post("/api/ask", json={"question": "thanks"}).json()
    finally:
        app.dependency_overrides.clear()

    assert caps["answer"] == CAPABILITIES_REPLY and caps["meta"]["kind"] == "capabilities"
    assert thanks["answer"] == THANKS_REPLY and thanks["meta"]["kind"] == "thanks"
    assert llm.calls == 0


def test_ask_greeting_with_history_is_not_short_circuited(tmp_path) -> None:
    """A greeting inside an ongoing conversation still flows through the pipeline (not small talk).

    On an empty index that lands on the relevance-floor refusal, which proves the greeting was
    NOT intercepted (its kind would be 'greeting', not 'not_found').
    """
    _override_offline(tmp_path)
    try:
        body = (
            TestClient(app)
            .post(
                "/api/ask",
                json={
                    "question": "hi",
                    "history": [{"question": "where is login", "answer": "auth.py"}],
                },
            )
            .json()
        )
    finally:
        app.dependency_overrides.clear()

    assert body["meta"]["kind"] == "not_found"


def test_ask_stream_greeting_replies(tmp_path) -> None:
    """The streaming endpoint also replies to a greeting directly, before any retrieval."""
    _override_offline(tmp_path)
    try:
        resp = TestClient(app).post("/api/ask/stream", json={"question": "hello"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert GREETING_REPLY in resp.text
    assert '"kind": "greeting"' in resp.text or '"kind":"greeting"' in resp.text
