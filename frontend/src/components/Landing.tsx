// Landing screen — the pre-repo hero and ingest box. Presentational: it collects the
// repo URL or path and hands it to onIngest; App owns the async ingest + busy/error state.

import { useRef, useState } from "react";

import type { Recent } from "../types";
import { Icon, LogoMark } from "./Icon";

interface Props {
  onIngest: (value: string) => void;
  busy: boolean;
  recent?: Recent[];
}

export function Landing({ onIngest, busy, recent }: Props) {
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
      <div className="landing-glow" />

      <div className="hero" data-variant="editorial">
        <span className="badge">
          <LogoMark /> Code intelligence
        </span>

        <h1 className="h1">
          Ask your <span className="accent">codebase</span>.
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

        <p className="hint">
          Try <span className="mono">app</span> to index Glyph&apos;s own code.
        </p>

        {recent && recent.length > 0 && (
          <div className="land-recent">
            {recent.slice(0, 4).map((r) => (
              <button key={r.owner + r.name} className="rr" onClick={() => !busy && onIngest(`${r.owner}/${r.name}`)}>
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
