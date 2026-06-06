// Canvas force-directed import graph: live physics, draggable nodes, click a node to ask.

import { useEffect, useRef, useState } from "react";

import type { GraphNode, GraphData } from "../api";

// Keyed by the lowercased language name so "TypeScript", "Typescript" and "typescript" all
// resolve — prettyLang only capitalises the first letter, which used to miss these.
const LANG_COLOR: Record<string, string> = {
  typescript: "#4c9eff",
  tsx: "#4c9eff",
  javascript: "#f7df1e",
  jsx: "#f7df1e",
  python: "#ffd866",
  css: "#c792ea",
  html: "#e9682c",
  json: "#7ee787",
  markdown: "#9aa0aa",
  go: "#00add8",
  rust: "#ff7043",
  java: "#e76f00",
  ruby: "#e0455f",
  c: "#8d9bb0",
  cpp: "#f070a0",
  "c++": "#f070a0",
  "c#": "#9b6cff",
  php: "#8a91d6",
  shell: "#89e051",
  yaml: "#cb8f3a",
};

export function langColor(l: string): string {
  return LANG_COLOR[l.toLowerCase()] || "#9aa0aa";
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  fixed: boolean;
}

interface SimState {
  nodes: SimNode[];
  byId: Record<string, SimNode>;
  edges: GraphData["edges"];
  cx: number;
  cy: number;
  alpha: number;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphData["edges"];
  width: number;
  height: number;
  onPick?: (n: GraphNode) => void;
  big?: boolean;
}

/** A small physics simulation drawn to canvas. Hover lights edges; click (no drag) asks. */
export function ForceGraph({ nodes: rawNodes, edges, width, height, onPick, big }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SimState | null>(null);
  const rafRef = useRef(0);
  const [, setHoverId] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ n: SimNode; moved: boolean } | null>(null);

  // Build the simulation state once per node/edge/size change.
  useEffect(() => {
    const cx = width / 2;
    const cy = height / 2;
    const indeg: Record<string, number> = {};
    edges.forEach((e) => {
      indeg[e.target] = (indeg[e.target] || 0) + 1;
    });
    const nodes: SimNode[] = rawNodes.map((n, i) => {
      const a = (i / rawNodes.length) * Math.PI * 2;
      const rad = Math.min(width, height) * 0.3;
      return {
        ...n,
        x: cx + Math.cos(a) * rad + (i % 5) - 2,
        y: cy + Math.sin(a) * rad + (i % 3) - 1,
        vx: 0,
        vy: 0,
        r: 4.5 + Math.min(5, (indeg[n.id] || 0) * 1.1),
        fixed: false,
      };
    });
    const byId: Record<string, SimNode> = {};
    nodes.forEach((n) => (byId[n.id] = n));
    stateRef.current = { nodes, byId, edges, cx, cy, alpha: 1 };
  }, [rawNodes, edges, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    /* v8 ignore next -- the canvas ref is always attached once this effect runs */
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const REP = big ? 7400 : 2600;
    const SPRING = 0.018;
    const LINK_LEN = big ? 138 : 64;
    const GRAV = big ? 0.0092 : 0.012;
    const DAMP = 0.86;

    function draw() {
      const S = stateRef.current;
      /* v8 ignore next -- state and context are always set before the raf loop runs */
      if (!S || !ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      S.edges.forEach((e) => {
        const a = S.byId[e.source];
        const b = S.byId[e.target];
        if (!a || !b) return;
        const lit = hoverRef.current && (e.source === hoverRef.current || e.target === hoverRef.current);
        ctx.strokeStyle = lit ? "rgba(126,231,135,0.45)" : "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
      S.nodes.forEach((n) => {
        const isHover = hoverRef.current === n.id;
        if (isHover) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(126,231,135,0.12)";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = langColor(n.language);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(8,9,11,0.9)";
        ctx.stroke();
        // In the big view, label only the hub nodes (bigger radius = more depended-on) plus
        // whatever is hovered, so the graph reads cleanly instead of a wall of overlapping names.
        if (isHover || (big && n.r >= 6.6)) {
          ctx.font = `${big ? 12 : 10}px 'JetBrains Mono', monospace`;
          ctx.fillStyle = isHover ? "#e9eaec" : "rgba(182,185,192,0.78)";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(n.label, n.x, n.y + n.r + 4);
        }
      });
    }

    function step() {
      const S = stateRef.current;
      /* v8 ignore next -- state is always set before the raf loop runs */
      if (!S) return;
      const { nodes, cx, cy } = S;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 0.01;
          const f = REP / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      S.edges.forEach((e) => {
        const a = S.byId[e.source];
        const b = S.byId[e.target];
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - LINK_LEN) * SPRING;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      });
      nodes.forEach((n) => {
        if (n.fixed) {
          n.vx = 0;
          n.vy = 0;
          return;
        }
        n.vx += (cx - n.x) * GRAV;
        n.vy += (cy - n.y) * GRAV;
        n.vx *= DAMP;
        n.vy *= DAMP;
        n.x += n.vx;
        n.y += n.vy;
        const pad = n.r + 6;
        n.x = Math.max(pad, Math.min(width - pad, n.x));
        n.y = Math.max(pad, Math.min(height - pad, n.y));
      });
      draw();
      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, big]);

  function nodeAt(mx: number, my: number): SimNode | null {
    const S = stateRef.current;
    /* v8 ignore next -- nodeAt only fires from pointer handlers, after state is built */
    if (!S) return null;
    for (let i = S.nodes.length - 1; i >= 0; i--) {
      const n = S.nodes[i];
      const dx = mx - n.x;
      const dy = my - n.y;
      if (dx * dx + dy * dy <= (n.r + 8) * (n.r + 8)) return n;
    }
    return null;
  }
  function rel(e: React.MouseEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e: React.MouseEvent) {
    const { x, y } = rel(e);
    const n = nodeAt(x, y);
    if (n) {
      n.fixed = true;
      dragRef.current = { n, moved: false };
    }
  }
  function onMove(e: React.MouseEvent) {
    const { x, y } = rel(e);
    if (dragRef.current) {
      const { n } = dragRef.current;
      n.x = x;
      n.y = y;
      dragRef.current.moved = true;
      return;
    }
    const n = nodeAt(x, y);
    const id = n ? n.id : null;
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      setHoverId(id);
    }
    canvasRef.current!.style.cursor = n ? "pointer" : "grab";
  }
  function onUp() {
    const d = dragRef.current;
    if (d) {
      d.n.fixed = false;
      if (!d.moved && onPick) onPick(d.n);
      dragRef.current = null;
    }
  }
  function onLeave() {
    hoverRef.current = null;
    setHoverId(null);
    if (dragRef.current) {
      dragRef.current.n.fixed = false;
      dragRef.current = null;
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      style={big ? { height, borderRadius: 0, border: 0, background: "transparent" } : undefined}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onLeave}
    />
  );
}
