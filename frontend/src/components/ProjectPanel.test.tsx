// Tests for the project panel: the top-files in-degree calc and the rendered widgets.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GraphData } from "../api";
import { ProjectPanel, computeTopFiles } from "./ProjectPanel";
import type { PanelData, PanelSession } from "./ProjectPanel";

const graph: GraphData = {
  nodes: [
    { id: "a", label: "a.ts", language: "TypeScript" },
    { id: "b", label: "b.ts", language: "TypeScript" },
    { id: "types", label: "types.ts", language: "TypeScript" },
  ],
  edges: [
    { source: "a", target: "types" },
    { source: "b", target: "types" },
    { source: "a", target: "b" },
  ],
};

describe("computeTopFiles", () => {
  it("ranks files by import in-degree, most depended-on first", () => {
    const top = computeTopFiles(graph);
    expect(top[0].label).toBe("types.ts"); // imported by a and b → in-degree 2
    expect(top[0].count).toBe(2);
    expect(top[1].label).toBe("b.ts"); // imported by a → 1
    expect(top.every((f) => f.count > 0)).toBe(true); // files with no importers are dropped
  });
});

const data: PanelData = {
  repo: {
    owner: "glyph-dev",
    name: "glyph",
    branch: "main",
    url: "https://github.com/glyph-dev/glyph",
    visibility: "Public",
  },
  languages: [
    { name: "TypeScript", pct: 60, color: "#4c9eff" },
    { name: "Python", pct: 40, color: "#ffd866" },
  ],
  stats: { files: 12, chunks: 340, cached: 200 },
  overview: "**Glyph** indexes code.",
  stack: ["TypeScript", "Python"],
  graph,
  endpoints: [{ method: "POST", path: "/api/ingest" }],
  recent: [],
  latencies: [],
};
const session: PanelSession = { queries: 0, avgLatency: 0, tokens: 0 };

describe("ProjectPanel", () => {
  it("renders the repo header, language legend, stats and endpoints", () => {
    render(
      <ProjectPanel
        data={data}
        session={session}
        onAsk={() => {}}
        onExpandGraph={() => {}}
        onChangeRepo={() => {}}
        onOpenRecent={() => {}}
      />,
    );

    expect(screen.getByText("github.com/glyph-dev/glyph")).toBeTruthy(); // repo link host
    expect(screen.getAllByText(/typescript/i).length).toBeGreaterThan(0); // language legend + stack
    expect(screen.getByText("340")).toBeTruthy(); // chunk count tile
    expect(screen.getByText("/api/ingest")).toBeTruthy(); // endpoint row
  });
});
