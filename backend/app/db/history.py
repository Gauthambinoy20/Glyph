"""SQLite chat history: persist sessions and their messages so a chat survives a refresh.

Uses the standard-library sqlite3 (no extra dependency). The schema is created on first use.
A session holds an ordered list of messages; saving a session replaces its messages, so the
client can just push the whole conversation after each turn.
"""

import json
import sqlite3
import time
import uuid


class History:
    """A tiny SQLite store for chat sessions and their messages."""

    def __init__(self, path: str) -> None:
        self._path = path
        self._init()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._path)

    def _init(self) -> None:
        """Create the tables if they do not exist yet."""
        conn = self._connect()
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS sessions "
                "(id TEXT PRIMARY KEY, repo TEXT, created_at REAL)"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS messages "
                "(id TEXT PRIMARY KEY, session_id TEXT, ord INTEGER, role TEXT, "
                "content TEXT, data TEXT)"
            )
            conn.commit()
        finally:
            conn.close()

    def save(self, repo: str, messages: list[dict], session_id: str | None = None) -> str:
        """Create or replace a session and its messages; returns the session id."""
        sid = session_id or uuid.uuid4().hex[:12]
        conn = self._connect()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO sessions (id, repo, created_at) VALUES (?, ?, ?)",
                (sid, repo, time.time()),
            )
            conn.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
            for index, message in enumerate(messages):
                conn.execute(
                    "INSERT INTO messages (id, session_id, ord, role, content, data) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        uuid.uuid4().hex,
                        sid,
                        index,
                        str(message.get("role", "")),
                        str(message.get("content", "")),
                        json.dumps(message.get("data"))
                        if message.get("data") is not None
                        else None,
                    ),
                )
            conn.commit()
        finally:
            conn.close()
        return sid

    def load(self, session_id: str) -> dict | None:
        """Return {session_id, repo, messages[]} for a session, or None if it does not exist."""
        conn = self._connect()
        try:
            row = conn.execute("SELECT repo FROM sessions WHERE id = ?", (session_id,)).fetchone()
            if row is None:
                return None
            rows = conn.execute(
                "SELECT role, content, data FROM messages WHERE session_id = ? ORDER BY ord",
                (session_id,),
            ).fetchall()
        finally:
            conn.close()
        messages = [
            {"role": role, "content": content, "data": json.loads(data) if data else None}
            for role, content, data in rows
        ]
        return {"session_id": session_id, "repo": row[0], "messages": messages}

    def list_sessions(self, limit: int = 20) -> list[dict]:
        """List recent sessions (newest first) with their repo and message count."""
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT s.id, s.repo, s.created_at, COUNT(m.id) "
                "FROM sessions s LEFT JOIN messages m ON m.session_id = s.id "
                "GROUP BY s.id ORDER BY s.created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        finally:
            conn.close()
        return [
            {"session_id": sid, "repo": repo, "created_at": created_at, "message_count": count}
            for sid, repo, created_at, count in rows
        ]
