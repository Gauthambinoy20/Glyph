// app.jsx — orchestrates Glyph: landing ⇄ workspace, navbar, code viewer, ⌘K, tweaks.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": ["#7ee787", "#58c97e"],
  "density": "comfortable",
  "fontPair": "inter",
  "panelWidth": 332,
  "gridTexture": 40,
  "heroVariant": "console",
  "panelLayout": "default",
  "citeStyle": "chips"
}/*EDITMODE-END*/;

const FONT_PAIRS = {
  inter:   { sans: "'Inter', system-ui, -apple-system, sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace", label: "Inter · JetBrains Mono" },
  grotesk: { sans: "'Space Grotesk', system-ui, sans-serif",       mono: "'JetBrains Mono', ui-monospace, monospace", label: "Space Grotesk · JetBrains" },
  plex:    { sans: "'IBM Plex Sans', system-ui, sans-serif",       mono: "'IBM Plex Mono', ui-monospace, monospace",  label: "IBM Plex · Plex Mono" },
};
const ACCENTS = [
  ["#7ee787", "#58c97e"], // code green (brand)
  ["#5ad1ff", "#3aa0e0"], // signal blue
  ["#c9a3ff", "#a07ce0"], // iris
  ["#ffce6b", "#e0a93a"], // amber
];

// ── synthesize a grounded answer for arbitrary / panel-driven questions ───────
function buildAnswer(question) {
  const exact = GLYPH.answers[question.trim()];
  if (exact) return exact;

  // try to locate a source mentioned in the question
  const ql = question.toLowerCase();
  let hit = GLYPH.allSources.find((s) =>
    ql.includes(s.file_path.split("/").pop().toLowerCase()) ||
    ql.includes(s.symbol_name.toLowerCase())
  );
  // endpoint mention
  const ep = GLYPH.endpoints.find((e) => ql.includes(e.path.toLowerCase()));
  if (!hit && ep) hit = GLYPH.allSources.find((s) => s.file_path.includes("ask") || s.type === "route");
  if (!hit) hit = GLYPH.allSources[0];

  const others = GLYPH.allSources.filter((s) => s !== hit).slice(0, 2);
  const sources = [hit, ...others];
  const lat = GLYPH.latencies[Math.floor(Math.random() * GLYPH.latencies.length)];

  const answer =
    `Here's what the indexed code shows. \`${hit.symbol_name}\` lives in ` +
    `\`${hit.file_path}\` (lines ${hit.start_line}–${hit.end_line}) and is the most relevant ` +
    `${hit.type} for that question.\n\n` +
    "```" + (hit.language === "Python" ? "python" : "typescript") + "\n" +
    hit.code.split("\n").slice(0, 5).join("\n") + "\n```\n\n" +
    "Open the citation below to see the full definition in context.";

  return {
    answer,
    citations: [{ file_path: hit.file_path, start_line: hit.start_line, end_line: hit.end_line }],
    sources,
    meta: { model: "meta-llama/llama-3.3-70b-instruct", latency_ms: lat, token_usage: { prompt_tokens: 900 + Math.floor(Math.random() * 400), completion_tokens: 300 + Math.floor(Math.random() * 200), total_tokens: 1200 + Math.floor(Math.random() * 600) } },
    followups: ["Where is this called from?", "Show me a related file.", "How does retrieval work?"],
  };
}

function ModelPicker({ models, idx, onPick }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const m = models[idx];
  return (
    <div className="modelpick" ref={ref}>
      <button className="modelpick-btn" onClick={() => setOpen((o) => !o)}>
        <span>{m.label}</span>
        <span className="tier">{m.tier}</span>
        <Icon name="chevDown" size={13} />
      </button>
      {open && (
        <div className="menu">
          {models.map((mm, i) => (
            <button key={mm.id} className="menu-item" data-active={i === idx ? "1" : "0"} data-avail={mm.available ? "1" : "0"}
              onClick={() => { onPick(i); setOpen(false); }}>
              <span style={{ flex: 1 }}>
                <span className="mi-top">
                  <span className="mi-label">{mm.label}</span>
                  <span className={"tag-tier " + mm.tier}>{mm.tier}</span>
                </span>
                <span className="mi-note">{mm.note}</span>
              </span>
              {i === idx && <span style={{ color: "var(--accent)" }}><Icon name="check" size={16} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toasts({ toasts }) {
  return (
    <div className="toast-zone">
      {toasts.map((t) => (
        <div key={t.id} className={"toast" + (t.out ? " out" : "")}>
          <span className="ti"><Icon name="zap" size={17} /></span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function GraphModal({ graph, onClose, onPick }) {
  const wrapRef = React.useRef(null);
  const [dim, setDim] = React.useState({ w: 900, h: 560 });
  React.useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setDim({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current); return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  const langs = [...new Set(graph.nodes.map((n) => n.language))];
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="mt"><span className="card-title" style={{ fontSize: 13 }}><span className="gd" /> Architecture</span></span>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="graph-legend" style={{ margin: 0 }}>
              {langs.map((l) => <span className="li" key={l}><span className="ld" style={{ background: langColor(l) }} />{l}</span>)}
            </div>
            <button className="iconbtn" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30 }}><Icon name="close" /></button>
          </div>
        </div>
        <div className="modal-body" ref={wrapRef}>
          <ForceGraph nodes={graph.nodes} edges={graph.edges} width={dim.w} height={dim.h} onPick={onPick} big />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState("landing");
  const [messages, setMessages] = React.useState([]);
  const [pending, setPending] = React.useState(false);
  const [code, setCode] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [modelIdx, setModelIdx] = React.useState(0);
  const [graphModal, setGraphModal] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  const [sheet, setSheet] = React.useState(false);
  const scrollRef = React.useRef(null);
  const askTimer = React.useRef(null);

  const data = window.GLYPH;

  // toasts
  const pushToast = React.useCallback((msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, msg }]);
    setTimeout(() => setToasts((ts) => ts.map((x) => x.id === id ? { ...x, out: true } : x)), 4600);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 5000);
  }, []);

  // ⌘K
  React.useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (screen === "workspace") setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [screen]);

  // autoscroll chat
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pending]);

  function openCode(ref) {
    const src = ref.code ? ref : data.allSources.find((s) => s.file_path === ref.file_path);
    if (!src) { pushToast("No source preview available for that citation."); return; }
    setCode({ source: src, hlStart: ref.start_line || src.start_line, hlEnd: ref.end_line || src.end_line });
    setSheet(false);
  }

  function ask(question) {
    if (pending) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setPending(true);
    setSheet(false);
    const res = buildAnswer(question);
    clearTimeout(askTimer.current);
    askTimer.current = setTimeout(() => {
      setMessages((m) => [...m, { role: "glyph", ...res }]);
      setPending(false);
    }, 1100 + Math.random() * 600);
  }

  function reset() { setScreen("landing"); setMessages([]); setCode(null); setPending(false); }

  // session metrics
  const answers = messages.filter((m) => m.role === "glyph");
  const session = {
    queries: answers.length,
    avgLatency: answers.length ? answers.reduce((s, m) => s + m.meta.latency_ms, 0) / answers.length : 0,
    tokens: answers.reduce((s, m) => s + m.meta.token_usage.total_tokens, 0),
  };
  const answeredLatencies = answers.map((m) => m.meta.latency_ms);

  // tweak → css vars
  const font = FONT_PAIRS[t.fontPair] || FONT_PAIRS.inter;
  const rootStyle = {
    "--accent": Array.isArray(t.accent) ? t.accent[0] : t.accent,
    "--accent-2": Array.isArray(t.accent) ? t.accent[1] : t.accent,
    "--font-sans": font.sans,
    "--font-mono": font.mono,
    "--panel-w": t.panelWidth + "px",
    "--grid-alpha": (t.gridTexture / 100).toFixed(2),
    "--d": t.density === "compact" ? 0.82 : 1,
  };

  return (
    <div className="app" style={rootStyle}>
      <nav className="nav">
        <div className="nav-left">
          {screen === "workspace" && (
            <>
              <button className="iconbtn mobile-tabs" onClick={() => setSheet(true)} aria-label="Open panel" style={{ display: undefined }}>
                <Icon name="layers" size={18} />
              </button>
              <span className="repo-chip"><span className="dot-live" /><span className="mono">{data.repo.owner}/{data.repo.name}</span></span>
            </>
          )}
        </div>
        <div className="nav-center"><Logo /></div>
        <div className="nav-right">
          {screen === "workspace" && <ModelPicker models={data.models} idx={modelIdx} onPick={setModelIdx} />}
          {screen === "workspace" && (
            <button className="kbar" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" /> Search <span className="kbd">⌘K</span>
            </button>
          )}
          <button className="iconbtn" aria-label="Toggle theme" onClick={() => pushToast("Light theme is on the roadmap — dark is the primary system.")}>
            <Icon name="moon" size={17} />
          </button>
        </div>
      </nav>

      {screen === "landing" ? (
        <Landing
          heroVariant={t.heroVariant}
          recent={data.recent}
          onIngest={() => setScreen("workspace")}
          onError={pushToast}
        />
      ) : (
        <div className="workspace">
          {sheet && <div className="sheet-scrim" onClick={() => setSheet(false)} />}
          <ProjectPanel
            data={{ ...data, latencies: answeredLatencies }}
            session={session}
            onAsk={ask}
            onExpandGraph={() => setGraphModal(true)}
            onChangeRepo={reset}
            panelLayout={t.panelLayout}
            open={sheet}
          />

          {code && (
            <CodeViewer source={code.source} hlStart={code.hlStart} hlEnd={code.hlEnd} onClose={() => setCode(null)} />
          )}

          <div className="chat-col">
            <div className="chat-scroll scroll" ref={scrollRef}>
              {messages.length === 0 && !pending ? (
                <ChatEmpty overview={data.overview} suggestions={data.suggestions} onAsk={ask} />
              ) : (
                <div className="chat-inner">
                  {messages.map((m, i) =>
                    m.role === "user"
                      ? <UserMessage key={i} text={m.text} />
                      : <GlyphAnswer key={i} msg={m} onOpenCode={openCode} onAsk={ask} citeStyle={t.citeStyle} />
                  )}
                  {pending && <Thinking />}
                </div>
              )}
            </div>
            <Composer onSend={ask} busy={pending} />
          </div>
        </div>
      )}

      {paletteOpen && (
        <CommandPalette data={data} onClose={() => setPaletteOpen(false)} onOpenCode={openCode} onAsk={ask} onChangeRepo={reset} />
      )}
      {graphModal && (
        <GraphModal graph={data.graph} onClose={() => setGraphModal(false)} onPick={(n) => { setGraphModal(false); ask(`Explain ${n.label}.`); }} />
      )}

      <Toasts toasts={toasts} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={ACCENTS} onChange={(v) => setTweak("accent", v)} />
        <TweakSelect label="Type pairing" value={t.fontPair}
          options={Object.keys(FONT_PAIRS).map((k) => ({ value: k, label: FONT_PAIRS[k].label }))}
          onChange={(v) => setTweak("fontPair", v)} />

        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density} options={["comfortable", "compact"]} onChange={(v) => setTweak("density", v)} />
        <TweakSlider label="Panel width" value={t.panelWidth} min={288} max={400} step={4} unit="px" onChange={(v) => setTweak("panelWidth", v)} />
        <TweakSlider label="Grid texture" value={t.gridTexture} min={0} max={100} unit="%" onChange={(v) => setTweak("gridTexture", v)} />

        <TweakSection label="Variants" />
        <TweakRadio label="Landing hero" value={t.heroVariant} options={[{ value: "editorial", label: "Editorial" }, { value: "console", label: "Console" }, { value: "split", label: "Split" }]} onChange={(v) => setTweak("heroVariant", v)} />
        <TweakRadio label="Panel layout" value={t.panelLayout} options={[{ value: "default", label: "Default" }, { value: "intel-first", label: "Intel-first" }]} onChange={(v) => setTweak("panelLayout", v)} />
        <TweakRadio label="Citations" value={t.citeStyle} options={[{ value: "chips", label: "Chips" }, { value: "numbered", label: "Listed" }]} onChange={(v) => setTweak("citeStyle", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
