"""Deterministic, non-LLM replies for messages that are not code questions.

Glyph answers questions about the indexed repository. Two kinds of input never need the
retrieval pipeline or the model: small talk (a greeting, a thank-you, or a "what can you do"
question), and a question whose best retrieved chunk falls below the relevance floor. For both,
Glyph replies instantly without calling the LLM. These helpers produce a clear, formal message
for each case, so the UI never has to show a cold one-line refusal.
"""

import re

# Greetings are matched only when the whole message is essentially the greeting, so a real
# question such as "how does the hello route work" is never mistaken for one.
_GREETINGS = {
    "hi",
    "hii",
    "hiii",
    "hey",
    "heya",
    "hello",
    "helloo",
    "hiya",
    "yo",
    "howdy",
    "sup",
    "hai",
    "gm",
}

# Thanks are matched on the cleaned message; "thank ..." also covers "thank you so much".
_THANKS = {"thanks", "thank you", "thankyou", "thank u", "thx", "ty", "cheers", "much appreciated"}

# Capability questions are matched exactly (not as substrings) so a genuine code question that
# merely contains one of these words is never short-circuited.
_CAPABILITY = {
    "who are you",
    "what are you",
    "what can you do",
    "what do you do",
    "what can i ask",
    "what can i ask you",
    "what is this",
    "whats this",
    "what is glyph",
    "who is glyph",
    "how do you work",
    "help",
}

GREETING_REPLY = (
    "Hello. I am Glyph, a code-intelligence assistant. I answer questions about the repository "
    "that is currently indexed, and I cite the exact file and line behind every answer. To begin, "
    "ask something such as 'Where are the API endpoints defined?' or 'How is authentication "
    "handled?'"
)

THANKS_REPLY = (
    "You are welcome. If you have another question about this codebase, I am ready when you are."
)

CAPABILITIES_REPLY = (
    "I am Glyph, a code-intelligence assistant. I read the repository that is currently indexed "
    "and answer questions about it, grounding every answer in the real code with file-and-line "
    "citations. I can locate where something is implemented, explain how a part works, and map "
    "how files depend on one another. For example, ask 'Where are the API endpoints defined?'"
)

NOT_FOUND_REPLY = (
    "I could not find anything in the indexed code that answers this. I only answer from the "
    "repository that is currently loaded, so this may fall outside its scope, or the wording may "
    "not match how it appears in the source. Try rephrasing with a term you would expect to see in "
    "the code, or ask about a specific file, function, or endpoint."
)

_REPLIES = {
    "greeting": GREETING_REPLY,
    "thanks": THANKS_REPLY,
    "capabilities": CAPABILITIES_REPLY,
}


def _normalize(question: str) -> str:
    """Lower-case the message and strip punctuation, collapsing to single spaces."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", question.lower())).strip()


def detect_smalltalk(question: str) -> str | None:
    """Classify a non-code conversational message, or return None if it looks like a real question.

    Conservative on purpose: greetings match only when the message is essentially just the
    greeting, capability questions match exactly, so a genuine code question is never
    short-circuited.
    """
    norm = _normalize(question)
    if not norm:
        return None
    words = norm.split()
    if norm in _GREETINGS or (len(words) <= 2 and words[0] in _GREETINGS):
        return "greeting"
    if norm in _THANKS or norm.startswith("thank "):
        return "thanks"
    if norm in _CAPABILITY:
        return "capabilities"
    return None


def smalltalk_reply(kind: str) -> str:
    """Return the formal reply text for a small-talk kind from detect_smalltalk."""
    return _REPLIES[kind]
