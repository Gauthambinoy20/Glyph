// landing.jsx — pre-repo hero + ingest box. Priority screen.
// Hero variants (Tweak): "editorial" (default), "console" (with live answer preview), "split".

function Landing({ onIngest, onError, heroVariant, recent }) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);
  const timerRef = React.useRef(null);

  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  function submit(e) {
    if (e) e.preventDefault();
    if (busy) return;
    const v = value.trim() || "app";
    setBusy(true);
    // simulate ingest latency
    timerRef.current = setTimeout(() => {
      if (/fail|error|broken/i.test(v)) {
        setBusy(false);
        onError("The request timed out — try a smaller repo or a local folder path.");
        return;
      }
      setBusy(false);
      onIngest();
    }, 1700);
  }

  const variant = heroVariant || "editorial";

  return (
    <div className="landing">
      <div className="landing-grid" />
      <div className="landing-glow" />

      <div className="hero" data-variant={variant}>
        <span className="badge"><LogoMark /> Code intelligence</span>

        <h1 className="h1">Ask your <span className="accent">codebase</span>.</h1>

        <p className="subtitle">
          Point Glyph at a GitHub repo or a local folder, then ask questions and get answers
          grounded in the real code — with file and line citations.
        </p>

        <form className="ingest" onSubmit={submit}>
          <span className="lead"><Icon name="github" /></span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://github.com/owner/repo  ·  or a local path"
            spellCheck="false"
            aria-label="Repository URL or local path"
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <><span className="spinner" /> Ingesting</> : <>Ingest <Icon name="arrowRight" size={16} /></>}
          </button>
        </form>

        <p className="hint">Try <span className="mono">app</span> to index Glyph's own code.</p>

        {variant === "console" && <ConsolePreview />}
        {variant === "split" && null}

        {recent && recent.length > 0 && (
          <div className="land-recent">
            {recent.slice(0, 4).map((r) => (
              <button key={r.owner + r.name} className="rr" onClick={() => !busy && submit()}>
                <span className="dot-live" />
                <span className="mono">{r.owner}/{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {variant === "split" && <SplitArt />}
    </div>
  );
}

// "console" variant — a calm preview of a grounded answer beneath the hero
function ConsolePreview() {
  return (
    <div style={{
      margin: "34px auto 0", width: "min(620px, 92%)", textAlign: "left",
      background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 14,
      boxShadow: "var(--shadow)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
        <span className="avatar glyph" style={{ width: 20, height: 20, fontSize: 9 }}>G</span>
        <span style={{ fontSize: 13, color: "var(--text-2)" }}>How does retrieval work?</span>
      </div>
      <div style={{ padding: "14px" }}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)" }}>
          The query is embedded <strong style={{ color: "var(--text)" }}>locally</strong>, ranked by
          cosine similarity, and the top-6 chunks ground the answer.
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 13 }}>
          <span className="cite-chip"><span className="cc-ic"><Icon name="file" size={13} /></span>retrieval.py<span className="cc-lines">:18-41</span></span>
          <span className="cite-chip"><span className="cc-ic"><Icon name="file" size={13} /></span>embeddings.py<span className="cc-lines">:9-21</span></span>
        </div>
      </div>
    </div>
  );
}

// "split" variant — a floating citation card off to the side
function SplitArt() {
  return (
    <div style={{
      position: "absolute", right: "7vw", top: "50%", transform: "translateY(-50%) rotate(2deg)",
      width: 300, zIndex: 1, pointerEvents: "none", opacity: 0.9,
    }} className="split-art">
      <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        <div style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)", color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
          <span>retrieval.py</span><span style={{ color: "var(--faint)" }}>:18-41</span>
        </div>
        <div style={{ padding: "12px 0", lineHeight: 1.7 }}>
          {["def retrieve(query, k=6):", "    q_vec = embed_one(query)", "    scored.sort(...)", "    return top[:k]"].map((l, i) => (
            <div key={i} style={{ padding: "0 14px", background: i === 1 ? "var(--accent-soft)" : "transparent", boxShadow: i === 1 ? "inset 2px 0 0 var(--accent)" : "none", color: i === 0 ? "var(--lang-py)" : "var(--text-2)" }}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Landing });
