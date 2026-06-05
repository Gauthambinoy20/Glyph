// graph.jsx — canvas force-directed import graph. Live physics, draggable nodes, click to ask.

const LANG_COLOR = {
  TypeScript: "#4c9eff", Python: "#ffd866", CSS: "#c792ea", Markdown: "#9aa0aa", JSON: "#7ee787",
};
function langColor(l) { return LANG_COLOR[l] || "#9aa0aa"; }

function ForceGraph({ nodes: rawNodes, edges, width, height, onPick, big }) {
  const canvasRef = React.useRef(null);
  const stateRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const [hoverId, setHoverId] = React.useState(null);
  const hoverRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const reduced = React.useRef(false);

  React.useEffect(() => {
    reduced.current = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // build sim state once per node/edge set
  React.useEffect(() => {
    const cx = width / 2, cy = height / 2;
    const indeg = {};
    edges.forEach((e) => { indeg[e.target] = (indeg[e.target] || 0) + 1; });
    const nodes = rawNodes.map((n, i) => {
      const a = (i / rawNodes.length) * Math.PI * 2;
      const rad = Math.min(width, height) * 0.30;
      return {
        ...n,
        x: cx + Math.cos(a) * rad + (Math.random() - 0.5) * 20,
        y: cy + Math.sin(a) * rad + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        r: 4.5 + Math.min(5, (indeg[n.id] || 0) * 1.1),
        fixed: false,
      };
    });
    const byId = {}; nodes.forEach((n) => (byId[n.id] = n));
    stateRef.current = { nodes, byId, edges, cx, cy, alpha: 1 };
  }, [rawNodes, edges, width, height]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + "px"; canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const REP = big ? 5200 : 2600;
    const SPRING = 0.018, LINK_LEN = big ? 110 : 64, GRAV = 0.012, DAMP = 0.86;

    function step() {
      const S = stateRef.current;
      if (!S) return;
      const { nodes, edges, cx, cy } = S;
      // repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const f = REP / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // springs
      edges.forEach((e) => {
        const a = S.byId[e.source], b = S.byId[e.target];
        if (!a || !b) return;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - LINK_LEN) * SPRING;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      // gravity + integrate
      nodes.forEach((n) => {
        if (n.fixed) { n.vx = 0; n.vy = 0; return; }
        n.vx += (cx - n.x) * GRAV; n.vy += (cy - n.y) * GRAV;
        n.vx *= DAMP; n.vy *= DAMP;
        n.x += n.vx; n.y += n.vy;
        const pad = n.r + 6;
        n.x = Math.max(pad, Math.min(width - pad, n.x));
        n.y = Math.max(pad, Math.min(height - pad, n.y));
      });
      draw(ctx);
      S.alpha *= 0.997;
      rafRef.current = requestAnimationFrame(step);
    }

    function draw(ctx) {
      const S = stateRef.current;
      ctx.clearRect(0, 0, width, height);
      // edges
      ctx.lineWidth = 1;
      S.edges.forEach((e) => {
        const a = S.byId[e.source], b = S.byId[e.target];
        if (!a || !b) return;
        const lit = hoverRef.current && (e.source === hoverRef.current || e.target === hoverRef.current);
        ctx.strokeStyle = lit ? "rgba(126,231,135,0.45)" : "rgba(255,255,255,0.07)";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      // nodes
      S.nodes.forEach((n) => {
        const isHover = hoverRef.current === n.id;
        const c = langColor(n.language);
        if (isHover) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(126,231,135,0.12)"; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = c; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(8,9,11,0.9)"; ctx.stroke();
        if (isHover || big) {
          ctx.font = `${big ? 12 : 10}px 'JetBrains Mono', monospace`;
          ctx.fillStyle = isHover ? "#e9eaec" : "rgba(182,185,192,0.75)";
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          ctx.fillText(n.label, n.x, n.y + n.r + 4);
        }
      });
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, big, rawNodes, edges]);

  // pointer interaction
  function nodeAt(mx, my) {
    const S = stateRef.current; if (!S) return null;
    for (let i = S.nodes.length - 1; i >= 0; i--) {
      const n = S.nodes[i];
      const dx = mx - n.x, dy = my - n.y;
      if (dx * dx + dy * dy <= (n.r + 8) * (n.r + 8)) return n;
    }
    return null;
  }
  function rel(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e) {
    const { x, y } = rel(e);
    const n = nodeAt(x, y);
    if (n) { n.fixed = true; dragRef.current = { n, moved: false }; }
  }
  function onMove(e) {
    const { x, y } = rel(e);
    if (dragRef.current) {
      const { n } = dragRef.current;
      n.x = x; n.y = y; dragRef.current.moved = true;
      if (stateRef.current) stateRef.current.alpha = 1;
      return;
    }
    const n = nodeAt(x, y);
    const id = n ? n.id : null;
    if (id !== hoverRef.current) { hoverRef.current = id; setHoverId(id); }
    canvasRef.current.style.cursor = n ? "pointer" : "grab";
  }
  function onUp(e) {
    const d = dragRef.current;
    if (d) {
      d.n.fixed = false;
      if (!d.moved && onPick) onPick(d.n);
      dragRef.current = null;
    }
  }
  function onLeave() { hoverRef.current = null; setHoverId(null); if (dragRef.current) { dragRef.current.n.fixed = false; dragRef.current = null; } }

  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      style={big ? { height, borderRadius: 0, border: 0, background: "transparent" } : null}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onLeave}
    />
  );
}

Object.assign(window, { ForceGraph, langColor, LANG_COLOR });
