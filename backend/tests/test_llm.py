"""Unit tests for the OpenRouter chat client (mocked, no network)."""

from types import SimpleNamespace

import httpx
import pytest
from app.llm.client import LLMClient, LLMError, _usage_to_dict
from openai import APIStatusError, RateLimitError


def _completion(text: str, usage: object = None) -> SimpleNamespace:
    """Build a fake OpenAI-style completion object."""
    message = SimpleNamespace(content=text)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=usage)


def _http_error(error_cls, status: int) -> Exception:
    """Build a real openai error carrying the given HTTP status."""
    request = httpx.Request("POST", "https://openrouter.ai/api/v1")
    return error_cls("error", response=httpx.Response(status, request=request), body=None)


class _FakeCompletions:
    """Stands in for client.chat.completions; runs a behaviour per model."""

    def __init__(self, behavior) -> None:
        self._behavior = behavior

    def create(self, **kwargs):
        result = self._behavior(kwargs["model"])
        if isinstance(result, Exception):
            raise result
        return result


def _client_with(behavior) -> LLMClient:
    """Build a real LLMClient but swap its OpenAI client for a fake one."""
    client = LLMClient(base_url="x", api_key="k", model="primary", fallback_model="backup")
    client._client = SimpleNamespace(chat=SimpleNamespace(completions=_FakeCompletions(behavior)))
    return client


def test_llm_returns_text_and_usage() -> None:  # T35
    usage = SimpleNamespace(prompt_tokens=10, completion_tokens=5, total_tokens=15)
    client = _client_with(lambda model: _completion("hello", usage))

    text, tokens = client.complete("system", "user")

    assert text == "hello"
    assert tokens == {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}


def test_llm_falls_back_on_rate_limit() -> None:  # T36
    def behavior(model: str):
        return (
            _http_error(RateLimitError, 429) if model == "primary" else _completion("from backup")
        )

    text, _ = _client_with(behavior).complete("system", "user")

    assert text == "from backup"


def test_llm_raises_clear_error_on_402() -> None:  # T37
    client = _client_with(lambda model: _http_error(APIStatusError, 402))
    with pytest.raises(LLMError):
        client.complete("system", "user")


def test_usage_defaults_to_zero_when_missing() -> None:  # T42 (token fallback)
    assert _usage_to_dict(None) == {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    }
