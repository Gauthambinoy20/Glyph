// panel.jsx — left Project Intelligence panel: 8 widgets, collapsible cards, donut + sparkline.

// ── Donut (SVG arcs) ────────────────────────────────────────────────────────
function Donut({ segments, size = 84, stroke = 11, centerTop, centerBottom }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut" style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = s.pct / 100 * c;
          const el =
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={s.color} strokeWidth={stroke}
          strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
          strokeLinecap="butt" style={{ transition: "stroke-dasharray .6s var(--ease)" }} />;

          offset += len;
          return el;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1 }}>{centerTop}</div>
          <div style={{ fontSize: 9.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>{centerBottom}</div>
        </div>
      </div>
    </div>);

}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ values, width = 248, height = 40 }) {
  if (!values || values.length < 2) return <div style={{ height }} />;
  const min = Math.min(...values),max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = i / (values.length - 1) * width;
    const y = height - 4 - (v - min) / span * (height - 8);
    return [x, y];
  });
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${width} ${height} L0 ${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="spark-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-g)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--accent)" />
    </svg>);

}

// ── Collapsible card ──────────────────────────────────────────────────────────
function Card({ title, dot, action, children, defaultOpen = true, className }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className={"card collapsible " + (className || "")} data-open={open ? "1" : "0"}>
      <div className="card-hd" onClick={() => setOpen((o) => !o)}>
        <span className="card-title">{dot && <span className="gd" />}{title}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
          {action}
          <span className="chev" onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer", display: "grid", placeItems: "center" }}>
            <Icon name="chevDown" size={15} />
          </span>
        </div>
      </div>
      <div className="card-body">{children}</div>
    </section>);

}

// ── Widgets ───────────────────────────────────────────────────────────────────
function RepoHeader({ repo, onChangeRepo }) {
  const host = repo.url.replace(/^https?:\/\//, "");
  return (
    <section className="card repo-card">
      <div className="repo-id">
        <span className="repo-avatar" aria-hidden="true">{repo.owner.charAt(0)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="repo-name">
            <a href={repo.url} target="_blank" rel="noopener noreferrer">
              <span className="rn-owner">{repo.owner}/</span>{repo.name}
            </a>
          </div>
          <div className="repo-owner-meta">
            <Icon name="github" size={12} /> {repo.ownerType}
          </div>
        </div>
        <span className={"vis-badge"}>{repo.visibility}</span>
      </div>

      <p className="repo-desc">{repo.description}</p>

      <a className="repo-link" href={repo.url} target="_blank" rel="noopener noreferrer">
        <Icon name="link" size={13} />
        <span className="mono">{host}</span>
        <span className="repo-link-go"><Icon name="arrowRight" size={13} /></span>
      </a>

      <div className="repo-meta">
        <span className="rm"><Icon name="branch" size={12} /><span className="mono">{repo.branch}</span></span>
        <span className="rm"><Icon name="zap" size={12} /><span className="mono">{repo.stars}</span></span>
        <span className="rm"><Icon name="bookOpen" size={12} />{repo.license}</span>
        <span className="rm rm-pushed">pushed {repo.lastCommit}</span>
      </div>

      <div className="repo-foot">
        <span className="repo-indexed"><span className="dot-live" /> indexed {repo.lastIndexed}</span>
        <button className="ghost-btn" onClick={onChangeRepo}>
          <Icon name="refresh" size={13} /> Re-ingest
        </button>
      </div>
    </section>);

}

function LanguageStats({ languages, stats }) {
  const SHORT = { TypeScript: "TS", JavaScript: "JS", Python: "PY", CSS: "CSS", Markdown: "MD", JSON: "JSON" };
  return (
    <Card title="Languages · Index" dot>
      <div className="donut-wrap">
        <Donut segments={languages} centerTop={languages[0].pct + "%"} centerBottom={SHORT[languages[0].name] || languages[0].name.slice(0, 2)} />
        <div className="lang-legend" style={{ flex: 1 }}>
          {languages.map((l) =>
          <span className="li" key={l.name}>
              <span className="ld" style={{ background: l.color }} />
              {l.name}<span className="lp">{l.pct}%</span>
            </span>
          )}
        </div>
      </div>
      <div className="stat-tiles">
        <div className="tile"><div className="tv mono">{stats.files}</div><div className="tl">Files</div></div>
        <div className="tile"><div className="tv mono">{stats.chunks.toLocaleString()}</div><div className="tl">Chunks</div></div>
        <div className="tile accent"><div className="tv mono">{stats.cached.toLocaleString()}</div><div className="tl">Cached</div></div>
      </div>
    </Card>);

}

function Overview({ text, stack }) {
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {const t = setTimeout(() => setLoading(false), 1100);return () => clearTimeout(t);}, []);
  return (
    <Card title="Overview" dot>
      {loading ?
      <div className="shimmer-group">
          {[92, 100, 100, 64].map((w, i) =>
        <div key={i} className="shimmer sk-line" style={{ width: w + "%" }} />
        )}
        </div> :

      <>
          <p className="overview-body" dangerouslySetInnerHTML={{ __html: mdInline(text) }} />
          {stack && stack.length > 0 &&
        <div className="ov-stack">
              <div className="ov-stack-label">Detected stack</div>
              <div className="ov-chips">
                {stack.map((s) => <span key={s} className="ov-chip">{s}</span>)}
              </div>
            </div>
        }
        </>
      }
    </Card>);

}

function GraphCard({ graph, onExpand, onPick }) {
  const wrapRef = React.useRef(null);
  const [w, setW] = React.useState(280);
  React.useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, e.contentRect.width)));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const langs = [...new Set(graph.nodes.map((n) => n.language))];
  return (
    <Card title="Architecture" dot
    action={<button className="ghost-btn graph-expand-btn" onClick={onExpand} aria-label="Expand graph"><Icon name="expand" size={13} /></button>}>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <ForceGraph nodes={graph.nodes} edges={graph.edges} width={w} height={180} onPick={onPick} />
      </div>
      <div className="graph-legend">
        {langs.map((l) =>
        <span className="li" key={l}><span className="ld" style={{ background: langColor(l) }} />{l}</span>
        )}
      </div>
    </Card>);

}

// accurate import in-degree from the graph (how many files import each node)
function computeTopFiles(graph, n = 6) {
  const indeg = {};
  graph.edges.forEach((e) => {indeg[e.target] = (indeg[e.target] || 0) + 1;});
  return graph.nodes.
  map((nd) => ({ ...nd, count: indeg[nd.id] || 0 })).
  filter((x) => x.count > 0).
  sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).
  slice(0, n);
}

function TopFiles({ graph, onPick }) {
  const files = computeTopFiles(graph);
  const max = Math.max(1, ...files.map((f) => f.count));
  return (
    <Card title="Most depended-on" dot
    action={<span className="tf-unit">imports</span>}>
      <div className="tf-chart">
        {files.map((f, i) =>
        <div className="tf-item" key={f.id} onClick={() => onPick(f)}>
            <div className="tf-top">
              <span className="tf-rank mono">{String(i + 1).padStart(2, "0")}</span>
              <span className="tf-dot" style={{ background: langColor(f.language) }} />
              <span className="tf-name">{f.label}</span>
              <span className="tf-count mono">{f.count}</span>
            </div>
            <div className="tf-track">
              <i style={{ width: f.count / max * 100 + "%" }} />
            </div>
            <div className="tf-path">{f.path}</div>
          </div>
        )}
      </div>
    </Card>);

}

function Endpoints({ endpoints, onPick }) {
  return (
    <Card title="API endpoints" dot>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {endpoints.map((e) =>
        <div className="ep-row" key={e.method + e.path} onClick={() => onPick(e)}>
            <span className={"method " + e.method.toLowerCase()}>{e.method}</span>
            <span className="ep-path">{e.path}</span>
          </div>
        )}
      </div>
    </Card>);

}

function SessionMetrics({ session, latencies }) {
  const fmt = (ms) => (ms / 1000).toFixed(1) + "s";
  return (
    <Card title="Session" dot>
      <div className="metric-tiles">
        <div className="tile"><div className="tv mono">{session.queries}</div><div className="tl">Queries</div></div>
        <div className="tile"><div className="tv mono">{session.queries ? fmt(session.avgLatency) : "—"}</div><div className="tl">Avg</div></div>
        <div className="tile"><div className="tv mono">{session.tokens ? (session.tokens / 1000).toFixed(1) + "k" : "—"}</div><div className="tl">Tokens</div></div>
      </div>
      <div className="spark-wrap" style={{ width: "32px" }}>
        <div className="spark-hd">
          <span className="sl">Answer latency</span>
          <span className="sv">{latencies.length ? fmt(latencies[latencies.length - 1]) : "—"}</span>
        </div>
        <Sparkline values={latencies.length >= 2 ? latencies : [0, 0]} />
      </div>
    </Card>);

}

function RecentRepos({ recent, onOpen }) {
  return (
    <Card title="Recent repos" defaultOpen={false}>
      <div className="rr-list">
        {recent.map((r) =>
        <div className="rr-item" key={r.owner + r.name} onClick={() => onOpen(r)}>
            <span className="dot-live" style={{ opacity: r.when === "now" ? 1 : 0.4 }} />
            <span className="mono">{r.owner}/{r.name}</span>
            <span className="rr-meta">{r.when}</span>
          </div>
        )}
      </div>
    </Card>);

}

// ── Panel assembly ──────────────────────────────────────────────────────────
function ProjectPanel({ data, session, onAsk, onExpandGraph, onChangeRepo, panelLayout, open, onCloseSheet }) {
  const askAboutFile = (f) => onAsk(`Explain ${f.path || f.label || f.name}.`);
  const askAboutNode = (n) => onAsk(`Explain ${n.label}.`);
  const askAboutEndpoint = (e) => onAsk(`Explain the ${e.method} ${e.path} endpoint.`);

  const graphCard = <GraphCard key="g" graph={data.graph} onExpand={onExpandGraph} onPick={askAboutNode} />;
  const langCard = <LanguageStats key="l" languages={data.languages} stats={data.stats} />;
  const overviewCard = <Overview key="o" text={data.overview} stack={data.stack} />;
  const topCard = <TopFiles key="t" graph={data.graph} onPick={askAboutFile} />;
  const epCard = <Endpoints key="e" endpoints={data.endpoints} onPick={askAboutEndpoint} />;
  const sessCard = <SessionMetrics key="s" session={session} latencies={session.queries ? data.latencies.slice(0, session.queries + 1) : []} />;
  const recentCard = <RecentRepos key="r" recent={data.recent} onOpen={(r) => onChangeRepo()} />;

  // layout variants
  const order = panelLayout === "intel-first" ?
  [graphCard, langCard, topCard, epCard, overviewCard, sessCard, recentCard] :
  [langCard, overviewCard, graphCard, topCard, epCard, sessCard, recentCard];

  return (
    <aside className={"panel-col scroll" + (open ? " open" : "")}>
      <div className="panel-inner">
        <RepoHeader repo={data.repo} onChangeRepo={onChangeRepo} />
        {order}
      </div>
    </aside>);

}

function PanelEmpty() {
  return (
    <aside className="panel-col scroll">
      <div className="panel-empty">
        <div>
          <div className="pe-mark"><Icon name="layers" /></div>
          <p>Load a repo to see its intelligence.</p>
        </div>
      </div>
    </aside>);

}

Object.assign(window, { ProjectPanel, PanelEmpty, Donut, Sparkline, Card });