"""The embedder interface.

An embedder turns text into a vector (a list of numbers) that captures its meaning.
Hiding it behind a small Protocol lets us swap the local model for a hosted one by
changing a single setting, without touching the rest of the app.
"""

from collections.abc import Sequence
from typing import Protocol


class Embedder(Protocol):
    """Anything that can turn text into vectors of a fixed length."""

    dim: int  # how many numbers are in each vector this embedder makes

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed many passages at once (the code chunks we store)."""
        ...

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query (the user's question)."""
        ...
