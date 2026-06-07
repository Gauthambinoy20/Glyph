"""Talk to a chat model through OpenRouter (OpenAI-compatible).

If the chosen model is rate-limited (429) or down (5xx), we fall back to a second free
model rather than failing. A 402 (no credit, e.g. a paid model without a key) becomes a
clear error. Token usage is read defensively, defaulting to zeros if the provider omits it.
"""

from collections.abc import Iterator

from openai import APIStatusError, OpenAI, RateLimitError


class LLMError(Exception):
    """A user-facing error from the chat model (rate limited, no credit, or down)."""


def _usage_to_dict(usage: object) -> dict[str, int]:
    """Read prompt/completion/total tokens, defaulting to 0 when missing."""
    return {
        "prompt_tokens": int(getattr(usage, "prompt_tokens", 0) or 0),
        "completion_tokens": int(getattr(usage, "completion_tokens", 0) or 0),
        "total_tokens": int(getattr(usage, "total_tokens", 0) or 0),
    }


class LLMClient:
    """A thin wrapper over the OpenAI SDK pointed at OpenRouter."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        fallback_model: str,
        app_url: str = "",
    ) -> None:
        # A dummy key is fine for construction; real calls need a valid key. max_retries lets the
        # SDK retry transient 429/5xx with exponential backoff before we even fall back to the
        # second model — so a momentary blip of the free tier (which has no SLA and queues under
        # load) is ridden out instead of surfacing a 502 to the user.
        self._client = OpenAI(base_url=base_url, api_key=api_key or "unset", max_retries=4)
        self._model = model
        self._fallback_model = fallback_model
        # Optional OpenRouter attribution headers; harmless if blank.
        self._headers = {"HTTP-Referer": app_url, "X-Title": "Glyph"} if app_url else {}

    def complete(
        self, system_prompt: str, user_prompt: str, model: str | None = None
    ) -> tuple[str, dict[str, int]]:
        """Return (answer_text, token_usage). Tries the chosen model, then a fallback."""
        chosen = model or self._model
        last_error: Exception | None = None
        for candidate in (chosen, self._fallback_model):
            try:
                completion = self._client.chat.completions.create(
                    model=candidate,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0,
                    extra_headers=self._headers,
                )
                text = completion.choices[0].message.content or ""
                return text, _usage_to_dict(completion.usage)
            except RateLimitError as exc:  # 429: try the fallback model
                last_error = exc
                continue
            except APIStatusError as exc:
                status = getattr(exc, "status_code", None)
                if status == 402:
                    raise LLMError("the selected model needs paid credit (402)") from exc
                if status is not None and 500 <= status < 600:  # transient: try fallback
                    last_error = exc
                    continue
                raise LLMError(f"the model returned an error: {exc}") from exc
        raise LLMError("the model is unavailable right now (rate limited or down)") from last_error

    def stream(
        self, system_prompt: str, user_prompt: str, model: str | None = None
    ) -> Iterator[dict]:
        """Stream the answer as it is written, then report token usage.

        Yields one event dict per step: `{"type": "delta", "text": ...}` for each piece of
        text as it arrives, and finally `{"type": "done", "usage": {...}}`. Falls back to the
        second model on 429/5xx exactly like complete(); raises LLMError if both are down.
        """
        chosen = model or self._model
        last_error: Exception | None = None
        for candidate in (chosen, self._fallback_model):
            try:
                stream = self._client.chat.completions.create(
                    model=candidate,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0,
                    stream=True,
                    # Ask the provider to include a final usage-only chunk (free providers
                    # may still omit it, in which case usage stays zero).
                    stream_options={"include_usage": True},
                    extra_headers=self._headers,
                )
                usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
                for chunk in stream:
                    # The usage-only chunk arrives last and carries no choices.
                    if getattr(chunk, "usage", None):
                        usage = _usage_to_dict(chunk.usage)
                    choices = getattr(chunk, "choices", None) or []
                    if choices:
                        text = getattr(choices[0].delta, "content", None)
                        if text:
                            yield {"type": "delta", "text": text}
                yield {"type": "done", "usage": usage}
                return
            except RateLimitError as exc:  # 429: try the fallback model
                last_error = exc
                continue
            except APIStatusError as exc:
                status = getattr(exc, "status_code", None)
                if status == 402:
                    raise LLMError("the selected model needs paid credit (402)") from exc
                if status is not None and 500 <= status < 600:  # transient: try fallback
                    last_error = exc
                    continue
                raise LLMError(f"the model returned an error: {exc}") from exc
        raise LLMError("the model is unavailable right now (rate limited or down)") from last_error
