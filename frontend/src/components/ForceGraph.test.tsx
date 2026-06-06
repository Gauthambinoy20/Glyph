// Tests for the force-directed graph: it renders a canvas, langColor maps languages,
// and the physics/draw loop plus all mouse handlers run against a mocked 2d context.

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { ForceGraph, langColor } from "./ForceGraph";

// A minimal 2D context that records nothing but satisfies every call draw() makes.
function makeCtx() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
  };
}

describe("langColor", () => {
  it("maps known languages and falls back for unknown ones", () => {
    expect(langColor("Python")).toBe("#ffd866");
    expect(langColor("TypeScript")).toBe("#4c9eff");
    expect(langColor("brainfuck")).toBe("#9aa0aa"); // fallback grey
  });
});

describe("ForceGraph (degraded: null 2d context)", () => {
  // test-setup stubs getContext -> null, so the draw/step effect bails at `if (!ctx)`.
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

describe("ForceGraph (live: mocked 2d context + raf)", () => {
  // getContext is overloaded, so its spy doesn't fit the generic ReturnType<typeof vi.spyOn>;
  // the broad MockInstance type accepts it.
  let getContextSpy: MockInstance;
  let rectSpy: ReturnType<typeof vi.spyOn>;
  let ctx: ReturnType<typeof makeCtx>;
  // The most recently scheduled step() callback, so a test can drive an extra frame
  // AFTER it mutates hover/drag state (the mount frame runs automatically once).
  let lastFrame: FrameRequestCallback | null = null;

  function runFrame() {
    if (lastFrame) lastFrame(0);
  }

  beforeEach(() => {
    lastFrame = null;
    // jsdom defaults devicePixelRatio to 1 (truthy); force a falsy value so the
    // `window.devicePixelRatio || 1` fallback branch is exercised here.
    vi.stubGlobal("devicePixelRatio", 0);
    ctx = makeCtx();
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

    // The canvas sits at (0,0) so client coords map straight onto sim coords.
    rectSpy = vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      width: 300,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // Run exactly one frame on mount: invoke the callback synchronously once, then
    // only store later callbacks so the self-rescheduling step() loop terminates.
    // Stored callbacks can be replayed via runFrame() after changing state.
    let frames = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        lastFrame = cb;
        if (frames === 0) {
          frames += 1;
          cb(0);
        }
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    rectSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Helper: a node parked exactly at the canvas centre so a fixed click point hits it.
  // With one node and width/height given, the build effect places it on a ring; we
  // instead use a single node, then move the mouse onto its actual drawn position by
  // querying the canvas rect-relative coords. Simpler: use coords near the centre and
  // a node count/layout that lands a node there is fragile — so we test hit-testing by
  // placing the cursor at the node's computed start position.

  function renderGraph(props?: {
    onPick?: (n: { id: string }) => void;
    big?: boolean;
    nodes?: { id: string; label: string; language: string }[];
    edges?: { source: string; target: string }[];
  }) {
    const nodes = props?.nodes ?? [
      { id: "a", label: "a.ts", language: "TypeScript" },
      { id: "b", label: "b.py", language: "Python" },
    ];
    const edges = props?.edges ?? [{ source: "a", target: "b" }];
    const utils = render(
      <ForceGraph
        nodes={nodes}
        edges={edges}
        width={300}
        height={200}
        onPick={props?.onPick}
        big={props?.big}
      />,
    );
    return utils.container.querySelector("canvas") as HTMLCanvasElement;
  }

  it("runs one physics frame and draws to the mocked context", () => {
    renderGraph();
    expect(getContextSpy).toHaveBeenCalledWith("2d");
    expect(ctx.setTransform).toHaveBeenCalled();
    // step() -> draw() executed: edges + nodes were stroked/filled.
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
  });

  it("labels hub nodes (and uses bigger physics) when big is set", () => {
    // A hub depended on by two files has a big enough radius to be labelled in the big view;
    // the two leaf nodes stay below the threshold, covering both sides of the label branch.
    const nodes = [
      { id: "hub", label: "hub.ts", language: "TypeScript" },
      { id: "a", label: "a.ts", language: "TypeScript" },
      { id: "b", label: "b.ts", language: "TypeScript" },
    ];
    const edges = [
      { source: "a", target: "hub" },
      { source: "b", target: "hub" },
    ];
    renderGraph({ big: true, nodes, edges });
    expect(ctx.fillText).toHaveBeenCalled(); // the hub (indeg 2) is labelled
  });

  it("skips edges whose endpoints are missing", () => {
    // An edge points at a node id that does not exist -> draw() and step() both
    // hit the `if (!a || !b) return` guard.
    const nodes = [{ id: "a", label: "a.ts", language: "TypeScript" }];
    const edges = [{ source: "a", target: "ghost" }];
    expect(() => renderGraph({ nodes, edges })).not.toThrow();
  });

  it("hovers a node: lights edges, draws hover ring + label, sets pointer cursor", () => {
    const canvas = renderGraph();
    const { x, y } = nodePos(canvas, 0);
    fireEvent.mouseMove(canvas, { clientX: x, clientY: y });
    expect(canvas.style.cursor).toBe("pointer");
    // Drive one more frame now that hoverRef is set: draw() takes the hover branches
    // (lit edge via e.source === hover + hover ring + label) for the hovered node.
    ctx.fillText.mockClear();
    runFrame();
    expect(ctx.fillText).toHaveBeenCalled(); // hovered node draws its label
  });

  it("lights an edge via its target endpoint when the target node is hovered", () => {
    const canvas = renderGraph();
    // Node index 1 is "b", which is the TARGET of edge a->b. Hovering it exercises the
    // `e.target === hoverRef.current` side of the edge-lighting test.
    const { x, y } = nodePos(canvas, 1);
    fireEvent.mouseMove(canvas, { clientX: x, clientY: y });
    expect(canvas.style.cursor).toBe("pointer");
    runFrame();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("survives two nodes pinned to identical coordinates (zero-distance guards)", () => {
    // Drag both nodes onto the exact same point so the repulsion loop sees d2 === 0
    // (the `|| 0.01` guard) and the spring loop sees d === 0 (its own `|| 0.01`).
    const canvas = renderGraph();
    const P = { x: 150, y: 100 };
    // Drag node a to P.
    const a = nodePos(canvas, 0);
    fireEvent.mouseDown(canvas, { clientX: a.x, clientY: a.y });
    fireEvent.mouseMove(canvas, { clientX: P.x, clientY: P.y });
    fireEvent.mouseUp(canvas);
    // Drag node b to the same P (no frame in between, so positions are untouched).
    const b = nodePos(canvas, 1);
    fireEvent.mouseDown(canvas, { clientX: b.x, clientY: b.y });
    fireEvent.mouseMove(canvas, { clientX: P.x, clientY: P.y });
    fireEvent.mouseUp(canvas);
    // Now both nodes are at P; one frame triggers the zero-distance fallbacks.
    expect(() => runFrame()).not.toThrow();
  });

  it("moving the mouse back onto the same node does not rewrite hover state", () => {
    const canvas = renderGraph();
    const { x, y } = nodePos(canvas, 0);
    fireEvent.mouseMove(canvas, { clientX: x, clientY: y });
    // Same node again: id === hoverRef.current, so the `if (id !== hoverRef.current)`
    // guard is skipped on this second move.
    fireEvent.mouseMove(canvas, { clientX: x, clientY: y });
    expect(canvas.style.cursor).toBe("pointer");
  });

  it("shows grab cursor when moving over empty space", () => {
    const canvas = renderGraph();
    // Far corner: no node there.
    fireEvent.mouseMove(canvas, { clientX: 1, clientY: 1 });
    expect(canvas.style.cursor).toBe("grab");
  });

  it("clicking a node without dragging calls onPick", () => {
    const onPick = vi.fn();
    const canvas = renderGraph({ onPick });
    const { x, y } = nodePos(canvas, 0);
    fireEvent.mouseDown(canvas, { clientX: x, clientY: y });
    fireEvent.mouseUp(canvas);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("clicking a node with no onPick handler does not throw", () => {
    const canvas = renderGraph(); // onPick undefined
    const { x, y } = nodePos(canvas, 0);
    fireEvent.mouseDown(canvas, { clientX: x, clientY: y });
    expect(() => fireEvent.mouseUp(canvas)).not.toThrow();
  });

  it("dragging a node moves it and does NOT call onPick", () => {
    const onPick = vi.fn();
    const canvas = renderGraph({ onPick });
    const { x, y } = nodePos(canvas, 0);
    fireEvent.mouseDown(canvas, { clientX: x, clientY: y });
    // Move while dragging: marks moved=true and repositions the node.
    fireEvent.mouseMove(canvas, { clientX: x + 30, clientY: y + 30 });
    // Drive a frame while the dragged node is fixed: step() zeroes its velocity and
    // skips integration (the `if (n.fixed)` branch).
    runFrame();
    fireEvent.mouseUp(canvas);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("mouseup with no active drag is a no-op", () => {
    const onPick = vi.fn();
    const canvas = renderGraph({ onPick });
    fireEvent.mouseUp(canvas); // never pressed on a node
    expect(onPick).not.toHaveBeenCalled();
  });

  it("mousedown on empty space starts no drag", () => {
    const onPick = vi.fn();
    const canvas = renderGraph({ onPick });
    fireEvent.mouseDown(canvas, { clientX: 1, clientY: 1 });
    fireEvent.mouseUp(canvas);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("mouseleave clears hover and an in-progress drag", () => {
    const onPick = vi.fn();
    const canvas = renderGraph({ onPick });
    const { x, y } = nodePos(canvas, 0);
    // Start a drag, then leave the canvas: drag is dropped, node unfixed, no pick.
    fireEvent.mouseDown(canvas, { clientX: x, clientY: y });
    fireEvent.mouseLeave(canvas);
    fireEvent.mouseUp(canvas);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("mouseleave with no drag still clears hover", () => {
    const canvas = renderGraph();
    const { x, y } = nodePos(canvas, 0);
    fireEvent.mouseMove(canvas, { clientX: x, clientY: y }); // set hover
    expect(() => fireEvent.mouseLeave(canvas)).not.toThrow();
  });
});

// Compute a node's initial canvas position the same way the build effect does, so we
// can aim the mouse precisely at it. width=300 height=200 -> cx=150 cy=100,
// rad=min(300,200)*0.3=60. Node i: x=cx+cos(a)*rad+(i%5)-2, y=cy+sin(a)*rad+(i%3)-1,
// a=(i/count)*2PI. We default to 2 nodes.
function nodePos(_canvas: HTMLCanvasElement, i: number, count = 2) {
  const cx = 150;
  const cy = 100;
  const rad = Math.min(300, 200) * 0.3;
  const a = (i / count) * Math.PI * 2;
  return {
    x: cx + Math.cos(a) * rad + (i % 5) - 2,
    y: cy + Math.sin(a) * rad + (i % 3) - 1,
  };
}
