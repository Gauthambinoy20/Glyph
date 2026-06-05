"""A small in-memory answer cache: an identical question on an unchanged repo skips the model.

Keyed by (chunk_count, model, normalized_question). The chunk count is the freshness signal —
re-ingesting changes it, so answers cached against an older index are never served. Bounded
LRU so memory stays small. The caller only caches standalone questions (follow-ups carry
conversation context, so they must not be served from a context-free cache).
"""

from collections import OrderedDict


class AnswerCache:
    """A bounded least-recently-used cache of answer payloads."""

    def __init__(self, max_size: int = 128) -> None:
        self._max = max_size
        self._data: OrderedDict[tuple[int, str, str], dict] = OrderedDict()

    @staticmethod
    def _key(chunk_count: int, question: str, model: str | None) -> tuple[int, str, str]:
        """Build the cache key; the question is normalized so spacing/case do not matter."""
        return (chunk_count, model or "", question.strip().lower())

    def get(self, chunk_count: int, question: str, model: str | None) -> dict | None:
        """Return the cached payload for this key, or None; marks it most-recently-used."""
        key = self._key(chunk_count, question, model)
        value = self._data.get(key)
        if value is not None:
            self._data.move_to_end(key)
        return value

    def put(self, chunk_count: int, question: str, model: str | None, value: dict) -> None:
        """Store a payload, evicting the least-recently-used entry past the size cap."""
        key = self._key(chunk_count, question, model)
        self._data[key] = value
        self._data.move_to_end(key)
        while len(self._data) > self._max:
            self._data.popitem(last=False)

    def clear(self) -> None:
        """Drop all cached entries."""
        self._data.clear()


# Process-wide singleton used by the answer endpoints.
answer_cache = AnswerCache()
