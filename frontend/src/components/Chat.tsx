// Chat column: empty state, user/Glyph messages, the rich grounded answer, and the composer.

import { useEffect, useRef, useState } from "react";

import type { Citation, Source } from "../api";
import type { Message, Suggestion } from "../types";
import { Icon } from "./Icon";
import { Markdown, highlightLine } from "./Markdown";

export type CodeRef = Citation | Source;

const shortModel = (m: string) => (m || "").split("/").pop();

// ── Empty state ──────────────────────────────────────────────────────────────
export function ChatEmpty({
  overview,
  suggestions,
  onAsk,
}: {
  overview: string;
  suggestions: Suggestion[];
  onAsk: (q: string) => void;
}) {
  return (
    <div className="chat-empty">
      {overview && (
        <div className="welcome-card">
          <div className="wc-hd">
            <span className="gd" />
            <b>Overview</b>
          </div>
          <p dangerouslySetInnerHTML={{ __html: mdInlineSafe(overview) }} />
        </div>
      )}
      <h2>Ask anything about this code</h2>
      <div className="suggest-grid">
        {suggestions.map((s) => (
          <button key={s.q} className="suggest-card" onClick={() => onAsk(s.q)}>
            <span className="sc-ic">
              <Icon name={s.icon} size={16} />
            </span>
            <span>
              <span className="sc-q">{s.q}</span>
              <span className="sc-h">{s.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// small local inline-markdown so we do not export mdInline from Markdown twice
function mdInlineSafe(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

// ── User message ─────────────────────────────────────────────────────────────
export function UserMessage({ text }: { text: string }) {
  return (
    <div className="msg">
      <div className="msg-head">
        <span className="avatar user">U</span>
        <span className="msg-who">You</span>
      </div>
      <div className="user-bubble">{text}</div>
    </div>
  );
}

// ── Thinking ─────────────────────────────────────────────────────────────────
export function Thinking() {
  return (
    <div className="msg">
      <div className="msg-head">
        <span className="avatar glyph">G</span>
        <span className="msg-who">Glyph</span>
      </div>
      <div className="thinking">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

// ── Glyph answer ─────────────────────────────────────────────────────────────
export function GlyphAnswer({
  msg,
  onOpenCode,
  onAsk,
  streaming,
}: {
  msg: Extract<Message, { role: "glyph" }>;
  onOpenCode: (ref: CodeRef) => void;
  onAsk: (q: string) => void;
  streaming?: boolean;
}) {
  const notFound = /^not found/i.test(msg.answer.trim());

  return (
    <div className="msg">
      <div className="msg-head">
        <span className="avatar glyph">G</span>
        <span className="msg-who">Glyph</span>
      </div>

      {notFound ? (
        <div className="notfound">
          <div className="nf-body">{msg.answer}</div>
        </div>
      ) : (
        <>
          <div className="answer">
            <Markdown>{msg.answer}</Markdown>
            {streaming && <span className="cursor">▍</span>}
          </div>

          {!streaming && (
            <div className="ans-meta">
              <span className="grounding">
                <Icon name="chain" size={14} />
                <span>
                  grounded on {msg.sources.length} source{msg.sources.length === 1 ? "" : "s"}
                </span>
              </span>

              {msg.meta && (
                <div className="metaline">
                  <span className="mdl">{shortModel(msg.meta.model)}</span>
                  <span className="sep">·</span>
                  <span>{(msg.meta.latency_ms / 1000).toFixed(1)}s</span>
                  <span className="sep">·</span>
                  <span>{msg.meta.token_usage.total_tokens.toLocaleString()} tokens</span>
                </div>
              )}

              <Citations citations={msg.citations} sources={msg.sources} onOpenCode={onOpenCode} />

              {msg.sources.length > 0 && <SourcesList sources={msg.sources} onOpenCode={onOpenCode} />}

              {msg.followups && msg.followups.length > 0 && (
                <div className="followups">
                  {msg.followups.map((f) => (
                    <button key={f} className="followup" onClick={() => onAsk(f)}>
                      <Icon name="zap" size={13} /> {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface Peek {
  src: Source;
  c: Citation;
  x: number;
  y: number;
  above: boolean;
  top: number;
}

// ── Citations (mono chips with a hover code preview) ─────────────────────────
function Citations({
  citations,
  sources,
  onOpenCode,
}: {
  citations: Citation[];
  sources: Source[];
  onOpenCode: (ref: CodeRef) => void;
}) {
  const [peek, setPeek] = useState<Peek | null>(null);
  if (!citations || citations.length === 0) return null;

  const fileName = (p: string) => p.split("/").pop();

  function showPeek(e: React.MouseEvent, c: Citation) {
    const src = sources.find((s) => s.file_path === c.file_path);
    if (!src) return;
    const r = e.currentTarget.getBoundingClientRect();
    const w = 420;
    let x = r.left;
    if (x + w > window.innerWidth - 12) x = window.innerWidth - w - 12;
    setPeek({ src, c, x, y: r.bottom + 8, above: r.bottom + 230 > window.innerHeight, top: r.top });
  }

  return (
    <div>
      <div className="cited-label">Cited</div>
      <div className="cite-chips" onMouseLeave={() => setPeek(null)}>
        {citations.map((c, i) => (
          <button
            key={i}
            className="cite-chip"
            onClick={() => onOpenCode(c)}
            onMouseEnter={(e) => showPeek(e, c)}
            onMouseLeave={() => setPeek(null)}
          >
            <span className="cc-ic">
              <Icon name="file" size={13} />
            </span>
            {fileName(c.file_path)}
            <span className="cc-lines">
              :{c.start_line}-{c.end_line}
            </span>
          </button>
        ))}
      </div>
      {peek && <CitePeek peek={peek} />}
    </div>
  );
}

function CitePeek({ peek }: { peek: Peek }) {
  const { src, c } = peek;
  const lines = src.code.replace(/\n$/, "").split("\n");
  const style: React.CSSProperties = peek.above
    ? { left: peek.x, bottom: window.innerHeight - peek.top + 8 }
    : { left: peek.x, top: peek.y };
  return (
    <div className="cite-peek" style={style}>
      <div className="cp-hd">
        <span>{src.file_path}</span>
        <span className="cp-lang">
          {src.language} · :{c.start_line}-{c.end_line}
        </span>
      </div>
      <pre>
        <code className="mono">
          {lines.slice(0, 8).map((l, idx) => (
            <span key={idx} className="ln" dangerouslySetInnerHTML={{ __html: highlightLine(l) || "&nbsp;" }} />
          ))}
        </code>
      </pre>
    </div>
  );
}

// ── Sources (collapsible) ────────────────────────────────────────────────────
function SourcesList({ sources, onOpenCode }: { sources: Source[]; onOpenCode: (ref: CodeRef) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sources">
      <button className="sources-toggle" data-open={open ? "1" : "0"} onClick={() => setOpen((o) => !o)}>
        <span className="chev">
          <Icon name="chevRight" size={14} />
        </span>
        {sources.length} source{sources.length === 1 ? "" : "s"} retrieved
      </button>
      {open && (
        <div className="sources-list">
          {sources.map((s) => (
            <div key={s.id} className="src-row" onClick={() => onOpenCode(s)}>
              <span className="src-type">{s.type}</span>
              <span className="src-sym">{s.symbol_name}</span>
              <span className="src-loc">
                {s.file_path.split("/").pop()}:{s.start_line}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────
export function Composer({ onSend, busy }: { onSend: (q: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [text]);

  function submit() {
    const v = text.trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          placeholder="Ask about the code…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
        />
        <button className="send" onClick={submit} disabled={busy || !text.trim()} aria-label="Send">
          {busy ? <span className="spinner" /> : <Icon name="arrowUp" size={18} />}
        </button>
      </div>
      <div className="composer-hint">
        <span className="mono">Enter</span> to send · <span className="mono">Shift+Enter</span> for newline
      </div>
    </div>
  );
}
