// Landing screen — the pre-repo hero and ingest box. Presentational: it collects the
// repo URL or path and hands it to onIngest; App owns the async ingest + busy/error state.

import { useRef, useState } from "react";

import type { Recent } from "../types";
import { Icon, LogoMark } from "./Icon";
import { IngestProgress, type IngestState } from "./IngestProgress";

interface Props {
  onIngest: (value: string) => void;
  busy: boolean;
  recent?: Recent[];
  progress?: IngestState | null;
  mode: "fast" | "careful";
  onMode: (mode: "fast" | "careful") => void;
}

export function Landing({ onIngest, busy, recent, progress, mode, onMode }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (busy) return;
    onIngest(value.trim() || "app");
  }

  return (
    <div className="landing">
      <div className="landing-grid" />
      <div className="landing-aurora" />
      <div className="landing-glow" />

      <a
        className="repo-link-top"
        href="https://github.com/Gauthambinoy20/Glyph"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="github" size={15} /> Clone the repo
      </a>

      <div className="hero" data-variant="editorial">
        <div className="brand-hero">
          <LogoMark large />
          <span className="brand-word">Glyph</span>
        </div>

        <span className="badge">
          <span className="badge-dot" /> Code intelligence
        </span>

        <h1 className="h1">
          Ask your <span className="accent">codebase</span>
        </h1>

        <p className="subtitle">
          Point Glyph at a GitHub repo or a local folder, then ask questions and get answers grounded in the
          real code — with file and line citations.
        </p>

        <form className="ingest" onSubmit={submit}>
          <span className="lead">
            <Icon name="github" />
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://github.com/owner/repo  ·  or a local path"
            spellCheck="false"
            aria-label="Repository URL or local path"
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> Ingesting
              </>
            ) : (
              <>
                Ingest <Icon name="arrowRight" size={16} />
              </>
            )}
          </button>
        </form>

        {!progress && (
          <div className="mode-pick" role="group" aria-label="Indexing mode">
            <span className="ld-label">Indexing</span>
            {(["fast", "careful"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className="rr mode-btn"
                onClick={() => onMode(m)}
                aria-pressed={mode === m}
                aria-label={m === "fast" ? "Fast indexing" : "Careful indexing"}
                title={
                  m === "fast"
                    ? "Fast — files the repo almost instantly (Model2Vec static embeddings). Best for large repos or a quick look."
                    : "Careful — slightly slower to file, a touch more precise (transformer embeddings)."
                }
              >
                <span className="mono">{m === "fast" ? "⚡ Fast" : "◎ Careful"}</span>
                <span className="mode-eta">{m === "fast" ? "≈ a few seconds" : "≈ 1 min / 200 chunks"}</span>
              </button>
            ))}
          </div>
        )}

        {!progress && (
          <div className="mode-note">
            <span className="mode-note-head">
              {mode === "fast" ? "⚡ Fast" : "◎ Careful"} · {MODE_NOTES[mode].head}
            </span>
            <ul>
              {MODE_NOTES[mode].points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {progress ? (
          <IngestProgress state={progress} />
        ) : (
          <p className="hint">
            Try <span className="mono">app</span> to index Glyph&apos;s own code.
          </p>
        )}

        {!progress && (
          <div className="land-demos">
            <span className="ld-label">Try a public repo</span>
            {DEMO_REPOS.map((r) => (
              <button
                key={r.repo}
                className="rr demo-chip"
                onClick={() => !busy && onIngest(`https://github.com/${r.repo}`)}
                title={`Ingest github.com/${r.repo}`}
              >
                <Icon name="github" size={14} />
                <span className="mono">{r.repo}</span>
                <span className="lang-tag" style={{ color: r.color }}>
                  {r.lang}
                </span>
              </button>
            ))}
          </div>
        )}

        {recent && recent.length > 0 && !progress && (
          <div className="land-recent">
            {recent.slice(0, 4).map((r) => (
              <button
                key={r.owner + r.name}
                className="rr"
                onClick={() => !busy && onIngest(`${r.owner}/${r.name}`)}
              >
                <span className="dot-live" />
                <span className="mono">
                  {r.owner}/{r.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Recognizable, fast-to-ingest repos for one-click demos — a spread of TypeScript, Python and
// JavaScript (the languages the chunker parses), each small enough to index in seconds. The
// language + brand colour drive the little dot/tag on each chip.
const DEMO_REPOS: { repo: string; lang: string; color: string }[] = [
  { repo: "pmndrs/zustand", lang: "TS", color: "#3178c6" },
  { repo: "colinhacks/zod", lang: "TS", color: "#3178c6" },
  { repo: "fastapi/typer", lang: "Python", color: "#ffd43b" },
  { repo: "pallets/flask", lang: "Python", color: "#ffd43b" },
  { repo: "expressjs/express", lang: "JS", color: "#f7df1e" },
];

// The core engineering difference between the two indexing modes, shown under the toggle
// so a technical reader can see exactly what they are trading off.
const MODE_NOTES: Record<"fast" | "careful", { head: string; points: string[] }> = {
  fast: {
    head: "Static embeddings (Model2Vec)",
    points: [
      "Model2Vec static vectors (potion-base-8M, 256-dim), no transformer at index time.",
      "About 100x faster indexing (measured ~22k chunks/sec); pure CPU, no model warmup.",
      "Best for large repos or a quick first look.",
      "Slightly lower raw recall, recovered by the cross-encoder reranker.",
      "Matches bge-small on golden-set hit-rate in our eval.",
    ],
  },
  careful: {
    head: "Transformer embeddings (bge-small)",
    points: [
      "bge-small-en-v1.5 (384-dim) via fastembed and ONNX, richer semantic vectors.",
      "Stronger on nuanced or paraphrased queries.",
      "Slower: a cold first batch and more compute per chunk.",
      "Its own Chroma collection keyed by model and dimension, never mixed with fast.",
      "Best when precision matters more than indexing speed.",
    ],
  },
};
