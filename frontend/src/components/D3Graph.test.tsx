// Tests for the expanded D3 architecture panel. The d3 force build + raf paint loop is excluded
// from coverage (timing/layout bound, same convention as ForceGraph), so these cover the pure
// surface: the gem-gradient palette, the rendered chrome (title, legend, reset, footer, svg) and
// the close button. requestAnimationFrame is stubbed to a no-op so the runtime effect can't spin.

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GraphNode } from "../api";
import { D3Graph } from "./D3Graph";

const NODES: GraphNode[] = [
  { id: "a", label: "a.ts", language: "typescript" },
  { id: "b", label: "b.py", language: "python" },
  { id: "c", label: "c.tsx", language: "tsx" },
];
const EDGES = [
  { source: "a", target: "b" },
  { source: "c", target: "a" },
];

describe("D3Graph", () => {
  beforeEach(() => {
    // Keep d3-timer + the paint loop from scheduling real frames during the test.
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the panel, an svg, and the footer hint", () => {
    const { container, getByText } = render(<D3Graph nodes={NODES} edges={EDGES} />);
    expect(container.querySelector(".archpanel")).toBeTruthy();
    expect(container.querySelector("svg.arch-svg")).toBeTruthy();
    expect(getByText(/springs back to its clean home/)).toBeTruthy();
  });

  it("renders one legend chip per distinct language", () => {
    const { container } = render(<D3Graph nodes={NODES} edges={EDGES} />);
    const chips = container.querySelectorAll(".arch-legend span");
    expect(chips.length).toBe(3); // typescript, python, tsx
    expect([...chips].map((c) => c.textContent)).toEqual(["typescript", "python", "tsx"]);
  });

  it("shows a close button only when onClose is given, and calls it on click", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(<D3Graph nodes={NODES} edges={EDGES} onClose={onClose} />);
    fireEvent.click(getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits the close button when onClose is not provided", () => {
    const { queryByLabelText } = render(<D3Graph nodes={NODES} edges={EDGES} />);
    expect(queryByLabelText("Close")).toBeNull();
  });

  it("always renders a RESET control", () => {
    const { getByText } = render(<D3Graph nodes={NODES} edges={EDGES} />);
    expect(getByText("RESET")).toBeTruthy();
  });

  it("renders without crashing when there are no nodes", () => {
    const { container } = render(<D3Graph nodes={[]} edges={[]} />);
    expect(container.querySelector(".archpanel")).toBeTruthy();
    expect(container.querySelectorAll(".arch-legend span").length).toBe(0);
  });
});
