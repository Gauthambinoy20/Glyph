"""A friendly, readable test report for the terminal.

Instead of a row of dots, this prints every test as a plain-English sentence, grouped
by the part of the app it protects, with a green check or red cross, and a clear summary
at the end. It makes the whole suite understandable at a glance.
"""

import collections

# A friendly title for each test file, shown as a group heading. Files not listed here
# still appear, under their own filename.
_GROUP_TITLES = {
    "test_health.py": "Health  (the server is alive)",
    "test_chunker.py": "Chunker  (cut code into functions with exact line numbers)",
    "test_embedder.py": "Embedder  (turn code into searchable numbers)",
    "test_store.py": "Store  (save vectors and find the closest ones)",
    "test_cache.py": "Cache  (never re-process unchanged code)",
    "test_ingest.py": "Loader  (clone/walk a repo, then chunk, embed and store it)",
    "test_retrieval.py": "Search  (find the best chunks by meaning + keywords)",
    "test_llm.py": "AI client  (OpenRouter call, fallback, clear errors)",
    "test_prompt.py": "Prompt  (grounded prompt, citations, query logs)",
    "test_answer.py": "Answer  (the /api/ask and /api/models endpoints)",
    "test_graph.py": "Graph  (dependency graph from internal imports)",
    "test_stats.py": "Stats  (file/chunk/language breakdown for the project panel)",
    "test_files.py": "File  (read an indexed file back out for the code viewer)",
    "test_app.py": "App  (CORS, request ids, and the global error handler)",
    "test_e2e.py": "End-to-end  (the whole real pipeline through the endpoints)",
}

# Terminal colour codes.
_GREEN = "\033[32m"
_RED = "\033[31m"
_DIM = "\033[2m"
_BOLD = "\033[1m"
_RESET = "\033[0m"

# Collected results: filename -> list of (description, passed?).
_results: dict[str, list[tuple[str, bool]]] = collections.defaultdict(list)


def _describe(nodeid: str) -> str:
    """Turn a test function name into a short, capitalised sentence."""
    func = nodeid.split("::")[-1]
    text = func.removeprefix("test_").replace("_", " ")
    return text[:1].upper() + text[1:]


def pytest_runtest_logreport(report) -> None:
    """Record the outcome of each test's main call phase."""
    if report.when != "call":
        return
    filename = report.nodeid.split("::")[0].split("/")[-1]
    _results[filename].append((_describe(report.nodeid), report.passed))


def pytest_terminal_summary(terminalreporter) -> None:
    """Print the grouped, plain-English report after the run."""
    write = terminalreporter.write_line
    total = sum(len(items) for items in _results.values())
    passed = sum(1 for items in _results.values() for _, ok in items if ok)
    failed = total - passed

    # Known files first (in a sensible order), then any others.
    ordered = [f for f in _GROUP_TITLES if f in _results]
    ordered += [f for f in _results if f not in _GROUP_TITLES]

    write("")
    write(f"{_BOLD}  GLYPH TEST REPORT{_RESET}")
    write(f"{_DIM}  ──────────────────────────────────────────────────────{_RESET}")
    for filename in ordered:
        title = _GROUP_TITLES.get(filename, filename)
        write("")
        write(f"  {_BOLD}{title}{_RESET}")
        for description, ok in _results[filename]:
            mark = f"{_GREEN}✓{_RESET}" if ok else f"{_RED}✗ FAILED{_RESET}"
            write(f"      {mark}  {description}")

    write("")
    write(f"{_DIM}  ──────────────────────────────────────────────────────{_RESET}")
    summary_colour = _GREEN if failed == 0 else _RED
    write(
        f"  {summary_colour}{_BOLD}{passed} passed{_RESET}"
        f"   {_DIM}·{_RESET}   {failed} failed"
        f"   {_DIM}·{_RESET}   {total} tests"
    )
    write("")
