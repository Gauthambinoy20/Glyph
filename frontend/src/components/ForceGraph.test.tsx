// Tests for the force-directed graph: it renders a canvas, and langColor maps languages.
// (The canvas 2d context is stubbed to null in test-setup, so the physics loop no-ops here.)

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ForceGraph, langColor } from "./ForceGraph";

describe("langColor", () => {
  it("maps known languages and falls back for unknown ones", () => {
    expect(langColor("Python")).toBe("#ffd866");
    expect(langColor("TypeScript")).toBe("#4c9eff");
    expect(langColor("brainfuck")).toBe("#9aa0aa"); // fallback grey
  });
});

describe("ForceGraph", () => {
  it("renders a canvas for the graph without crashing", () => {
    const { container } = render(
      <ForceGraph
        nodes={[
          { id: "a", label: "a.ts", language: "TypeScript" },
          { id: "b", label: "b.py", language: "Python" },
        ]}
        edges={[{ source: "a", target: "b" }]}
        width={220}
        height={160}
      />,
    );
    expect(container.querySelector("canvas")).toBeTruthy();
  });
});
