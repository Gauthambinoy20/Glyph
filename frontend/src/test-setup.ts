// Global test setup: unmount React trees between tests so queries don't see stale DOM.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom lacks these real browser APIs the graph uses. Stub them so components that touch
// canvas/ResizeObserver render in tests (the force-graph degrades gracefully when the 2d
// context is null, which is what this returns).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
