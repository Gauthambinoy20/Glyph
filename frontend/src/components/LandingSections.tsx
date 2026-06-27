// The scrollable marketing sections below the landing hero: how it works, what you get,
// the stack, a copy-paste quickstart, and a footer. Presentational only.

import { useState } from "react";

import { Icon } from "./Icon";

const STEPS = [
  {
    n: "01",
    t: "Ingest",
    d: "Point Glyph at a public GitHub repo or a local folder. It clones and walks the files in a sandbox.",
  },
  {
    n: "02",
    t: "Index",
    d: "Tree-sitter splits the code into real functions and classes, then embeds them into a vector store.",
  },
  {
    n: "03",
    t: "Retrieve & rerank",
    d: "Hybrid search (semantic + keyword) casts a wide net; a cross-encoder reranks the best code to the top.",
  },
  {
    n: "04",
    t: "Cited answer",
    d: "The model answers only from the retrieved code, with clickable file and line citations you can verify.",
  },
];

const FEATURES = [
  {
    icon: "file",
    t: "File and line citations",
    d: "Every answer is grounded in real code you can click and check, not a confident guess.",
  },
  {
    icon: "layers",
    t: "Two-stage retrieval",
    d: "Wide hybrid recall plus a cross-encoder reranker that puts the most relevant code first.",
  },
  {
    icon: "zap",
    t: "Fast or Careful modes",
    d: "Near-instant static-vector indexing, or a transformer model when precision matters more.",
  },
  {
    icon: "route",
    t: "Architecture graph",
    d: "A live dependency graph built from the repository's real imports, with click-to-ask nodes.",
  },
  {
    icon: "activity",
    t: "Observability",
    d: "Per-query latency, tokens and the exact files behind each answer, shown live.",
  },
  {
    icon: "compass",
    t: "Runs free",
    d: "Local embeddings plus an open model on the OpenRouter free tier — no card needed.",
  },
];

const STACK = [
  "FastAPI",
  "React",
  "TypeScript",
  "tree-sitter",
  "Chroma",
  "BM25 + RRF",
  "OpenRouter · gpt-oss-120b",
];

const CLONE_CMD = "git clone https://github.com/Gauthambinoy20/Glyph.git";
const RUN_CMD = "cd Glyph && docker compose up --build";

// A single command with a copy button. Kept tiny so the quickstart stays scannable.
function CopyRow({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(cmd);
    setCopied(true);
  }
  return (
    <div className="ls-cmd">
      <code className="mono">{cmd}</code>
      <button className="ls-copy" onClick={copy} aria-label="Copy command">
        <Icon name={copied ? "check" : "copy"} size={15} />
      </button>
    </div>
  );
}

export function LandingSections() {
  return (
    <div className="landing-sections">
      <section className="ls-sec" aria-labelledby="ls-how">
        <h2 id="ls-how" className="ls-h2">
          How it works
        </h2>
        <p className="ls-sub">From a repository URL to a cited answer in four steps.</p>
        <div className="ls-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="ls-step">
              <span className="ls-step-n mono">{s.n}</span>
              <h3 className="ls-step-t">{s.t}</h3>
              <p className="ls-step-d">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ls-sec" aria-labelledby="ls-feat">
        <h2 id="ls-feat" className="ls-h2">
          What you get
        </h2>
        <p className="ls-sub">Built to be trusted, not just impressive.</p>
        <div className="ls-features">
          {FEATURES.map((f) => (
            <div key={f.t} className="ls-feature">
              <span className="ls-feature-ic">
                <Icon name={f.icon} size={18} />
              </span>
              <h3 className="ls-feature-t">{f.t}</h3>
              <p className="ls-feature-d">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ls-sec" aria-labelledby="ls-stack">
        <h2 id="ls-stack" className="ls-h2">
          Under the hood
        </h2>
        <p className="ls-sub">A small, explicit stack — no orchestration framework.</p>
        <div className="ls-stack">
          {STACK.map((name) => (
            <span key={name} className="ls-chip mono">
              {name}
            </span>
          ))}
        </div>
      </section>

      <section className="ls-sec" aria-labelledby="ls-run">
        <h2 id="ls-run" className="ls-h2">
          Run it yourself
        </h2>
        <p className="ls-sub">One command with Docker. Add a free OpenRouter key for answers.</p>
        <div className="ls-quickstart">
          <CopyRow cmd={CLONE_CMD} />
          <CopyRow cmd={RUN_CMD} />
        </div>
        <p className="ls-note">Then open localhost:5173, paste a repo, and ask.</p>
      </section>

      <footer className="ls-footer">
        <a
          className="ls-foot-link"
          href="https://github.com/Gauthambinoy20/Glyph"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="github" size={15} /> GitHub
        </a>
        <span className="ls-foot-dot">·</span>
        <span className="ls-foot-by">Built by Gautham Binoy</span>
      </footer>
    </div>
  );
}
