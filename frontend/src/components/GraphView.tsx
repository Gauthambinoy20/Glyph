import { useEffect, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

import { api } from "../api";
import type { GraphData } from "../api";

interface Props {
  onPickFile: (file: string) => void;
}

/** A force-directed map of the repo: files as nodes, internal imports as links. */
export function GraphView({ onPickFile }: Props) {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    api
      .graph()
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = data
    ? {
        nodes: data.nodes.map((n) => ({ id: n.id, label: n.label })),
        links: data.edges.map((e) => ({ source: e.source, target: e.target })),
      }
    : { nodes: [], links: [] };

  return (
    <div className="graph-view" ref={wrapRef}>
      {error ? (
        <div className="graph-empty">Could not load the graph: {error}</div>
      ) : !data ? (
        <div className="graph-empty">Building the dependency map…</div>
      ) : data.nodes.length === 0 ? (
        <div className="graph-empty">No files to map yet.</div>
      ) : (
        <ForceGraph2D
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          linkColor={() => "rgba(255,255,255,0.10)"}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={1.4}
          linkDirectionalParticleColor={() => "rgba(126,231,135,0.5)"}
          nodeRelSize={5}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            const radius = 4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = "#7ee787";
            ctx.fill();
            const fontSize = 11 / scale;
            ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
            ctx.fillStyle = "rgba(230,231,233,0.78)";
            ctx.textAlign = "left";
            ctx.fillText(node.label as string, node.x + radius + 2, node.y + fontSize / 3);
          }}
          onNodeClick={(node: any) => onPickFile(node.id as string)}
        />
      )}
    </div>
  );
}
