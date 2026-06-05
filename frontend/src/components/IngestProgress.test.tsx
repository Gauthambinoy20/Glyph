// Tests for the ingest progress checklist: the pure state/step helpers and the rendering.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
