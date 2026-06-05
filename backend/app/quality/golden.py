"""A small golden set: questions about Glyph's own backend and the file each should surface.

Used by evaluate.py to measure retrieval hit-rate — does the right file appear in the top-k
chunks for a natural-language question. The `expect` value is matched as a path substring.
"""

GOLDEN: list[dict[str, str]] = [
    {
        "question": "how does hybrid retrieval fuse semantic and keyword search",
        "expect": "retrieve/hybrid.py",
    },
    {
        "question": "where is the tree-sitter chunker that splits code by symbol",
        "expect": "ingest/chunker.py",
    },
    {
        "question": "how are embeddings cached so unchanged code is not re-embedded",
        "expect": "ingest/cache.py",
    },
    {
        "question": "where does the OpenRouter client call the model with a fallback",
        "expect": "llm/client.py",
    },
    {
        "question": "how is the grounded prompt built and citations parsed",
        "expect": "rag/prompt.py",
    },
    {
        "question": "how is the vector store configured for cosine similarity",
        "expect": "store/chroma_store.py",
    },
    {"question": "how does the walker skip junk files and cap size", "expect": "ingest/walker.py"},
    {"question": "where is the dependency import graph built", "expect": "analyze/graph.py"},
    {"question": "how are per-language repo stats computed", "expect": "analyze/stats.py"},
    {
        "question": "how does the code-aware tokenizer split camelCase and snake_case",
        "expect": "retrieve/tokenize.py",
    },
]
