// Tests for the ingest progress checklist: the pure state/step helpers and the rendering.

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyIngestEvent,
  deriveSteps,
  embedStats,
  IngestProgress,
  initialIngestState,
  type IngestState,
} from "./IngestProgress";

describe("embedStats", () => {
  it("computes percentage, throughput, and ETA from progress", () => {
    const s = embedStats({ done: 100, total: 400 }, 2000); // 100 done in 2s → 50/s, 300 left → 6s
    expect(s.pct).toBe(25);
    expect(Math.round(s.perSec)).toBe(50);
    expect(Math.round(s.etaSec)).toBe(6);
  });

  it("has no ETA when finished, and no rate before any time passes", () => {
    expect(embedStats({ done: 10, total: 10 }, 1000).etaSec).toBe(0);
    expect(embedStats({ done: 5, total: 10 }, 0).perSec).toBe(0);
  });

  it("treats a zero-total embed as 100% (nothing left to do)", () => {
    expect(embedStats({ done: 0, total: 0 }, 1000).pct).toBe(100);
  });
});

describe("ingest state helpers", () => {
  it("starts with cloning running for a repo, idle for a local path", () => {
    expect(initialIngestState(true).clone).toBe("running");
    expect(initialIngestState(false).clone).toBe("idle");
  });

  it("folds stage events into the running state", () => {
    let s = initialIngestState(false);
    s = applyIngestEvent(s, { stage: "walk", files: 5 });
    s = applyIngestEvent(s, { stage: "chunk", chunks: 12 });
    s = applyIngestEvent(s, { stage: "embed", done: 4, total: 12 });

    expect(s.files).toBe(5);
    expect(s.chunks).toBe(12);
    expect(s.embed).toEqual({ done: 4, total: 12 });
  });

  it("marks clone running while it streams 'start' and done when it finishes", () => {
    const repo = initialIngestState(true);
    expect(applyIngestEvent(repo, { stage: "clone", status: "start" }).clone).toBe("running");
    expect(applyIngestEvent(repo, { stage: "clone", status: "done" }).clone).toBe("done");
  });

  it("leaves the checklist state untouched for terminal stages", () => {
    const s = initialIngestState(false);
    const done = applyIngestEvent(s, {
      stage: "done",
      files: 3,
      languages: ["py"],
      added: 3,
      cached: 0,
    });
    const error = applyIngestEvent(s, { stage: "error", detail: "boom" });

    // "done" / "error" hit the default arm and return the same reference.
    expect(done).toBe(s);
    expect(error).toBe(s);
  });
});

describe("deriveSteps", () => {
  it("omits the clone step for a local path", () => {
    const steps = deriveSteps(initialIngestState(false));
    expect(steps.map((s) => s.key)).toEqual(["walk", "chunk", "embed"]);
  });

  it("marks the first step without data as running and earlier ones done", () => {
    const s: IngestState = { isRepo: false, clone: "idle", files: 5 };
    const steps = deriveSteps(s);

    expect(steps.find((x) => x.key === "walk")?.state).toBe("done");
    expect(steps.find((x) => x.key === "walk")?.detail).toBe("5 files");
    expect(steps.find((x) => x.key === "chunk")?.state).toBe("running");
    expect(steps.find((x) => x.key === "embed")?.state).toBe("pending");
  });

  it("computes the embed percentage and completes it at the total", () => {
    const half = deriveSteps({
      isRepo: false,
      clone: "idle",
      files: 5,
      chunks: 10,
      embed: { done: 5, total: 10 },
    });
    const embed = half.find((x) => x.key === "embed");
    expect(embed?.pct).toBe(50);
    expect(embed?.state).toBe("running");

    const full = deriveSteps({
      isRepo: false,
      clone: "idle",
      files: 5,
      chunks: 10,
      embed: { done: 10, total: 10 },
    });
    expect(full.find((x) => x.key === "embed")?.state).toBe("done");
  });

  it("labels an all-cached embed (total zero) as done", () => {
    const steps = deriveSteps({
      isRepo: false,
      clone: "idle",
      files: 5,
      chunks: 10,
      embed: { done: 0, total: 0 },
    });
    const embed = steps.find((x) => x.key === "embed");
    expect(embed?.state).toBe("done");
    expect(embed?.detail).toBe("all cached");
  });

  it("keeps clone as the running frontier for a repo before it finishes", () => {
    const steps = deriveSteps(initialIngestState(true));
    expect(steps.map((s) => s.key)).toEqual(["clone", "walk", "chunk", "embed"]);
    expect(steps.find((x) => x.key === "clone")?.state).toBe("running");
    expect(steps.find((x) => x.key === "walk")?.state).toBe("pending");
  });

  it("completes the clone step for a repo once cloning is done", () => {
    const steps = deriveSteps({ isRepo: true, clone: "done" });
    expect(steps.find((x) => x.key === "clone")?.state).toBe("done");
    expect(steps.find((x) => x.key === "walk")?.state).toBe("running");
  });

  it("appends a cached suffix when fewer chunks were embedded than chunked", () => {
    const steps = deriveSteps({
      isRepo: false,
      clone: "idle",
      files: 5,
      chunks: 10,
      embed: { done: 3, total: 6 },
    });
    // 10 chunks but only 6 needed embedding → 4 were already cached.
    expect(steps.find((x) => x.key === "embed")?.detail).toBe("3 / 6 · 4 cached");
  });

  it("omits the cached suffix when chunk count is unknown", () => {
    const steps = deriveSteps({
      isRepo: false,
      clone: "idle",
      embed: { done: 2, total: 8 },
    });
    expect(steps.find((x) => x.key === "embed")?.detail).toBe("2 / 8");
  });
});

describe("IngestProgress component", () => {
  it("renders each step label with live detail", () => {
    render(
      <IngestProgress
        state={{ isRepo: false, clone: "idle", files: 7, chunks: 20, embed: { done: 10, total: 20 } }}
      />,
    );

    expect(screen.getByText("Scanning files")).toBeTruthy();
    expect(screen.getByText("7 files")).toBeTruthy();
    expect(screen.getByText("Embedding & indexing")).toBeTruthy();
    expect(screen.getByText("10 / 20")).toBeTruthy();
  });

  it("shows a check for done, a spinner for running, and a dot for pending steps", () => {
    const { container } = render(<IngestProgress state={{ isRepo: false, clone: "idle", files: 7 }} />);

    const rows = container.querySelectorAll(".ip-row");
    // walk is done, chunk is running, embed is pending.
    expect(rows[0].getAttribute("data-state")).toBe("done");
    expect(rows[0].querySelector(".ip-icon svg")).toBeTruthy(); // check icon
    expect(rows[1].getAttribute("data-state")).toBe("running");
    expect(rows[1].querySelector(".spinner")).toBeTruthy();
    expect(rows[2].getAttribute("data-state")).toBe("pending");
    expect(rows[2].querySelector(".ip-dot")).toBeTruthy();
  });

  it("draws the embed progress bar only once the embed step is no longer pending", () => {
    const { container, rerender } = render(
      <IngestProgress state={{ isRepo: false, clone: "idle", files: 7, chunks: 20 }} />,
    );
    // embed has no data yet → pending → no bar.
    expect(container.querySelector(".ip-bar")).toBeNull();

    rerender(
      <IngestProgress
        state={{ isRepo: false, clone: "idle", files: 7, chunks: 20, embed: { done: 5, total: 20 } }}
      />,
    );
    const fill = container.querySelector(".ip-fill") as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe("25%");
  });

  it("renders no live footer when there is no embed total to time", () => {
    const { container } = render(
      <IngestProgress state={{ isRepo: false, clone: "idle", files: 7, chunks: 20 }} />,
    );
    expect(container.querySelector(".ip-foot")).toBeNull();
  });

  describe("with a ticking clock", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("ticks elapsed time and reports throughput and ETA while embedding", () => {
      const { container } = render(
        <IngestProgress
          state={{ isRepo: false, clone: "idle", files: 7, chunks: 10, embed: { done: 2, total: 10 } }}
        />,
      );

      // Advancing the fake timers moves the mocked Date.now() too, so the 400ms interval
      // re-reads the clock and the last tick lands exactly at 2000ms elapsed.
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const foot = container.querySelector(".ip-foot");
      expect(foot).toBeTruthy();
      // 2 done in 2s → 1/s, 8 left → 8s ETA.
      expect(foot?.textContent).toContain("2.0s elapsed");
      expect(foot?.textContent).toContain("1/s");
      expect(foot?.textContent).toContain("~8s left");
    });

    it("omits rate and ETA in the footer before any time has elapsed", () => {
      const { container } = render(
        <IngestProgress
          state={{ isRepo: false, clone: "idle", files: 7, chunks: 10, embed: { done: 0, total: 10 } }}
        />,
      );

      const foot = container.querySelector(".ip-foot");
      expect(foot).toBeTruthy();
      // No elapsed time yet → perSec and etaSec are 0, so neither suffix appears.
      expect(foot?.textContent).toBe("0.0s elapsed");
    });

    it("stops the clock and clears the interval once embedding finishes", () => {
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      const { rerender } = render(
        <IngestProgress
          state={{ isRepo: false, clone: "idle", files: 7, chunks: 10, embed: { done: 2, total: 10 } }}
        />,
      );

      rerender(
        <IngestProgress
          state={{ isRepo: false, clone: "idle", files: 7, chunks: 10, embed: { done: 10, total: 10 } }}
        />,
      );

      // Re-running the effect with embedding=false tears down the interval.
      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
