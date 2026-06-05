// App — orchestrates Glyph: landing ⇄ workspace, navbar, code viewer, ⌘K, live streaming.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api";
import type { Citation, IngestDone, ModelInfo, Source } from "./api";
import { applyIngestEvent, initialIngestState, type IngestState } from "./components/IngestProgress";
import type { Message, Recent, Repo, Suggestion } from "./types";
import { ChatEmpty, Composer, GlyphAnswer, Thinking } from "./components/Chat";
import { buildSuggestions } from "./suggestions";
import type { CodeRef } from "./components/Chat";
import { CodeViewer } from "./components/CodeViewer";
import { CommandPalette } from "./components/CommandPalette";
import { ForceGraph, langColor } from "./components/ForceGraph";
import { Icon, Logo } from "./components/Icon";
import { Landing } from "./components/Landing";
import { ProjectPanel } from "./components/ProjectPanel";
import { QueryLog } from "./components/QueryLog";
import type { QueryLogEntry } from "./components/QueryLog";
import type { PanelData } from "./components/ProjectPanel";

/** Parse a GitHub URL or local path into a Repo header. */
function parseRepo(input: string): Repo {
  const m = input.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  // No invented branch/visibility here — the real branch is filled in after ingest, and
  // visibility is left unknown rather than guessed "Public".
  if (m) return { owner: m[1], name: m[2], url: `https://github.com/${m[1]}/${m[2]}` };
  const name = input.split("/").filter(Boolean).pop() || input;
  return { owner: "local", name, url: input };
}

const prettyLang = (l: string) => (l ? l.charAt(0).toUpperCase() + l.slice(1) : "Other");

/** Suggest follow-up questions from the symbols Glyph just looked at. */
function deriveFollowups(sources: Source[]): string[] {
  const symbols = Array.from(new Set(sources.map((s) => s.symbol_name).filter((s) => s && s !== "<module>")));
  const qs = symbols.slice(0, 3).map((s) => `How does \`${s}\` work?`);
  qs.push("What are the main parts of this code?");
  return qs.slice(0, 4);
}

const repoKey = (r: Repo) => `${r.owner}/${r.name}`;

/** Flatten chat messages for the history store. */
function serializeMessages(messages: Message[]) {
  return messages.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.text, data: null }
      : { role: "glyph", content: m.answer, data: m },
  );
}

/** Rebuild chat messages loaded back from the history store. */
function deserializeMessages(rows: { role: string; content: string; data: unknown }[]): Message[] {
  return rows.map((r) =>
    r.role === "user"
      ? ({ role: "user", text: r.content } as Message)
      : ({ role: "glyph", ...(r.data as object) } as Message),
  );
}

function ModelPicker({
  models,
  idx,
  onPick,
}: {
  models: ModelInfo[];
  idx: number;
  onPick: (i: number) => void;
}) {
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

function GraphModal({
  data,
  onClose,
  onPick,
}: {
  data: PanelData;
  onClose: () => void;
  onPick: (label: string) => void;
}) {
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
            <button
              className="iconbtn"
              onClick={onClose}
              aria-label="Close"
              style={{ width: 30, height: 30 }}
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="modal-body" ref={wrapRef}>
          <ForceGraph
            nodes={data.graph.nodes}
            edges={data.graph.edges}
            width={dim.w}
            height={dim.h}
            onPick={(n) => onPick(n.label)}
            big
          />
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
  const [ingestState, setIngestState] = useState<IngestState | null>(null);
  // How the next repo is filed (fast = Model2Vec, careful = transformer), and whether the
  // reranker reorders results for each question. Both are user-facing controls.
  const [embedMode, setEmbedMode] = useState<"fast" | "careful">("careful");
  const [rerank, setRerank] = useState(true);
  // Starter questions, tailored to the repo once it is indexed (a generic four until then).
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() => buildSuggestions({}));
  const [code, setCode] = useState<{ source: Source; hlStart: number; hlEnd: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [graphModal, setGraphModal] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelIdx, setModelIdx] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [symbols, setSymbols] = useState<Source[]>([]);
  const sessionIdRef = useRef<string | null>(null);
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

  // Persist the chat to history after each answer, remembering the session per repo (best-effort).
  useEffect(() => {
    if (!repo || !messages.some((m) => m.role === "glyph")) return;
    api
      .saveHistory({
        repo: repoKey(repo),
        messages: serializeMessages(messages),
        session_id: sessionIdRef.current,
      })
      .then((r) => {
        sessionIdRef.current = r.session_id;
        try {
          localStorage.setItem(`glyph:session:${repoKey(repo)}`, r.session_id);
        } catch {
          /* localStorage unavailable — fine, just no persistence */
        }
      })
      .catch(() => {});
  }, [messages, repo]);

  // All sources seen so far, for the code viewer + command palette.
  const allSources = useMemo(() => {
    const seen = new Map<string, Source>();
    for (const m of messages) if (m.role === "glyph") for (const s of m.sources) seen.set(s.id, s);
    return [...seen.values()];
  }, [messages]);

  // Palette browse list: every indexed symbol, with code-bearing answer sources layered on top
  // (keyed by file:line so a symbol and its retrieved source dedupe, preferring the one with code).
  const paletteSources = useMemo(() => {
    const byLoc = new Map<string, Source>();
    for (const s of symbols) byLoc.set(`${s.file_path}:${s.start_line}`, s);
    for (const s of allSources) byLoc.set(`${s.file_path}:${s.start_line}`, s);
    return [...byLoc.values()];
  }, [symbols, allSources]);

  // One row per answered question, for the observability log.
  const logEntries = useMemo<QueryLogEntry[]>(() => {
    const out: QueryLogEntry[] = [];
    for (let i = 0; i < messages.length - 1; i++) {
      const u = messages[i];
      const a = messages[i + 1];
      if (u.role === "user" && a.role === "glyph") {
        out.push({
          question: u.text,
          model: a.meta.model,
          latency_ms: a.meta.latency_ms,
          retrieve_ms: a.meta.stage_ms?.retrieve_ms ?? 0,
          llm_ms: a.meta.stage_ms?.llm_ms ?? 0,
          tokens: a.meta.token_usage.total_tokens,
          cached: a.meta.cached ?? false,
        });
      }
    }
    return out;
  }, [messages]);

  async function ingest(value: string) {
    if (busyIngest) return;
    const isUrl = value.startsWith("http");
    setBusyIngest(true);
    setIngestState(initialIngestState(isUrl));
    try {
      // Pick how this repo gets filed (fast vs careful) before indexing it. Best-effort:
      // if it fails we just index with whatever backend is already active.
      await api.setMode(embedMode).catch(() => {});
      // Stream ingest so the checklist fills in stage by stage; resolve on the done summary.
      const summary = await new Promise<IngestDone>((resolve, reject) => {
        api
          .ingestStream(isUrl ? { repo_url: value } : { local_path: value }, {
            onEvent: (ev) => setIngestState((s) => (s ? applyIngestEvent(s, ev) : s)),
            onDone: resolve,
            onError: (msg) => reject(new Error(msg)),
          })
          .catch(reject);
      });
      const parsed = parseRepo(value);
      const [stats, overview, graph, endpoints, stack] = await Promise.all([
        api.stats(),
        api
          .overview()
          .then((o) => o.overview)
          .catch(() => ""),
        api.graph().catch(() => ({ nodes: [], edges: [] })),
        api.endpoints().catch(() => []),
        api.stack().catch(() => []),
      ]);
      // Fill the repo header with real data only: the actual branch from the clone and a
      // one-line description taken from the generated overview (no placeholders, no guesses).
      const repoMeta: Repo = {
        ...parsed,
        branch: summary.branch,
        description: overview ? overview.split(/(?<=[.!?])\s/)[0].slice(0, 140) : undefined,
      };
      const symbolRows = await api.symbols().catch(() => []);
      // Real "code intelligence" counts from the index — no estimates.
      const intel = {
        functions: symbolRows.filter((s) => /function|method/i.test(s.type)).length,
        classes: symbolRows.filter((s) => /class|interface|type|struct/i.test(s.type)).length,
        endpoints: endpoints.length,
        frameworks: stack.length,
      };
      // Tailor the starter questions to this repo: a real endpoint, a real symbol, and whether
      // there is a dependency graph to ask about.
      setSuggestions(
        buildSuggestions({
          endpoints,
          symbols: symbolRows,
          hasDeps: graph.edges.length > 0,
        }),
      );
      setSymbols(
        symbolRows.map((s) => ({
          id: `${s.file_path}:${s.start_line}`,
          file_path: s.file_path,
          symbol_name: s.symbol_name,
          type: s.type,
          start_line: s.start_line,
          end_line: s.end_line,
          code: "",
          language: "",
        })),
      );
      const total = stats.chunks || 1;
      const languages = stats.languages.map((l) => ({
        name: prettyLang(l.language),
        pct: Math.round((l.chunks / total) * 100),
        color: langColor(prettyLang(l.language)),
      }));
      setRepo(repoMeta);
      setPanel({
        repo: repoMeta,
        languages,
        stats: { files: stats.files, chunks: stats.chunks, cached: summary.cached },
        overview,
        stack: stack.map((s) => s.name),
        graph,
        endpoints,
        recent: [],
        latencies: [],
        intel,
      });
      setRecent((r) =>
        [
          { owner: parsed.owner, name: parsed.name, when: "now" },
          ...r.filter((x) => x.name !== parsed.name),
        ].slice(0, 4),
      );

      // Restore a saved chat for this repo if there is one; otherwise start fresh.
      const savedSid = localStorage.getItem(`glyph:session:${repoKey(parsed)}`);
      sessionIdRef.current = null;
      if (savedSid) {
        try {
          const session = await api.loadHistory(savedSid);
          setMessages(deserializeMessages(session.messages));
          sessionIdRef.current = savedSid;
        } catch {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }
      setCode(null);
      setScreen("workspace");
    } catch (e) {
      pushToast((e as Error).message);
    } finally {
      setBusyIngest(false);
      setIngestState(null);
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
        {
          question: q,
          model: models[modelIdx]?.id ?? null,
          history: history.filter((h) => h.answer),
          rerank,
        },
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
    const match = allSources.find(
      (s) => s.file_path === c.file_path && c.start_line <= s.end_line && c.end_line >= s.start_line,
    );
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
    setSymbols([]);
    sessionIdRef.current = null;
  }

  // Session metrics from the answers so far.
  const answers = messages.filter((m): m is Extract<Message, { role: "glyph" }> => m.role === "glyph");
  const session = {
    queries: answers.length,
    avgLatency: answers.length
      ? answers.reduce((s, m) => s + (m.meta?.latency_ms ?? 0), 0) / answers.length
      : 0,
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
            <button
              className="kbar"
              onClick={() => setRerank((r) => !r)}
              aria-pressed={rerank}
              title={
                rerank
                  ? "Smart sort is ON — a cross-encoder reorders results so the best code is cited first. Click to turn off (slightly faster)."
                  : "Smart sort is OFF — answers use the plain hybrid order. Click to turn on for sharper citations."
              }
              style={rerank ? { outline: "2px solid var(--accent)" } : { opacity: 0.7 }}
            >
              <Icon name="zap" size={14} /> Smart sort {rerank ? "On" : "Off"}
            </button>
          )}
          {screen === "workspace" && (
            <button className="kbar" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" /> Search <span className="kbd">⌘K</span>
            </button>
          )}
          {screen === "workspace" && (
            <button className="iconbtn" aria-label="Observability" onClick={() => setLogOpen(true)}>
              <Icon name="activity" size={17} />
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
        <Landing
          onIngest={ingest}
          busy={busyIngest}
          recent={recent}
          progress={ingestState}
          mode={embedMode}
          onMode={setEmbedMode}
        />
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

          {code && (
            <CodeViewer
              source={code.source}
              hlStart={code.hlStart}
              hlEnd={code.hlEnd}
              onClose={() => setCode(null)}
            />
          )}

          <div className="chat-col">
            <div className="chat-scroll scroll" ref={scrollRef}>
              {messages.length === 0 && !pending ? (
                <ChatEmpty overview={panel.overview} suggestions={suggestions} onAsk={ask} />
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
                      msg={{
                        role: "glyph",
                        answer: streamText,
                        citations: [],
                        retrieved_chunk_ids: [],
                        sources: [],
                        meta: {
                          model: "",
                          latency_ms: 0,
                          token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                        },
                      }}
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
          sources={paletteSources}
          onClose={() => setPaletteOpen(false)}
          onOpenCode={openCode}
          onAsk={ask}
          onChangeRepo={reset}
        />
      )}
      {graphModal && panel && (
        <GraphModal
          data={panel}
          onClose={() => setGraphModal(false)}
          onPick={(label) => {
            setGraphModal(false);
            ask(`Explain ${label}.`);
          }}
        />
      )}
      {logOpen && <QueryLog entries={logEntries} onClose={() => setLogOpen(false)} />}

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
