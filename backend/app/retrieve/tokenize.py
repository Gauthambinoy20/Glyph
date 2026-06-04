"""Turn text into code-aware tokens for keyword search.

Splits on non-alphanumeric characters AND breaks identifiers apart, so a query like
"getUserById" matches code containing get, user, by and id (and the whole word too).
Without this, keyword search would miss most real code symbols.
"""

import re

# Splits an identifier into sub-words: acronyms, camelCase parts, and number runs.
_SUBWORD = re.compile(r"[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+")


def tokenize_code(text: str) -> list[str]:
    """Return lowercase tokens, splitting camelCase and snake_case identifiers."""
    tokens: list[str] = []
    # First break on anything that is not a letter or digit (spaces, dots, underscores...).
    for piece in re.split(r"[^A-Za-z0-9]+", text):
        if not piece:
            continue
        whole = piece.lower()
        tokens.append(whole)
        # Then add each sub-word, so "getUserById" also yields get, user, by, id.
        for part in _SUBWORD.findall(piece):
            sub = part.lower()
            if sub != whole:
                tokens.append(sub)
    return tokens
