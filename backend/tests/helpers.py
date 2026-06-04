"""Shared test helpers."""

from app.ingest.chunker import Chunk


def make_chunk(
    code: str,
    name: str = "f",
    path: str = "a.py",
    start: int = 1,
    end: int = 1,
) -> Chunk:
    """Build a Chunk for tests without needing to parse a real file."""
    return Chunk(
        file_path=path,
        language="python",
        symbol_name=name,
        type="function",
        start_line=start,
        end_line=end,
        code=code,
    )


class FakeEmbedder:
    """A deterministic, offline embedder for fast tests.

    It does not capture real meaning; it just turns text into a fixed-size vector and
    counts how many texts it embedded, so cache tests can prove that work was skipped.
    """

    def __init__(self, dim: int = 8) -> None:
        self.dim = dim
        self.embedded = 0  # how many texts have been embedded so far

    def _vector(self, text: str) -> list[float]:
        vector = [0.0] * self.dim
        for index, char in enumerate(text):
            vector[index % self.dim] += (ord(char) % 13) / 13.0
        return vector

    def embed_documents(self, texts):
        self.embedded += len(texts)
        return [self._vector(text) for text in texts]

    def embed_query(self, text):
        return self.embed_documents([text])[0]
