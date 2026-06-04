"""Structured query logging for observability.

Each answered question prints one JSON line with the question, which chunks were used, how
long it took, and the token usage. The API key is never part of this, so nothing secret
is logged. One JSON line per query is easy to grep or ship to a log system later.
"""

import json
import sys


def log_query(
    question: str,
    retrieved_chunk_ids: list[str],
    latency_ms: int,
    token_usage: dict[str, int],
) -> dict:
    """Write one JSON log line for a query and return the record (handy for tests)."""
    record = {
        "question": question,
        "retrieved_chunk_ids": retrieved_chunk_ids,
        "latency_ms": latency_ms,
        "token_usage": token_usage,
    }
    print(json.dumps(record), file=sys.stdout, flush=True)
    return record
