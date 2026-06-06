// Pixel-faithful D3/SVG architecture graph for the expanded modal: gem-gradient nodes with
// glow, animated flow particles along the import edges, ghost language clusters, a deterministic
// "clean home" layout that every file springs back to after a drag, hover-to-trace, and RESET.
// Driven by the real /api/graph data (nodes + import edges), not sample data.

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

import type { GraphData, GraphNode } from "../api";
import { Icon } from "./Icon";
import { langColor } from "./ForceGraph";

// The mockup palette (mid, dark) for the languages Glyph parses precisely. Any other language
// falls back to langColor() for the mid stop and a derived dark stop, so the look generalises.
const GEM: Record<string, [string, string]> = {
  javascript: ["#f4d35e", "#7a6612"],
  python: ["#e8a93c", "#74520f"],
  tsx: ["#5aa8ff", "#1c4a82"],
  typescript: ["#2dd4bf", "#0d5f55"],
};

// Fixed quadrant anchors so the four core languages land exactly where the mockup places them.
const FIXED: Record<string, [number, number]> = {
  python: [0.28, 0.35],
  typescript: [0.72, 0.35],
  tsx: [0.72, 0.68],
  javascript: [0.28, 0.68],
};

/** Darken a #rrggbb colour toward black by factor f (0..1) for the gradient's outer stop. */
function darken(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  /* v8 ignore next -- defensive: langColor() always yields a valid #rrggbb */
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** [light, mid, dark] stops for a language's gem gradient. */
export function gemStops(lang: string): [string, string, string] {
  const key = lang.toLowerCase();
  const mid = GEM[key]?.[0] ?? langColor(key);
  const dark = GEM[key]?.[1] ?? darken(mid, 0.55);
  return ["#ffffff", mid, dark];
}

interface SimNode extends GraphNode, d3.SimulationNodeDatum {
  x: number;
  y: number;
  hx: number;
  hy: number;
  deg: number;
}
type SimLink = { source: SimNode; target: SimNode; i: number; t: number };

interface Props {
  nodes: GraphNode[];
  edges: GraphData["edges"];
  onPick?: (n: GraphNode) => void;
  onClose?: () => void;
}

/** Expanded architecture graph. The heavy d3 build + animation loop is excluded from coverage
 *  (same convention as the canvas ForceGraph) because it depends on layout/raf timing. */
export function D3Graph({ nodes, edges, onPick, onClose }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const statRef = useRef<HTMLSpanElement>(null);
  const [dim, setDim] = useState({ w: 960, h: 540 });

  // Languages present, in first-seen order — drives the legend chips (pure, so it stays covered).
  const langs = useMemo(() => [...new Set(nodes.map((n) => n.language))], [nodes]);

  /* v8 ignore start -- ResizeObserver wiring is layout/browser-bound */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setDim({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* v8 ignore stop */

  /* v8 ignore start -- d3 force build + requestAnimationFrame paint loop (timing/layout bound) */
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || nodes.length === 0 || dim.w === 0) return;
    const W = dim.w;
    const H = dim.h;

    const svg = d3.select(svgEl).attr("viewBox", [0, 0, W, H].join(" "));
    svg.selectAll("*").remove();

    // ---- data: degree, radius scale, language clusters ----
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n, x: 0, y: 0, hx: 0, hy: 0, deg: 0 }));
    const byId: Record<string, SimNode> = {};
    simNodes.forEach((n) => (byId[n.id] = n));
    const simLinks: SimLink[] = edges
      .filter((e) => byId[e.source] && byId[e.target])
      .map((e, i) => ({ source: byId[e.source], target: byId[e.target], i, t: (i % 10) / 10 }));
    simLinks.forEach((l) => {
      l.source.deg++;
      l.target.deg++;
    });
    simNodes.forEach((n) => (n.deg = n.deg || 1));
    const maxDeg = d3.max(simNodes, (d) => d.deg) ?? 1;
    const r = d3.scaleSqrt().domain([1, maxDeg]).range([6, 24]);

    // Use the mockup's fixed quadrants only for the full four-language case; otherwise spread the
    // clusters evenly around the centre, and centre a single-language repo so it is not lopsided.
    const useQuadrants = langs.length === 4 && langs.every((l) => FIXED[l.toLowerCase()]);
    const anchor: Record<string, [number, number]> = {};
    langs.forEach((l, i) => {
      if (useQuadrants) {
        const [fx, fy] = FIXED[l.toLowerCase()];
        anchor[l] = [W * fx, H * fy];
      } else if (langs.length === 1) {
        anchor[l] = [W * 0.5, H * 0.5];
      } else {
        const ang = (i / langs.length) * 2 * Math.PI - Math.PI / 2;
        anchor[l] = [W * 0.5 + Math.cos(ang) * W * 0.28, H * 0.5 + Math.sin(ang) * H * 0.3];
      }
    });

    // ---- deterministic clean "home" layout: hub at cluster centre, dependents ringed around ----
    const byLang: Record<string, SimNode[]> = {};
    langs.forEach((l) => (byLang[l] = []));
    simNodes.forEach((n) => byLang[n.language].push(n));
    langs.forEach((l) => {
      const arr = byLang[l].sort((a, b) => b.deg - a.deg);
      const [ax, ay] = anchor[l];
      arr.forEach((n, k) => {
        if (k === 0) {
          n.x = ax;
          n.y = ay;
        } else {
          const ang = ((k - 1) / Math.max(1, arr.length - 1)) * 2 * Math.PI;
          n.x = ax + Math.cos(ang) * 80;
          n.y = ay + Math.sin(ang) * 80;
        }
      });
    });

    const settle = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink(simLinks)
          .id((d) => (d as SimNode).id)
          .distance(52)
          .strength(0.35),
      )
      .force("charge", d3.forceManyBody().strength(-150))
      .force("x", d3.forceX((d) => anchor[(d as SimNode).language][0]).strength(0.18))
      .force("y", d3.forceY((d) => anchor[(d as SimNode).language][1]).strength(0.18))
      .force(
        "collide",
        d3.forceCollide().radius((d) => r((d as SimNode).deg) + 6),
      )
      .stop();
    for (let i = 0; i < 320; i++) settle.tick();
    simNodes.forEach((n) => {
      n.hx = n.x;
      n.hy = n.y;
    });

    // live sim: gently pull every file back toward its frozen home → smooth spring-back
    const sim = d3
      .forceSimulation(simNodes)
      .force("x", d3.forceX<SimNode>((d) => d.hx).strength(0.16))
      .force("y", d3.forceY<SimNode>((d) => d.hy).strength(0.16))
      .force("charge", d3.forceManyBody().strength(-45))
      .force(
        "link",
        d3
          .forceLink(simLinks)
          .id((d) => (d as SimNode).id)
          .distance(52)
          .strength(0.08),
      )
      .alpha(0.4)
      .alphaTarget(0)
      .restart();

    // ---- defs: gem gradients, node glow, wire glow + per-link gradient ----
    const defs = svg.append("defs");
    langs.forEach((l) => {
      const f = defs
        .append("filter")
        .attr("id", "glow-" + l)
        .attr("x", "-90%")
        .attr("y", "-90%")
        .attr("width", "280%")
        .attr("height", "280%");
      f.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "b");
      const mg = f.append("feMerge");
      mg.append("feMergeNode").attr("in", "b");
      mg.append("feMergeNode").attr("in", "SourceGraphic");
      const [c0, c1, c2] = gemStops(l);
      const rg = defs
        .append("radialGradient")
        .attr("id", "gem-" + l)
        .attr("cx", "35%")
        .attr("cy", "30%")
        .attr("r", "75%");
      rg.append("stop").attr("offset", "0%").attr("stop-color", c0);
      rg.append("stop").attr("offset", "35%").attr("stop-color", c1);
      rg.append("stop").attr("offset", "100%").attr("stop-color", c2);
    });
    const lf = defs
      .append("filter")
      .attr("id", "wireGlow")
      .attr("x", "-40%")
      .attr("y", "-40%")
      .attr("width", "180%")
      .attr("height", "180%");
    lf.append("feGaussianBlur").attr("stdDeviation", "1.6").attr("result", "b");
    const lm = lf.append("feMerge");
    lm.append("feMergeNode").attr("in", "b");
    lm.append("feMergeNode").attr("in", "SourceGraphic");
    const lgrad = defs
      .selectAll("linearGradient")
      .data(simLinks)
      .join("linearGradient")
      .attr("id", (d) => "wire-" + d.i)
      .attr("gradientUnits", "userSpaceOnUse");
    lgrad.append("stop").attr("class", "s0").attr("offset", "0%");
    lgrad.append("stop").attr("class", "s1").attr("offset", "100%");

    const stage = svg.append("g").attr("class", "stage");
    setTimeout(() => stage.classed("in", true), 120);

    const ghost = stage
      .append("g")
      .selectAll("text")
      .data(langs)
      .join("text")
      .attr("class", "ghost")
      .text((d) => d.toUpperCase())
      .attr("font-size", 56)
      .attr("fill", (d) => gemStops(d)[1])
      .attr("opacity", 0.08);

    const link = stage
      .append("g")
      .attr("filter", "url(#wireGlow)")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d) => "url(#wire-" + d.i + ")")
      .attr("stroke-width", 1.4)
      .attr("stroke-opacity", 0.7);

    const flow = stage
      .append("g")
      .selectAll("circle")
      .data(simLinks)
      .join("circle")
      .attr("r", 1.8)
      .attr("fill", "#fff")
      .attr("opacity", 0.9)
      .attr("filter", "url(#wireGlow)");

    const node = stage
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(simNodes)
      .join("g")
      .attr("class", "node");
    node
      .append("circle")
      .attr("r", (d) => r(d.deg))
      .attr("fill", (d) => "url(#gem-" + d.language + ")")
      .attr("filter", (d) => "url(#glow-" + d.language + ")");
    node
      .append("text")
      .text((d) => d.label)
      .attr("x", (d) => r(d.deg) + 7)
      .attr("y", 4);
    node.filter((d) => d.deg >= 3).classed("label-on", true);

    const neighbors: Record<string, Set<string>> = {};
    simLinks.forEach((l) => {
      (neighbors[l.source.id] = neighbors[l.source.id] || new Set()).add(l.target.id);
      (neighbors[l.target.id] = neighbors[l.target.id] || new Set()).add(l.source.id);
    });

    const setStat = () => {
      if (statRef.current)
        statRef.current.textContent = `${simNodes.length} files  ·  ${simLinks.length} imports`;
    };
    setStat();

    node
      .on("mouseover", (_e, d) => {
        node.classed("dim", (n) => n.id !== d.id && !neighbors[d.id]?.has(n.id));
        node.filter((n) => n.id === d.id || !!neighbors[d.id]?.has(n.id)).classed("label-on", true);
        link
          .attr("stroke-opacity", (l) => (l.source.id === d.id || l.target.id === d.id ? 1 : 0.06))
          .attr("stroke-width", (l) => (l.source.id === d.id || l.target.id === d.id ? 2.2 : 1.4));
        flow.attr("opacity", (l) => (l.source.id === d.id || l.target.id === d.id ? 1 : 0));
        ghost
          .transition()
          .duration(200)
          .attr("opacity", (g) => (g === d.language ? 0.15 : 0.03));
        if (statRef.current) statRef.current.textContent = `${d.label}  ·  ${d.deg} connections`;
      })
      .on("mouseout", () => {
        node.classed("dim", false);
        node.filter((n) => n.deg < 3).classed("label-on", false);
        link.attr("stroke-opacity", 0.7).attr("stroke-width", 1.4);
        flow.attr("opacity", 0.9);
        ghost.transition().duration(200).attr("opacity", 0.08);
        setStat();
      });

    node.call(
      d3
        .drag<SVGGElement, SimNode>()
        // clickDistance > 0 lets a no-drag press still emit a click (for onPick) while a real
        // drag (which moves past the threshold) suppresses the trailing click.
        .clickDistance(4)
        .on("start", (e, d) => {
          if (!e.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (_e, d) => {
          d.fx = null;
          d.fy = null;
          sim.alphaTarget(0).alpha(0.6).restart();
        }),
    );
    // Click a node (without dragging it) to ask Glyph about that file.
    node.on("click", (_e, d) => onPick?.(d));

    const reset = resetRef.current;
    const onReset = () => {
      simNodes.forEach((n) => {
        n.fx = null;
        n.fy = null;
      });
      sim.alpha(0.9).restart();
    };
    reset?.addEventListener("click", onReset);

    // ---- one paint loop drives ghosts, links, gradients, nodes, flow particles ----
    let raf = 0;
    const frame = () => {
      const c: Record<string, { x: number; y: number; n: number }> = {};
      langs.forEach((l) => (c[l] = { x: 0, y: 0, n: 0 }));
      simNodes.forEach((n) => {
        c[n.language].x += n.x;
        c[n.language].y += n.y;
        c[n.language].n++;
      });
      ghost.attr("x", (d) => c[d].x / c[d].n).attr("y", (d) => c[d].y / c[d].n);
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      lgrad
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      lgrad.select(".s0").attr("stop-color", (d) => gemStops((d as SimLink).source.language)[1]);
      lgrad.select(".s1").attr("stop-color", (d) => gemStops((d as SimLink).target.language)[1]);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      simLinks.forEach((l) => {
        l.t += 0.006;
        if (l.t > 1) l.t -= 1;
      });
      flow
        .attr("cx", (d) => d.source.x + (d.target.x - d.source.x) * d.t)
        .attr("cy", (d) => d.source.y + (d.target.y - d.source.y) * d.t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      settle.stop();
      sim.stop();
      reset?.removeEventListener("click", onReset);
    };
  }, [nodes, edges, dim.w, dim.h, langs, onPick]);
  /* v8 ignore stop */

  return (
    <div className="archpanel">
      <div className="arch-aurora">
        <div className="arch-blob b1" />
        <div className="arch-blob b2" />
        <div className="arch-blob b3" />
        <div className="arch-blob b4" />
      </div>
      <div className="arch-head">
        <div className="arch-title">
          <span className="arch-dot" /> ARCHITECTURE
        </div>
        <div className="arch-right">
          <div className="arch-legend">
            {langs.map((l) => (
              <span key={l}>
                <i style={{ background: gemStops(l)[1] }} />
                {l}
              </span>
            ))}
          </div>
          <button type="button" className="arch-reset" ref={resetRef}>
            RESET
          </button>
          {onClose && (
            <button type="button" className="iconbtn arch-close" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>
      <div className="arch-svgwrap" ref={wrapRef}>
        <svg ref={svgRef} className="arch-svg" />
      </div>
      <div className="arch-foot">
        <span>hover to trace · drag a file · it springs back to its clean home</span>
        <span className="arch-stat" ref={statRef} />
      </div>
    </div>
  );
}
