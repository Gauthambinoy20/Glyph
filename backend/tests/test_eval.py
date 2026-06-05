"""Unit tests for the retrieval-quality scorer (offline, with a fake retriever)."""

from app.quality.evaluate import evaluate
from app.quality.golden import GOLDEN


class FakeRetriever:
    """Returns a preset list of file paths per question, as result dicts."""

    def __init__(self, mapping: dict[str, list[str]]) -> None:
        self._mapping = mapping

    def search(self, question: str, top_k: int = 5) -> list[dict]:
        return [{"file_path": f} for f in self._mapping.get(question, [])[:top_k]]


def test_evaluate_computes_hit_rate() -> None:  # T47
    golden = [{"question": "q1", "expect": "a.py"}, {"question": "q2", "expect": "b.py"}]
    retriever = FakeRetriever({"q1": ["x.py", "a.py"], "q2": ["y.py"]})  # q1 hits, q2 misses

    report = evaluate(retriever, golden)

    assert report["hits"] == 1
    assert report["total"] == 2
    assert report["hit_rate"] == 0.5
    assert report["details"][0]["hit"] is True
    assert report["details"][1]["hit"] is False


def test_evaluate_matches_expected_file_as_substring() -> None:
    golden = [{"question": "q", "expect": "retrieve/hybrid.py"}]
    retriever = FakeRetriever({"q": ["app/retrieve/hybrid.py"]})  # full path contains the expected

    assert evaluate(retriever, golden)["hit_rate"] == 1.0


def test_golden_set_is_substantial_and_well_formed() -> None:
    assert len(GOLDEN) >= 10
    assert all("question" in item and "expect" in item for item in GOLDEN)
