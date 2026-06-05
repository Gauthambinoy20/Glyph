// Live ingest progress — a checklist that fills in as the backend streams stage events.
// The pure helpers (initialIngestState / applyIngestEvent / deriveSteps) carry all the
// logic so they can be unit tested without rendering, leaving the component presentational.

import { useEffect, useRef, useState } from "react";

import type { IngestEvent } from "../api";
import { Icon } from "./Icon";

/** Accumulated view of how far ingest has got, built up from the streamed stage events. */
export interface IngestState {
  isRepo: boolean; // a GitHub URL adds a leading "clone" step that a local path skips
  clone: "idle" | "running" | "done";
  files?: number; // from the walk stage
  chunks?: number; // from the chunk stage
  embed?: { done: number; total: number }; // running counts from the embed stage
}

/** Fresh state at the moment ingest starts (cloning is only relevant for a repo URL). */
export function initialIngestState(isRepo: boolean): IngestState {
  return { isRepo, clone: isRepo ? "running" : "idle" };
}

/** Fold one streamed stage event into the running state. */
export function applyIngestEvent(state: IngestState, event: IngestEvent): IngestState {
  switch (event.stage) {
    case "clone":
      return { ...state, clone: event.status === "done" ? "done" : "running" };
    case "walk":
      return { ...state, files: event.files };
    case "chunk":
      return { ...state, chunks: event.chunks };
    case "embed":
      return { ...state, embed: { done: event.done, total: event.total } };
    default:
      return state; // "done" / "error" are handled by the caller, not the checklist
  }
}

export interface Step {
  key: string;
  label: string;
  detail?: string;
  state: "pending" | "running" | "done";
  pct?: number; // embed only: percentage for the progress bar
}

const LABELS: Record<string, string> = {
  clone: "Cloning repository",
  walk: "Scanning files",
  chunk: "Chunking code",
  embed: "Embedding & indexing",
};

/**
 * Turn the accumulated state into an ordered checklist. A step is "done" once its data has
 * arrived, "running" if it is the first step still missing data, and "pending" after that.
 */
export function deriveSteps(s: IngestState): Step[] {
  const embedDone = s.embed != null && s.embed.done >= s.embed.total;
  const completed: Record<string, boolean> = {
    clone: !s.isRepo || s.clone === "done",
    walk: s.files != null,
    chunk: s.chunks != null,
    embed: embedDone,
  };
  const order = s.isRepo ? ["clone", "walk", "chunk", "embed"] : ["walk", "chunk", "embed"];
  const frontier = order.find((key) => !completed[key]);

  return order.map((key) => {
    const state: Step["state"] = completed[key] ? "done" : key === frontier ? "running" : "pending";
    let detail: string | undefined;
    let pct: number | undefined;
    if (key === "walk" && s.files != null) detail = `${s.files} files`;
    if (key === "chunk" && s.chunks != null) detail = `${s.chunks} chunks`;
    if (key === "embed" && s.embed) {
      const cached = s.chunks != null ? Math.max(0, s.chunks - s.embed.total) : 0;
      detail = s.embed.total
        ? `${s.embed.done} / ${s.embed.total}${cached ? ` · ${cached} cached` : ""}`
        : "all cached";
      pct = s.embed.total ? Math.round((s.embed.done / s.embed.total) * 100) : 100;
    }
    return { key, label: LABELS[key], detail, state, pct };
  });
}

/** Live embed throughput + ETA from progress so far. Pure, so it is unit tested. */
export function embedStats(embed: { done: number; total: number }, elapsedMs: number) {
  const pct = embed.total ? Math.round((embed.done / embed.total) * 100) : 100;
  const perSec = elapsedMs > 0 ? embed.done / (elapsedMs / 1000) : 0;
  const remaining = Math.max(0, embed.total - embed.done);
  const etaSec = perSec > 0 && remaining > 0 ? remaining / perSec : 0;
  return { pct, perSec, etaSec };
}

export function IngestProgress({ state }: { state: IngestState }) {
  const steps = deriveSteps(state);
  const startRef = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  const embedding = state.embed != null && state.embed.done < state.embed.total;

  // Tick a clock while embedding so elapsed/throughput/ETA stay live.
  useEffect(() => {
    if (!embedding) return;
    const id = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(id);
  }, [embedding]);

  const elapsedMs = now - startRef.current;
  const stats = state.embed && state.embed.total > 0 ? embedStats(state.embed, elapsedMs) : null;

  return (
    <div className="ingest-progress" role="status" aria-live="polite">
      {steps.map((step) => (
        <div key={step.key} className="ip-row" data-state={step.state}>
          <span className="ip-icon">
            {step.state === "done" ? (
              <Icon name="check" size={14} />
            ) : step.state === "running" ? (
              <span className="spinner" />
            ) : (
              <span className="ip-dot" />
            )}
          </span>
          <span className="ip-label">{step.label}</span>
          {step.detail && <span className="ip-detail mono">{step.detail}</span>}
          {step.key === "embed" && step.pct != null && step.state !== "pending" && (
            <span className="ip-bar">
              <span className="ip-fill" style={{ width: `${step.pct}%` }} />
            </span>
          )}
        </div>
      ))}
      {stats && (
        <div className="ip-foot mono">
          {(elapsedMs / 1000).toFixed(1)}s elapsed
          {stats.perSec > 0 && ` · ${Math.round(stats.perSec)}/s`}
          {stats.etaSec > 0 && ` · ~${Math.ceil(stats.etaSec)}s left`}
        </div>
      )}
    </div>
  );
}
