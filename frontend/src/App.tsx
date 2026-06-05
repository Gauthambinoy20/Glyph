// App — orchestrates Glyph: landing ⇄ workspace, navbar, code viewer, ⌘K, live streaming.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api";
import type { Citation, ModelInfo, Source } from "./api";
import type { Message, Recent, Repo, Suggestion } from "./types";
import { ChatEmpty, Composer, GlyphAnswer, Thinking } from "./components/Chat";
import type { CodeRef } from "./components/Chat";
import { CodeViewer } from "./components/CodeViewer";
import { CommandPalette } from "./components/CommandPalette";
import { ForceGraph, langColor } from "./components/ForceGraph";
import { Icon, Logo } from "./components/Icon";
import { Landing } from "./components/Landing";
import { ProjectPanel } from "./components/ProjectPanel";
import type { PanelData } from "./components/ProjectPanel";

const SUGGESTIONS: Suggestion[] = [
  { q: "What does this codebase do?", hint: "High-level overview", icon: "compass" },
  { q: "Where are the API endpoints defined?", hint: "Routing & handlers", icon: "route" },
  { q: "How does retrieval work?", hint: "Embeddings + ranking", icon: "search" },
  { q: "Walk me through the main data flow.", hint: "Ingest → ask → answer", icon: "flow" },
];

/** Parse a GitHub URL or local path into a Repo header. */
function parseRepo(input: string): Repo {
  const m = input.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (m) return { owner: m[1], name: m[2], branch: "main", url: `https://github.com/${m[1]}/${m[2]}`, visibility: "Public" };
  const name = input.split("/").filter(Boolean).pop() || input;
  return { owner: "local", name, branch: "main", url: input };
}

const prettyLang = (l: string) => (l ? l.charAt(0).toUpperCase() + l.slice(1) : "Other");

/** Suggest follow-up questions from the symbols Glyph just looked at. */
function deriveFollowups(sources: Source[]): string[] {
  const symbols = Array.from(new Set(sources.map((s) => s.symbol_name).filter((s) => s && s !== "<module>")));
  const qs = symbols.slice(0, 3).map((s) => `How does \`${s}\` work?`);
  qs.push("What are the main parts of this code?");
  return qs.slice(0, 4);
}

function ModelPicker({ models, idx, onPick }: { models: ModelInfo[]; idx: number; onPick: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  if (models.length === 0) return null;
  const m = models[idx];
  return (
    <div className="modelpick" ref={ref}>
      <button className="modelpick-btn" onClick={() => setOpen((o) => !o)}>
        <span>{m.label}</span>
        <span className="tier">{m.tier}</span>
        <Icon name="chevDown" size={13} />
      </button>
      {open && (
        <div className="menu">
          {models.map((mm, i) => (
            <button
              key={mm.id}
              className="menu-item"
              data-active={i === idx ? "1" : "0"}
              data-avail={mm.available ? "1" : "0"}
              onClick={() => {
                onPick(i);
                setOpen(false);
              }}
            >
              <span style={{ flex: 1 }}>
                <span className="mi-top">
                  <span className="mi-label">{mm.label}</span>
                  <span className={"tag-tier " + mm.tier}>{mm.tier}</span>
                </span>
                <span className="mi-note">{mm.note}</span>
              </span>
              {i === idx && (
                <span style={{ color: "var(--accent)" }}>
                  <Icon name="check" size={16} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GraphModal({ data, onClose, onPick }: { data: PanelData; onClose: () => void; onPick: (label: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 900, h: 560 });
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setDim({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const langs = [...new Set(data.graph.nodes.map((n) => n.language))];
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="card-title" style={{ fontSize: 13 }}>
            <span className="gd" /> Architecture
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="graph-legend" style={{ margin: 0 }}>
              {langs.map((l) => (
                <span className="li" key={l}>
                  <span className="ld" style={{ background: langColor(l) }} />
                  {l}
                </span>
              ))}
            </div>
            <button className="iconbtn" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30 }}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="modal-body" ref={wrapRef}>
          <ForceGraph nodes={data.graph.nodes} edges={data.graph.edges} width={dim.w} height={dim.h} onPick={(n) => onPick(n.label)} big />
        </div>
      </div>
    </div>
  );
}

interface Toast {
  id: string;
  msg: string;
}

export default function App() {
  const [screen, setScreen] = useState<"landing" | "workspace">("landing");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [busyIngest, setBusyIngest] = useState(false);
  const [code, setCode] = useState<{ source: Source; hlStart: number; hlEnd: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [graphModal, setGraphModal] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelIdx, setModelIdx] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pushToast = useCallback((msg: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, msg }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => {
    api
      .models()
      .then((d) => setModels(d.models))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (screen === "workspace") setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [screen]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pending, streamText]);

  // All sources seen so far, for the code viewer + command palette.
  const allSources = useMemo(() => {
    const seen = new Map<string, Source>();
    for (const m of messages) if (m.role === "glyph") for (const s of m.sources) seen.set(s.id, s);
    return [...seen.values()];
  }, [messages]);

  async function ingest(value: string) {
    if (busyIngest) return;
    setBusyIngest(true);
    try {
      const isUrl = value.startsWith("http");
      const ingestResp = await api.ingest(isUrl ? { repo_url: value } : { local_path: value });
      const parsed = parseRepo(value);
      const [stats, overview, graph] = await Promise.all([
        api.stats(),
        api.overview().then((o) => o.overview).catch(() => ""),
        api.graph().catch(() => ({ nodes: [], edges: [] })),
      ]);
      const total = stats.chunks || 1;
      const languages = stats.languages.map((l) => ({
        name: prettyLang(l.language),
        pct: Math.round((l.chunks / total) * 100),
        color: langColor(prettyLang(l.language)),
      }));
      setRepo(parsed);
      setPanel({
        repo: parsed,
        languages,
        stats: { files: stats.files, chunks: stats.chunks, cached: ingestResp.cached },
        overview,
        stack: languages.map((l) => l.name),
        graph,
        endpoints: [],
        recent: [],
        latencies: [],
      });
      setRecent((r) => [{ owner: parsed.owner, name: parsed.name, when: "now" }, ...r.filter((x) => x.name !== parsed.name)].slice(0, 4));
      setMessages([]);
      setCode(null);
      setScreen("workspace");
    } catch (e) {
      pushToast((e as Error).message);
    } finally {
      setBusyIngest(false);
    }
  }

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    const history: { question: string; answer: string }[] = [];
    for (const m of messages) {
      if (m.role === "user") history.push({ question: m.text, answer: "" });
      else if (history.length) history[history.length - 1].answer = m.answer;
    }
    setMessages((m) => [...m, { role: "user", text: q }]);
    setPending(true);
    setStreamText(null);
    setPaletteOpen(false);
    let streamed = "";
    api
      .askStream(
        { question: q, model: models[modelIdx]?.id ?? null, history: history.filter((h) => h.answer) },
        {
          onToken: (t) => {
            streamed += t;
            setStreamText(streamed);
          },
          onFinal: (res) => {
            setMessages((m) => [...m, { role: "glyph", ...res, followups: deriveFollowups(res.sources) }]);
            setStreamText(null);
            setPending(false);
          },
          onError: (msg) => {
            pushToast(msg);
            setStreamText(null);
            setPending(false);
          },
        },
      )
      .catch((e) => {
        pushToast((e as Error).message);
        setStreamText(null);
        setPending(false);
      });
  }

  async function openCode(ref: CodeRef) {
    const asSource = ref as Source;
    if (asSource.code) {
      setCode({ source: asSource, hlStart: asSource.start_line, hlEnd: asSource.end_line });
      return;
    }
    const c = ref as Citation;
    const match = allSources.find((s) => s.file_path === c.file_path && c.start_line <= s.end_line && c.end_line >= s.start_line);
    if (match) {
      setCode({ source: match, hlStart: c.start_line, hlEnd: c.end_line });
      return;
    }
    try {
      const file = await api.file(c.file_path, c.start_line, c.end_line);
      const source: Source = {
        id: file.file_path,
        file_path: file.file_path,
        symbol_name: file.chunks[0]?.symbol_name ?? "",
        type: file.chunks[0]?.type ?? "",
        start_line: file.start_line,
        end_line: file.end_line,
        code: file.code,
        language: file.language,
      };
      setCode({ source, hlStart: c.start_line, hlEnd: c.end_line });
    } catch {
      pushToast("No source preview available for that citation.");
    }
  }

  function reset() {
    setScreen("landing");
    setMessages([]);
    setCode(null);
    setPending(false);
    setStreamText(null);
  }

  // Session metrics from the answers so far.
  const answers = messages.filter((m): m is Extract<Message, { role: "glyph" }> => m.role === "glyph");
  const session = {
    queries: answers.length,
    avgLatency: answers.length ? answers.reduce((s, m) => s + (m.meta?.latency_ms ?? 0), 0) / answers.length : 0,
    tokens: answers.reduce((s, m) => s + (m.meta?.token_usage.total_tokens ?? 0), 0),
  };
  const latencies = answers.map((m) => m.meta?.latency_ms ?? 0);

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-left">
          {screen === "workspace" && repo && (
            <span className="repo-chip">
              <span className="dot-live" />
              <span className="mono">
                {repo.owner}/{repo.name}
              </span>
            </span>
          )}
        </div>
        <div className="nav-center">
          <Logo />
        </div>
        <div className="nav-right">
          {screen === "workspace" && <ModelPicker models={models} idx={modelIdx} onPick={setModelIdx} />}
          {screen === "workspace" && (
            <button className="kbar" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" /> Search <span className="kbd">⌘K</span>
            </button>
          )}
          <button
            className="iconbtn"
            aria-label="Toggle theme"
            onClick={() => pushToast("Light theme is on the roadmap — dark is the primary system.")}
          >
            <Icon name="moon" size={17} />
          </button>
        </div>
      </nav>

      {screen === "landing" || !panel ? (
        <Landing onIngest={ingest} busy={busyIngest} recent={recent} />
      ) : (
        <div className="workspace">
          <ProjectPanel
            data={{ ...panel, latencies }}
            session={session}
            onAsk={ask}
            onExpandGraph={() => setGraphModal(true)}
            onChangeRepo={reset}
            onOpenRecent={() => reset()}
          />

          {code && <CodeViewer source={code.source} hlStart={code.hlStart} hlEnd={code.hlEnd} onClose={() => setCode(null)} />}

          <div className="chat-col">
            <div className="chat-scroll scroll" ref={scrollRef}>
              {messages.length === 0 && !pending ? (
                <ChatEmpty overview={panel.overview} suggestions={SUGGESTIONS} onAsk={ask} />
              ) : (
                <div className="chat-inner">
                  {messages.map((m, i) =>
                    m.role === "user" ? (
                      <UserBubble key={i} text={m.text} />
                    ) : (
                      <GlyphAnswer key={i} msg={m} onOpenCode={openCode} onAsk={ask} />
                    ),
                  )}
                  {pending && streamText === null && <Thinking />}
                  {streamText !== null && (
                    <GlyphAnswer
                      msg={{ role: "glyph", answer: streamText, citations: [], retrieved_chunk_ids: [], sources: [], meta: { model: "", latency_ms: 0, token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } } }}
                      onOpenCode={openCode}
                      onAsk={ask}
                      streaming
                    />
                  )}
                </div>
              )}
            </div>
            <Composer onSend={ask} busy={pending} />
          </div>
        </div>
      )}

      {paletteOpen && (
        <CommandPalette
          endpoints={panel?.endpoints ?? []}
          sources={allSources}
          onClose={() => setPaletteOpen(false)}
          onOpenCode={openCode}
          onAsk={ask}
          onChangeRepo={reset}
        />
      )}
      {graphModal && panel && <GraphModal data={panel} onClose={() => setGraphModal(false)} onPick={(label) => { setGraphModal(false); ask(`Explain ${label}.`); }} />}

      <div className="toast-zone">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span className="ti">
              <Icon name="zap" size={17} />
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="msg">
      <div className="msg-head">
        <span className="avatar user">U</span>
        <span className="msg-who">You</span>
      </div>
      <div className="user-bubble">{text}</div>
    </div>
  );
}
