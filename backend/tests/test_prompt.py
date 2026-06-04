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
        {"file_path": "a.py", "start_line": 10, "end_line": 40, "symbol_name": "f", "code": "x"}
    ]
    # [a.py:12-15] points at lines inside the retrieved chunk -> kept.
    # [evil.py:9-9] is a file we never retrieved -> dropped.
    # [a.py:99-100] is the right file but outside the retrieved lines -> dropped.
    answer = "See [a.py:12-15], not [evil.py:9-9] and not [a.py:99-100]."

    citations = parse_citations(answer, chunks)

    assert citations == [{"file_path": "a.py", "start_line": 12, "end_line": 15}]


def test_citations_handle_bracket_styles() -> None:
    # Models vary: some use full-width 【 】 or round ( ) brackets instead of [ ].
    chunks = [
        {"file_path": "main.py", "start_line": 80, "end_line": 95, "symbol_name": "s", "code": "x"}
    ]
    citations = parse_citations("see 【main.py:82-91】 and (main.py:85-85)", chunks)

    assert {"file_path": "main.py", "start_line": 82, "end_line": 91} in citations
    assert {"file_path": "main.py", "start_line": 85, "end_line": 85} in citations


def test_prompt_includes_conversation_history() -> None:  # T43
    chunks = [
        {"file_path": "a.py", "start_line": 1, "end_line": 2, "symbol_name": "f", "code": "x"}
    ]
    history = [{"question": "what is f", "answer": "f adds two numbers"}]

    _, user_prompt = build_messages("where is it called", chunks, history)

    assert "Conversation so far" in user_prompt
    assert "f adds two numbers" in user_prompt  # the prior answer is carried in
    assert "where is it called" in user_prompt  # plus the new question


def test_log_query_writes_all_fields(capsys) -> None:  # T42
    record = log_query(
        "q?", ["id1", "id2"], 12, {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}
    )

    assert set(record) == {"question", "retrieved_chunk_ids", "latency_ms", "token_usage"}
    assert '"question"' in capsys.readouterr().out  # a JSON line was printed
