// palette.jsx — ⌘K command palette. Fuzzy search, arrow nav, Enter to act, Esc to close.

function fuzzy(needle, hay) {
  needle = needle.toLowerCase(); hay = hay.toLowerCase();
  if (!needle) return 1;
  let n = 0, score = 0, lastIdx = -1;
  for (let i = 0; i < hay.length && n < needle.length; i++) {
    if (hay[i] === needle[n]) {
      score += lastIdx === i - 1 ? 3 : 1; // contiguous bonus
      lastIdx = i; n++;
    }
  }
  return n === needle.length ? score + (hay.startsWith(needle) ? 10 : 0) : 0;
}

function CommandPalette({ data, onClose, onOpenCode, onAsk, onChangeRepo }) {
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  // build item universe
  const items = React.useMemo(() => {
    const arr = [];
    arr.push({ kind: "action", icon: "refresh", main: "Re-ingest repository", sub: "Re-index from source", run: () => { onChangeRepo(); } });
    arr.push({ kind: "action", icon: "compass", main: "Ask: what does this codebase do?", sub: "Overview", run: () => onAsk("What does this codebase do?") });
    arr.push({ kind: "action", icon: "search", main: "Ask: how does retrieval work?", sub: "Retrieval", run: () => onAsk("How does retrieval work?") });
    data.endpoints.forEach((e) => arr.push({
      kind: "endpoint", icon: "route", main: e.path, sub: e.method + " endpoint",
      run: () => onAsk(`Explain the ${e.method} ${e.path} endpoint.`),
    }));
    data.allSources.forEach((s) => arr.push({
      kind: "symbol", icon: "file", main: s.symbol_name, sub: `${s.file_path}:${s.start_line}`,
      run: () => onOpenCode(s),
    }));
    return arr;
  }, [data]);

  const results = React.useMemo(() => {
    if (!q.trim()) return items;
    return items
      .map((it) => ({ it, score: Math.max(fuzzy(q, it.main), fuzzy(q, it.sub) * 0.6) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.it);
  }, [q, items]);

  React.useEffect(() => { setActive(0); }, [q]);

  function choose(it) { if (!it) return; it.run(); onClose(); }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  React.useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="1"]');
    if (el) el.scrollIntoView ? null : null; // avoid scrollIntoView per guidelines
    if (el && listRef.current) {
      const lr = listRef.current.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.bottom > lr.bottom) listRef.current.scrollTop += er.bottom - lr.bottom + 8;
      if (er.top < lr.top) listRef.current.scrollTop -= lr.top - er.top + 8;
    }
  }, [active, results]);

  const Row = (it, idx) => {
    const isActive = idx === active;
    return (
      <div key={it.main + it.sub} className="pal-item" data-active={isActive ? "1" : "0"}
        onMouseEnter={() => setActive(idx)} onClick={() => choose(it)}>
        <span className="pi-ic"><Icon name={it.icon} size={15} /></span>
        <span style={{ minWidth: 0 }}>
          <span className="pi-main">{it.main}</span>
          <span className="pi-sub" style={{ display: "block" }}>{it.sub}</span>
        </span>
        <span className="pi-kind">{it.kind}</span>
      </div>
    );
  };

  // empty query → grouped browse; active query → flat score order (active = visually first)
  const searching = q.trim().length > 0;
  const groups = [
    { label: "Actions", kinds: ["action"] },
    { label: "Endpoints", kinds: ["endpoint"] },
    { label: "Files & symbols", kinds: ["symbol"] },
  ];

  return (
    <div className="pal-scrim" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="pal-search">
          <Icon name="search" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search files, symbols, or ask…" spellCheck="false" />
          <span className="esc">ESC</span>
        </div>
        <div className="pal-list scroll" ref={listRef}>
          {results.length === 0 && <div className="pal-empty">No matches for “{q}”.</div>}
          {searching
            ? <>
                <div className="pal-group-label">Results</div>
                {results.map((it) => Row(it, results.indexOf(it)))}
              </>
            : groups.map((g) => {
                const rows = results.filter((r) => g.kinds.includes(r.kind));
                if (rows.length === 0) return null;
                return (
                  <div key={g.label}>
                    <div className="pal-group-label">{g.label}</div>
                    {rows.map((it) => Row(it, results.indexOf(it)))}
                  </div>
                );
              })}
        </div>
        <div className="pal-foot">
          <span className="pf"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="pf"><span className="kbd">↵</span> select</span>
          <span className="pf"><span className="kbd">esc</span> close</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CommandPalette, fuzzy });
