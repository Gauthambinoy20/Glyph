# Engineering Standards (Glyph)

The standards I hold this project to. Kept deliberately strict and simple.

## Way of working
- Build one vertical slice at a time. Make it work, test it, commit it, then move on.
- Plan a small step before writing it. Keep scope tight.
- Never keep code I cannot explain in one sentence.
- Always run the code and tests before calling a task done.

## Code
- Type hints on every Python function. Docstrings on every public function.
- Tiny single purpose functions. If a function does two things, split it. Small files too.
- A short, plain comment on every function saying what it does and why. Inline comments on any
  tricky logic. Comments read like a person wrote them.
- Explicit error handling: bad repo URL, unsupported file, empty results. No silent failures.
- Clear folders and names. No dead code, no copy paste.

## Tests
- A unit test for the smallest pieces, including the edge cases, so bugs surface early.
- Aim for high coverage on the real logic, not just the happy path.
- Tests run offline and fast (fakes for the model and the network).

## Dependencies
- Pin every version. No library unless it clearly earns its place.

## Secrets
- Never commit secrets. Use `.env` locally and ship a `.env.example`.

## Observability
- Log each query as one JSON line: question, retrieved chunk ids, latency, token usage.

## Commits
- Small commits, present tense, written plainly. One logical change per commit.

## Out of scope (acknowledged, not built)
- Auth, multi user, private repos, very large repos, every language. Python, JS and TS first.
