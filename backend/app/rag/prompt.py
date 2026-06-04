"""Build the grounded prompt and pull citations back out of the answer.

The prompt is strict on purpose: answer ONLY from the provided code, cite every claim as
[file:start-end], and if the answer is not in the context say so exactly. Citations in the
reply are then validated against the chunks that were actually retrieved, so the model
cannot cite code it was never shown.
"""

import re

# The system instructions that keep the model grounded and force citations.
SYSTEM_PROMPT = (
    "You are a precise code assistant. Answer the question using ONLY the code context "
    "provided below. Cite every claim with the source in square brackets as "
    "[file_path:start_line-end_line]. If the answer is not in the context, reply exactly: "
    "'Not found in the provided code.' Never invent code or file names."
)

# Matches a citation like [app/main.py:10-20].
_CITATION = re.compile(r"\[([^\[\]:]+):(\d+)-(\d+)\]")


def build_messages(question: str, chunks: list[dict]) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) grounding the model in the retrieved chunks."""
    blocks = []
    for index, chunk in enumerate(chunks, start=1):
        header = (
            f"[{chunk['file_path']}:{chunk['start_line']}-{chunk['end_line']}] "
            f"({chunk.get('symbol_name', '')})"
        )
        blocks.append(f"### Context {index} {header}\n{chunk.get('code', '')}")
    context = "\n\n".join(blocks) if blocks else "(no code found)"
    user_prompt = f"Question: {question}\n\nCode context:\n{context}"
    return SYSTEM_PROMPT, user_prompt


def parse_citations(answer: str, chunks: list[dict]) -> list[dict]:
    """Return the [file:start-end] citations in the answer that match a retrieved chunk."""
    retrieved = {(c["file_path"], c["start_line"], c["end_line"]) for c in chunks}
    seen: set[tuple[str, int, int]] = set()
    citations: list[dict] = []
    for match in _CITATION.finditer(answer):
        key = (match.group(1), int(match.group(2)), int(match.group(3)))
        if key in retrieved and key not in seen:
            seen.add(key)
            citations.append({"file_path": key[0], "start_line": key[1], "end_line": key[2]})
    return citations
