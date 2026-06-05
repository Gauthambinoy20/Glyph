// chat.jsx — chat column: empty state, messages, rich Glyph answer, composer.

// ── Empty state ───────────────────────────────────────────────────────────────
function ChatEmpty({ overview, suggestions, onAsk }) {
  return (
    <div className="chat-empty">
      <div className="welcome-card">
        <div className="wc-hd"><span className="gd" /><b>Overview</b></div>
        <p dangerouslySetInnerHTML={{ __html: mdInline(overview) }} />
      </div>
      <h2>Ask anything about this code</h2>
      <div className="suggest-grid">
        {suggestions.map((s) => (
          <button key={s.q} className="suggest-card" onClick={() => onAsk(s.q)}>
            <span className="sc-ic"><Icon name={s.icon} size={16} /></span>
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

// ── User message ──────────────────────────────────────────────────────────────
function UserMessage({ text }) {
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

// ── Thinking ──────────────────────────────────────────────────────────────────
function Thinking() {
  return (
    <div className="msg">
      <div className="msg-head"><span className="avatar glyph">G</span><span className="msg-who">Glyph</span></div>
      <div className="thinking"><i /><i /><i /></div>
    </div>
  );
}

const shortModel = (m) => (m || "").split("/").pop();

// ── Glyph answer ──────────────────────────────────────────────────────────────
function GlyphAnswer({ msg, onOpenCode, onAsk, citeStyle, streaming }) {
  const notFound = /^not found/i.test(msg.answer.trim());

  return (
    <div className="msg">
      <div className="msg-head"><span className="avatar glyph">G</span><span className="msg-who">Glyph</span></div>

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
                <span>grounded on {msg.sources.length} source{msg.sources.length === 1 ? "" : "s"}</span>
              </span>

              <div className="metaline">
                <span className="mdl">{shortModel(msg.meta.model)}</span>
                <span className="sep">·</span>
                <span>{(msg.meta.latency_ms / 1000).toFixed(1)}s</span>
                <span className="sep">·</span>
                <span>{msg.meta.token_usage.total_tokens.toLocaleString()} tokens</span>
              </div>

              <Citations citations={msg.citations} sources={msg.sources} onOpenCode={onOpenCode} citeStyle={citeStyle} />

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

// ── Citations (with hover preview + treatment variants) ───────────────────────
function Citations({ citations, sources, onOpenCode, citeStyle }) {
  const [peek, setPeek] = React.useState(null);
  if (!citations || citations.length === 0) return null;

  const findSource = (c) => sources.find((s) => s.file_path === c.file_path) || null;
  const fileName = (p) => p.split("/").pop();

  function showPeek(e, c) {
    const src = findSource(c);
    if (!src) return;
    const r = e.currentTarget.getBoundingClientRect();
    const w = 420;
    let x = r.left; if (x + w > window.innerWidth - 12) x = window.innerWidth - w - 12;
    setPeek({ src, c, x, y: r.bottom + 8, above: r.bottom + 230 > window.innerHeight, top: r.top });
  }

  if (citeStyle === "numbered") {
    return (
      <div className="sources" onMouseLeave={() => setPeek(null)}>
        <div className="cited-label">Citations</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {citations.map((c, i) => (
            <div key={i} className="src-row" onClick={() => onOpenCode(c)}
              onMouseEnter={(e) => showPeek(e, c)} onMouseLeave={() => setPeek(null)}>
              <span className="src-type" style={{ color: "var(--accent)", background: "var(--accent-soft)" }}>{i + 1}</span>
              <span className="src-sym">{c.file_path}</span>
              <span className="src-loc">:{c.start_line}-{c.end_line}</span>
            </div>
          ))}
        </div>
        {peek && <CitePeek peek={peek} />}
      </div>
    );
  }

  // default: mono chips
  return (
    <div>
      <div className="cited-label">Cited</div>
      <div className="cite-chips" onMouseLeave={() => setPeek(null)}>
        {citations.map((c, i) => (
          <button key={i} className="cite-chip" onClick={() => onOpenCode(c)}
            onMouseEnter={(e) => showPeek(e, c)} onMouseLeave={() => setPeek(null)}>
            <span className="cc-ic"><Icon name="file" size={13} /></span>
            {fileName(c.file_path)}
            <span className="cc-lines">:{c.start_line}-{c.end_line}</span>
          </button>
        ))}
      </div>
      {peek && <CitePeek peek={peek} />}
    </div>
  );
}

function CitePeek({ peek }) {
  const { src, c } = peek;
  const startHl = c.start_line, endHl = c.end_line;
  const lines = src.code.replace(/\n$/, "").split("\n");
  const style = peek.above
    ? { left: peek.x, bottom: window.innerHeight - peek.top + 8 }
    : { left: peek.x, top: peek.y };
  return (
    <div className="cite-peek" style={style}>
      <div className="cp-hd">
        <span>{src.file_path}</span>
        <span className="cp-lang">{src.language} · :{startHl}-{endHl}</span>
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

// ── Sources (collapsible) ─────────────────────────────────────────────────────
function SourcesList({ sources, onOpenCode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="sources">
      <button className="sources-toggle" data-open={open ? "1" : "0"} onClick={() => setOpen((o) => !o)}>
        <span className="chev"><Icon name="chevRight" size={14} /></span>
        {sources.length} source{sources.length === 1 ? "" : "s"} retrieved
      </button>
      {open && (
        <div className="sources-list">
          {sources.map((s) => (
            <div key={s.id} className="src-row" onClick={() => onOpenCode(s)}>
              <span className="src-type">{s.type}</span>
              <span className="src-sym">{s.symbol_name}</span>
              <span className="src-loc">{s.file_path.split("/").pop()}:{s.start_line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────
function Composer({ onSend, busy }) {
  const [text, setText] = React.useState("");
  const taRef = React.useRef(null);

  function grow() {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }
  React.useEffect(grow, [text]);

  function submit() {
    const v = text.trim();
    if (!v || busy) return;
    onSend(v); setText("");
    requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = "auto"; });
  }
  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea ref={taRef} rows={1} value={text} placeholder="Ask about the code…"
          onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={busy} />
        <button className="send" onClick={submit} disabled={busy || !text.trim()} aria-label="Send">
          {busy ? <span className="spinner" style={{ borderColor: "rgba(6,39,13,.35)", borderTopColor: "#06270d" }} /> : <Icon name="arrowUp" size={18} />}
        </button>
      </div>
      <div className="composer-hint"><span className="mono">Enter</span> to send · <span className="mono">Shift+Enter</span> for newline</div>
    </div>
  );
}

Object.assign(window, { ChatEmpty, UserMessage, Thinking, GlyphAnswer, Composer, Citations, SourcesList, shortModel });
