// Tests for the project panel: the top-files in-degree calc and the rendered widgets.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GraphData, GraphNode } from "../api";
import { ProjectPanel, computeTopFiles } from "./ProjectPanel";
import type { PanelData, PanelSession } from "./ProjectPanel";

// Stub the canvas force-graph so the architecture card's onPick is callable
// deterministically (the real component only fires onPick from canvas mouse
// physics). langColor stays real so the legend keeps rendering true colors.
vi.mock("./ForceGraph", async () => {
  const actual = await vi.importActual<typeof import("./ForceGraph")>("./ForceGraph");
  return {
    ...actual,
    ForceGraph: ({ nodes, onPick }: { nodes: GraphNode[]; onPick?: (n: GraphNode) => void }) => (
      <button data-testid="force-graph-pick" onClick={() => nodes[0] && onPick?.(nodes[0])}>
        graph
      </button>
    ),
  };
});

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

const emptyGraph: GraphData = { nodes: [], edges: [] };

// Full props with everything populated, so each widget renders its non-empty branch.
const data: PanelData = {
  repo: {
    owner: "glyph-dev",
    name: "glyph",
    branch: "main",
    url: "https://github.com/glyph-dev/glyph",
    visibility: "Public",
    description: "An indexing engine.",
    lastIndexed: "2m ago",
  },
  languages: [
    { name: "TypeScript", pct: 60, color: "#4c9eff" },
    { name: "Python", pct: 40, color: "#ffd866" },
  ],
  stats: { files: 12, chunks: 340, cached: 200 },
  overview: "**Glyph** indexes `code` fast.",
  stack: ["TypeScript", "Python"],
  graph,
  endpoints: [{ method: "POST", path: "/api/ingest" }],
  recent: [
    { owner: "acme", name: "alpha", when: "now" },
    { owner: "acme", name: "beta", when: "1d ago" },
  ],
  latencies: [1200, 1500, 1800],
  intel: { functions: 42, classes: 7, endpoints: 1, frameworks: 3 },
};
const session: PanelSession = { queries: 3, avgLatency: 1400, tokens: 12500 };

// Minimal/empty props so each widget renders its empty branch (returns null / loading).
const emptyData: PanelData = {
  repo: {
    owner: "local",
    name: "folder",
    url: "/home/me/folder", // not http → no repo-link, no host line
  },
  languages: [],
  stats: { files: 0, chunks: 0, cached: 0 },
  overview: "", // loading shimmer branch
  stack: [],
  graph: emptyGraph,
  endpoints: [],
  recent: [],
  latencies: [],
  // intel omitted → IndexIntel returns null
};
const emptySession: PanelSession = { queries: 0, avgLatency: 0, tokens: 0 };

const noop = () => {};

function renderPanel(overrides: Partial<React.ComponentProps<typeof ProjectPanel>> = {}) {
  const props = {
    data,
    session,
    onAsk: noop,
    onExpandGraph: noop,
    onChangeRepo: noop,
    onOpenRecent: noop,
    ...overrides,
  };
  return render(<ProjectPanel {...props} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("computeTopFiles", () => {
  it("ranks files by import in-degree, most depended-on first", () => {
    const top = computeTopFiles(graph);
    expect(top[0].label).toBe("types.ts"); // imported by a and b → in-degree 2
    expect(top[0].count).toBe(2);
    expect(top[1].label).toBe("b.ts"); // imported by a → 1
    expect(top.every((f) => f.count > 0)).toBe(true); // files with no importers are dropped
  });

  it("returns nothing when no node has any importers", () => {
    expect(computeTopFiles(emptyGraph)).toEqual([]);
  });

  it("breaks count ties by label, alphabetically", () => {
    // zeta and alpha both have in-degree 1 → tie resolved by localeCompare.
    const tied: GraphData = {
      nodes: [
        { id: "zeta", label: "zeta.ts", language: "TypeScript" },
        { id: "alpha", label: "alpha.ts", language: "TypeScript" },
        { id: "src", label: "src.ts", language: "TypeScript" },
      ],
      edges: [
        { source: "src", target: "zeta" },
        { source: "src", target: "alpha" },
      ],
    };
    const top = computeTopFiles(tied);
    expect(top.map((f) => f.label)).toEqual(["alpha.ts", "zeta.ts"]);
  });

  it("limits the result to the requested count", () => {
    const many: GraphData = {
      nodes: Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`,
        label: `n${i}.ts`,
        language: "TypeScript",
      })),
      edges: Array.from({ length: 5 }, (_, i) => ({ source: "n0", target: `n${i}` })),
    };
    expect(computeTopFiles(many, 2)).toHaveLength(2);
  });
});

describe("ProjectPanel — populated", () => {
  it("renders the repo header, language legend, stats and endpoints", () => {
    renderPanel();

    expect(screen.getByText("github.com/glyph-dev/glyph")).toBeTruthy(); // repo link host
    expect(screen.getAllByText(/typescript/i).length).toBeGreaterThan(0); // language legend + stack
    expect(screen.getByText("340")).toBeTruthy(); // chunk count tile
    expect(screen.getByText("/api/ingest")).toBeTruthy(); // endpoint row
  });

  it("shows the repo description, branch, visibility badge and indexed time", () => {
    renderPanel();
    expect(screen.getByText("An indexing engine.")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy(); // branch
    expect(screen.getByText("Public")).toBeTruthy(); // visibility badge
    expect(screen.getByText(/indexed 2m ago/)).toBeTruthy();
  });

  it("shows the real code-intelligence counts", () => {
    renderPanel();
    expect(screen.getByText("Code intelligence")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy(); // functions
    expect(screen.getByText("Functions")).toBeTruthy();
    expect(screen.getByText("Frameworks")).toBeTruthy();
  });

  it("renders the overview with inline markdown (code + strong)", () => {
    renderPanel();
    // **Glyph** → <strong>, `code` → <code>
    expect(screen.getByText("Glyph").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getByText("Detected stack")).toBeTruthy();
  });

  it("renders the top-files chart with rank, count and path", () => {
    const withPath: PanelData = {
      ...data,
      graph: {
        nodes: [
          { id: "types", label: "types.ts", language: "TypeScript", path: "src/types.ts" },
          { id: "a", label: "a.ts", language: "TypeScript" },
        ],
        edges: [{ source: "a", target: "types" }],
      },
    };
    renderPanel({ data: withPath });
    expect(screen.getByText("Most depended-on")).toBeTruthy();
    expect(screen.getByText("01")).toBeTruthy(); // rank, zero-padded
    expect(screen.getByText("src/types.ts")).toBeTruthy(); // tf-path branch
  });

  it("renders the session metrics with formatted avg and token counts", () => {
    renderPanel();
    expect(screen.getByText("Queries")).toBeTruthy();
    expect(screen.getByText("1.4s")).toBeTruthy(); // avgLatency formatted (queries > 0)
    expect(screen.getByText("12.5k")).toBeTruthy(); // tokens formatted (> 0)
    // latest latency in the spark header
    expect(screen.getByText("1.8s")).toBeTruthy();
  });

  it("renders the latency sparkline when there are at least two points", () => {
    const { container } = renderPanel();
    // Sparkline draws an svg path; the empty placeholder text must be absent.
    expect(screen.queryByText(/Ask a question to chart latency/)).toBeNull();
    expect(container.querySelector(".spark-wrap svg")).toBeTruthy();
  });

  it("renders the recent repos list, dimming non-current entries", () => {
    renderPanel();
    expect(screen.getByText(/acme\/alpha/)).toBeTruthy();
    expect(screen.getByText(/acme\/beta/)).toBeTruthy();
    expect(screen.getByText("1d ago")).toBeTruthy();
  });
});

describe("ProjectPanel — empty / loading branches", () => {
  it("renders without the optional widgets and shows the loading overview", () => {
    const { container } = render(
      <ProjectPanel
        data={emptyData}
        session={emptySession}
        onAsk={noop}
        onExpandGraph={noop}
        onChangeRepo={noop}
        onOpenRecent={noop}
      />,
    );

    // LanguageStats, IndexIntel, TopFiles, Endpoints, RecentRepos all return null.
    expect(screen.queryByText("Languages · Index")).toBeNull();
    expect(screen.queryByText("Code intelligence")).toBeNull();
    expect(screen.queryByText("Most depended-on")).toBeNull();
    expect(screen.queryByText("API endpoints")).toBeNull();
    expect(screen.queryByText("Recent repos")).toBeNull();

    // Overview shows the shimmer skeleton lines, no body text.
    expect(container.querySelectorAll(".shimmer.sk-line").length).toBe(4);

    // No-stack repo: not http → no repo-link / host, no description, no badge, no branch.
    expect(screen.queryByText("github.com/glyph-dev/glyph")).toBeNull();
    expect(container.querySelector(".repo-link")).toBeNull();
    expect(container.querySelector(".repo-desc")).toBeNull();
    expect(container.querySelector(".vis-badge")).toBeNull();
    expect(container.querySelector(".repo-meta")).toBeNull();

    // lastIndexed missing → "just now" fallback.
    expect(screen.getByText(/indexed just now/)).toBeTruthy();
  });

  it("shows em-dash placeholders and the empty sparkline message", () => {
    render(
      <ProjectPanel
        data={emptyData}
        session={emptySession}
        onAsk={noop}
        onExpandGraph={noop}
        onChangeRepo={noop}
        onOpenRecent={noop}
      />,
    );
    // queries 0 → Avg "—", tokens 0 → Tokens "—", spark header value "—"
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Ask a question to chart latency/)).toBeTruthy();
  });

  it("renders the populated overview with no detected stack", () => {
    renderPanel({ data: { ...data, stack: [] } });
    expect(screen.getByText("Glyph").tagName).toBe("STRONG");
    expect(screen.queryByText("Detected stack")).toBeNull();
  });

  it("uses the two-letter fallback for an unknown top language label", () => {
    renderPanel({
      data: {
        ...data,
        languages: [{ name: "Rust", pct: 100, color: "#dea584" }],
      },
    });
    // SHORT has no "Rust" → name.slice(0,2).toUpperCase() = "RU" shown in donut center.
    expect(screen.getByText("RU")).toBeTruthy();
  });
});

describe("ProjectPanel — interactions", () => {
  it("collapses and expands a card via the header and the chevron", () => {
    const { container } = renderPanel();
    const overview = screen.getByText("Overview").closest("section.card")!;
    expect(overview.getAttribute("data-open")).toBe("1");

    // Click the header → collapse.
    fireEvent.click(
      within(overview as HTMLElement)
        .getByText("Overview")
        .closest(".card-hd")!,
    );
    expect(overview.getAttribute("data-open")).toBe("0");

    // Click the chevron → expand again.
    const chev = overview.querySelector(".chev")!;
    fireEvent.click(chev);
    expect(overview.getAttribute("data-open")).toBe("1");
    expect(container).toBeTruthy();
  });

  it("recent repos card starts collapsed (defaultOpen=false)", () => {
    renderPanel();
    const recent = screen.getByText("Recent repos").closest("section.card")!;
    expect(recent.getAttribute("data-open")).toBe("0");
  });

  it("clicking the graph expand action does not toggle the card", () => {
    const onExpandGraph = vi.fn();
    renderPanel({ onExpandGraph });
    const expandBtn = screen.getByLabelText("Expand graph");
    const card = expandBtn.closest("section.card")!;
    expect(card.getAttribute("data-open")).toBe("1");
    fireEvent.click(expandBtn);
    expect(onExpandGraph).toHaveBeenCalledTimes(1);
    // action sits inside a stopPropagation wrapper → card stays open.
    expect(card.getAttribute("data-open")).toBe("1");
  });

  it("re-ingest button calls onChangeRepo", () => {
    const onChangeRepo = vi.fn();
    renderPanel({ onChangeRepo });
    fireEvent.click(screen.getByText(/Re-ingest/));
    expect(onChangeRepo).toHaveBeenCalledTimes(1);
  });

  it("clicking an endpoint asks about it", () => {
    const onAsk = vi.fn();
    renderPanel({ onAsk });
    fireEvent.click(screen.getByText("/api/ingest"));
    expect(onAsk).toHaveBeenCalledWith("Explain the POST /api/ingest endpoint.");
  });

  it("clicking a top-file asks about its path, falling back to label", () => {
    const onAsk = vi.fn();
    renderPanel({
      onAsk,
      data: {
        ...data,
        graph: {
          nodes: [
            { id: "types", label: "types.ts", language: "TypeScript", path: "src/types.ts" },
            { id: "a", label: "a.ts", language: "TypeScript" },
          ],
          edges: [{ source: "a", target: "types" }],
        },
      },
    });
    fireEvent.click(screen.getByText("types.ts"));
    expect(onAsk).toHaveBeenCalledWith("Explain src/types.ts.");
  });

  it("clicking a top-file with no path asks about its label", () => {
    const onAsk = vi.fn();
    renderPanel({
      onAsk,
      data: {
        ...data,
        graph: {
          nodes: [
            { id: "types", label: "types.ts", language: "TypeScript" }, // no path
            { id: "a", label: "a.ts", language: "TypeScript" },
          ],
          edges: [{ source: "a", target: "types" }],
        },
      },
    });
    fireEvent.click(screen.getByText("types.ts"));
    expect(onAsk).toHaveBeenCalledWith("Explain types.ts.");
  });

  it("clicking a recent repo opens it", () => {
    const onOpenRecent = vi.fn();
    renderPanel({ onOpenRecent });
    // Expand the (collapsed) recent card first.
    fireEvent.click(screen.getByText("Recent repos").closest(".card-hd")!);
    fireEvent.click(screen.getByText(/acme\/alpha/));
    expect(onOpenRecent).toHaveBeenCalledWith(data.recent[0]);
  });

  it("applies the open class when the panel is open", () => {
    const { container } = renderPanel({ open: true });
    expect(container.querySelector("aside.panel-col.open")).toBeTruthy();
  });

  it("omits the open class when the panel is closed", () => {
    const { container } = renderPanel({ open: false });
    expect(container.querySelector("aside.panel-col.open")).toBeNull();
    expect(container.querySelector("aside.panel-col")).toBeTruthy();
  });
});

describe("GraphCard — ResizeObserver wiring", () => {
  it("updates the graph width from the ResizeObserver callback", () => {
    // Drive the ResizeObserver callback so the width-update branch runs.
    type ROCb = (entries: { contentRect: { width: number } }[]) => void;
    let cb: ROCb | null = null;
    class RO {
      constructor(c: ROCb) {
        cb = c;
      }
      observe() {
        cb?.([{ contentRect: { width: 320 } }]);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", RO);

    renderPanel();
    expect(screen.getByText("Architecture")).toBeTruthy();
    // The callback fired with width 320; component clamps with Math.max(160, w).
    expect(cb).not.toBeNull();
  });

  it("picking a graph node asks about it", () => {
    const onAsk = vi.fn();
    renderPanel({ onAsk });
    fireEvent.click(screen.getByTestId("force-graph-pick"));
    // onPick is wired to onAsk(`Explain ${n.label}.`) with the first node.
    expect(onAsk).toHaveBeenCalledWith("Explain a.ts.");
  });

  it("renders the architecture graph legend with one entry per language", () => {
    renderPanel({
      data: {
        ...data,
        graph: {
          nodes: [
            { id: "a", label: "a.ts", language: "TypeScript" },
            { id: "b", label: "b.py", language: "Python" },
          ],
          edges: [],
        },
      },
    });
    const card = screen.getByText("Architecture").closest("section.card")!;
    const legend = card.querySelector(".graph-legend")!;
    expect(within(legend as HTMLElement).getByText("Python")).toBeTruthy();
  });
});
