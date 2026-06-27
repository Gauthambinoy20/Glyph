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

# Matches a citation like [app/main.py:10-20], tolerating the variants different models emit:
# ASCII, full-width 【】 or round () brackets; any Unicode dash between the line numbers
# (‐-― covers hyphen, non-breaking hyphen, figure/en/em dashes — gpt-oss emits U+2011,
# which an ASCII-only "-" would silently drop, losing a real citation); and a SINGLE line with
# no range at all ([main.py:42]), which models emit often — without this it was silently
# dropped, leaving a grounded answer with no clickable citation. Spaces are allowed throughout.
_CITATION = re.compile(r"[\[(【]\s*([^\[\]()【】:]+):\s*(\d+)(?:\s*[-‐-―]\s*(\d+))?\s*[\])】]")


def build_messages(
    question: str, chunks: list[dict], history: list[dict] | None = None
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) grounding the model in the retrieved chunks.

    Any prior question/answer turns in `history` are included first, so a follow-up like
    "and where is that called?" has the earlier context to resolve "that".
    """
    blocks = []
    for index, chunk in enumerate(chunks, start=1):
        header = (
            f"[{chunk['file_path']}:{chunk['start_line']}-{chunk['end_line']}] "
            f"({chunk.get('symbol_name', '')})"
        )
        blocks.append(f"### Context {index} {header}\n{chunk.get('code', '')}")
    context = "\n\n".join(blocks) if blocks else "(no code found)"

    sections = []
    if history:
        turns = "\n\n".join(f"Q: {turn['question']}\nA: {turn['answer']}" for turn in history)
        sections.append(f"Conversation so far:\n{turns}")
    sections.append(f"Question: {question}")
    sections.append(f"Code context:\n{context}")
    return SYSTEM_PROMPT, "\n\n".join(sections)


def parse_citations(answer: str, chunks: list[dict]) -> list[dict]:
    """Return the [file:start-end] citations in the answer that point inside a retrieved chunk.

    A citation is kept only if a retrieved chunk in the SAME file overlaps its line range, so
    the model can cite specific lines within a shown chunk but cannot cite code it never saw.
    """
    seen: set[tuple[str, int, int]] = set()
    citations: list[dict] = []
    for match in _CITATION.finditer(answer):
        file_path, start = match.group(1), int(match.group(2))
        # A single-line citation ([file:42]) has no end; treat it as the one line.
        end = int(match.group(3)) if match.group(3) else start
        key = (file_path, start, end)
        if key in seen:
            continue
        for chunk in chunks:
            overlaps = start <= chunk["end_line"] and end >= chunk["start_line"]
            if chunk["file_path"] == file_path and overlaps:
                seen.add(key)
                citations.append({"file_path": file_path, "start_line": start, "end_line": end})
                break
    return citations
