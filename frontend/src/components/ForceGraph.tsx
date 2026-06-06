// Canvas force-directed import graph: live physics, draggable nodes, click a node to ask.

import { useEffect, useRef, useState } from "react";

import type { GraphNode, GraphData } from "../api";
import { gemStops } from "../palette";

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
  // animation phase (0..1) of the particle travelling along each edge, by edge index
  phases: number[];
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
    stateRef.current = { nodes, byId, edges, cx, cy, alpha: 1, phases: edges.map((_, i) => (i % 10) / 10) };
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

    const REP = big ? 5200 : 2600;
    const SPRING = big ? 0.02 : 0.018;
    const LINK_LEN = big ? 118 : 64;
    // Stronger pull to the centre in the big view so nodes form a readable cluster instead of
    // sliding out and piling into the corners.
    const GRAV = big ? 0.024 : 0.012;
    const DAMP = 0.86;

    function draw() {
      const S = stateRef.current;
      /* v8 ignore next -- state and context are always set before the raf loop runs */
      if (!S || !ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      S.edges.forEach((e, i) => {
        const a = S.byId[e.source];
        const b = S.byId[e.target];
        if (!a || !b) return;
        const lit = hoverRef.current && (e.source === hoverRef.current || e.target === hoverRef.current);
        // Tint each wire by its endpoints' languages, brighter when one end is hovered.
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, gemStops(a.language)[1]);
        grad.addColorStop(1, gemStops(b.language)[1]);
        ctx.strokeStyle = grad;
        ctx.globalAlpha = lit ? 0.95 : 0.4;
        ctx.lineWidth = lit ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // A particle flowing source → target makes the import direction feel alive.
        const t = S.phases[i];
        ctx.globalAlpha = lit ? 1 : 0.75;
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      S.nodes.forEach((n) => {
        const isHover = hoverRef.current === n.id;
        const [c0, c1, c2] = gemStops(n.language);
        if (isHover) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.fill();
        }
        // A glow plus a top-lit radial gradient turns the flat dot into a little gem.
        ctx.save();
        ctx.shadowColor = c1;
        ctx.shadowBlur = isHover ? 16 : 9;
        const g = ctx.createRadialGradient(n.x - n.r * 0.35, n.y - n.r * 0.35, n.r * 0.1, n.x, n.y, n.r);
        g.addColorStop(0, c0);
        g.addColorStop(0.4, c1);
        g.addColorStop(1, c2);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
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
      for (let i = 0; i < S.phases.length; i++) S.phases[i] = (S.phases[i] + 0.012) % 1;
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
