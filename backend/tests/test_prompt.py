"""Unit tests for the grounded prompt, citation parsing, and query logging."""

from app.obs.logging import log_query
from app.rag.prompt import build_messages, parse_citations


def test_prompt_grounds_and_includes_context() -> None:  # T34
    chunks = [
        {
            "file_path": "a.py",
            "start_line": 1,
            "end_line": 3,
            "symbol_name": "f",
            "code": "def f(): pass",
        }
    ]
    system_prompt, user_prompt = build_messages("what does f do", chunks)

    assert "Not found in the provided code" in system_prompt  # the refusal rule
    assert "[a.py:1-3]" in user_prompt  # numbered file:line context block
    assert "def f(): pass" in user_prompt  # the actual code is included


def test_citations_keep_only_retrieved_chunks() -> None:  # T41
    chunks = [
        {"file_path": "a.py", "start_line": 1, "end_line": 3, "symbol_name": "f", "code": "x"}
    ]
    answer = "It is defined in [a.py:1-3], definitely not [evil.py:9-9]."

    citations = parse_citations(answer, chunks)

    # Only the citation matching a retrieved chunk survives, and it is 1-indexed.
    assert citations == [{"file_path": "a.py", "start_line": 1, "end_line": 3}]


def test_log_query_writes_all_fields(capsys) -> None:  # T42
    record = log_query(
        "q?", ["id1", "id2"], 12, {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}
    )

    assert set(record) == {"question", "retrieved_chunk_ids", "latency_ms", "token_usage"}
    assert '"question"' in capsys.readouterr().out  # a JSON line was printed
