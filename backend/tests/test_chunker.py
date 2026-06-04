"""Unit tests for the AST chunker.

The most important guarantee is that the recorded line numbers are EXACT, because
every code citation later depends on them. The helper below re-reads the original
file and checks that lines[start..end] match each chunk's code, for every chunk.
"""

from pathlib import Path

from app.ingest.chunker import Chunk, chunk_file

FIXTURES = Path(__file__).parent / "fixtures"


def _chunks_for(filename: str) -> tuple[list[Chunk], list[str]]:
    """Chunk a fixture file and also return its raw lines for line-accuracy checks."""
    source = (FIXTURES / filename).read_bytes()
    chunks = chunk_file(filename, source)
    text_lines = source.decode("utf-8").split("\n")
    return chunks, text_lines


def _by_name(chunks: list[Chunk], name: str) -> list[Chunk]:
    """Return all chunks with the given symbol name."""
    return [c for c in chunks if c.symbol_name == name]


def _assert_line_accuracy(chunks: list[Chunk], text_lines: list[str]) -> None:
    """Verify each chunk's line numbers are exact.

    The chunk's code must occupy exactly start_line..end_line. The first line can start
    mid-line for an indented symbol (e.g. a method starts after its indentation), so the
    first line is checked as a suffix; all later lines must match the file exactly.
    """
    for chunk in chunks:
        code_lines = chunk.code.split("\n")
        span = chunk.end_line - chunk.start_line + 1
        assert len(code_lines) == span, f"line count off for {chunk.symbol_name}"
        first_file_line = text_lines[chunk.start_line - 1]
        assert first_file_line.endswith(code_lines[0]), f"start mismatch for {chunk.symbol_name}"
        for offset in range(1, len(code_lines)):
            assert text_lines[chunk.start_line - 1 + offset] == code_lines[offset], (
                f"line mismatch for {chunk.symbol_name}"
            )


# ----- Python -----


def test_python_function_has_exact_lines() -> None:  # T04
    chunks, lines = _chunks_for("sample_py.py")
    add = _by_name(chunks, "add")
    assert len(add) == 1
    assert add[0].type == "function"
    assert add[0].code.startswith("def add(a, b):")
    _assert_line_accuracy(chunks, lines)


def test_python_class_and_method_captured() -> None:  # T05
    chunks, _ = _chunks_for("sample_py.py")
    assert _by_name(chunks, "Calculator") and _by_name(chunks, "Calculator")[0].type == "class"
    assert _by_name(chunks, "multiply")  # the method inside the class


def test_python_decorator_included_no_duplicate() -> None:  # T06
    chunks, _ = _chunks_for("sample_py.py")
    decorated = _by_name(chunks, "decorated_func")
    assert len(decorated) == 1  # not double counted
    assert "@my_decorator" in decorated[0].code  # decorator line is included


def test_python_module_level_code_captured() -> None:  # T07
    chunks, _ = _chunks_for("sample_py.py")
    module_chunks = [c for c in chunks if c.type == "module"]
    assert any("import os" in c.code for c in module_chunks)


# ----- JavaScript -----


def test_js_function_and_arrow_const_captured() -> None:  # T08
    chunks, lines = _chunks_for("sample_js.js")
    assert _by_name(chunks, "greet")
    assert _by_name(chunks, "square")  # arrow function assigned to a const
    assert _by_name(chunks, "Animal") and _by_name(chunks, "speak")
    _assert_line_accuracy(chunks, lines)


# ----- TypeScript -----


def test_ts_interface_type_and_function_captured() -> None:  # T09
    chunks, lines = _chunks_for("sample_ts.ts")
    assert _by_name(chunks, "User") and _by_name(chunks, "User")[0].type == "interface"
    assert _by_name(chunks, "ID") and _by_name(chunks, "ID")[0].type == "type"
    assert _by_name(chunks, "getUser")
    _assert_line_accuracy(chunks, lines)


# ----- TSX -----


def test_tsx_parses_and_captures_component() -> None:  # T10
    chunks, lines = _chunks_for("sample_tsx.tsx")
    button = _by_name(chunks, "Button")
    assert button
    assert "<button>" in button[0].code  # JSX parsed, not mangled
    _assert_line_accuracy(chunks, lines)


# ----- Oversized, unsupported, bad encoding -----


def test_oversized_function_is_split_with_contiguous_lines() -> None:  # T11
    body = [f"    x{i} = {i}" for i in range(200)]
    source = ("def big():\n" + "\n".join(body) + "\n").encode("utf-8")

    chunks = chunk_file("big.py", source, max_lines=50)

    assert len(chunks) >= 2
    assert all(c.symbol_name.startswith("big#part") for c in chunks)
    ordered = sorted(chunks, key=lambda c: c.start_line)
    # Each part must start exactly where the previous one ended.
    for prev, nxt in zip(ordered, ordered[1:], strict=False):
        assert nxt.start_line == prev.end_line + 1


def test_unsupported_extension_falls_back_to_text() -> None:  # T12
    chunks = chunk_file("notes.md", b"# Title\nsome text\nmore text\n")
    assert len(chunks) >= 1
    assert all(c.type == "text" for c in chunks)


def test_bad_encoding_does_not_crash() -> None:  # T13
    source = b"def f():\n    s = '\xff\xfe'\n    return s\n"  # invalid utf-8 inside the string
    chunks = chunk_file("weird.py", source)
    assert any(c.symbol_name == "f" for c in chunks)
