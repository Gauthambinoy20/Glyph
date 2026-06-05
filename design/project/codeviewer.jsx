// codeviewer.jsx — sliding middle column. Line numbers, highlighted cited lines, copy/close.

function CodeViewer({ source, hlStart, hlEnd, onClose }) {
  const bodyRef = React.useRef(null);
  const lines = source.code.replace(/\n$/, "").split("\n");
  const base = source.start_line || 1;

  // scroll the highlighted block into view (within the panel only)
  React.useEffect(() => {
    const el = bodyRef.current?.querySelector(".code-line.hl");
    if (el && bodyRef.current) {
      const top = el.offsetTop - bodyRef.current.clientHeight / 2 + 40;
      bodyRef.current.scrollTop = Math.max(0, top);
    }
  }, [source, hlStart, hlEnd]);

  return (
    <section className="code-col scroll">
      <header className="code-hd">
        <span className="code-file" title={source.file_path}>{source.file_path}</span>
        <span className="code-range">:{hlStart}-{hlEnd}</span>
        <span className="spacer" />
        <CopyButton text={source.code} />
        <button className="iconbtn" onClick={onClose} aria-label="Close code viewer" style={{ width: 28, height: 28 }}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="code-body scroll" ref={bodyRef}>
        {lines.map((l, i) => {
          const n = base + i;
          const hl = n >= hlStart && n <= hlEnd;
          const edge = n === hlStart || n === hlEnd;
          return (
            <div key={i} className={"code-line" + (hl ? " hl" : "") + (edge && hl ? " hl-edge" : "")}>
              <span className="gutter">{n}</span>
              <span className="src" dangerouslySetInnerHTML={{ __html: highlightLine(l) || "&nbsp;" }} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

Object.assign(window, { CodeViewer });
