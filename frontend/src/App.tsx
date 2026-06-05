import { useEffect, useRef, useState } from "react";

import { api } from "./api";
import type { AskResponse, Citation, ModelInfo, Source } from "./api";
import { Answer } from "./components/Answer";
import { CodePanel } from "./components/CodePanel";
import { GraphView } from "./components/GraphView";
import { ModelPicker } from "./components/ModelPicker";

interface Message {
  id: number;
  role: "user" | "assistant";
  text?: string;
  data?: AskResponse;
  thinking?: boolean;
}

const SUGGESTIONS = [
  "What does this codebase do?",
  "Where are the API endpoints defined?",
  "How does the retrieval work?",
  "Walk me through the main data flow.",
];

let idSeq = 1;

export default function App() {
  const [phase, setPhase] = useState<"landing" | "workspace">("landing");
  const [repoInput, setRepoInput] = useState("");
  const [repoLabel, setRepoLabel] = useState("");
  const [ingesting, setIngesting] = useState(false);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"chat" | "graph">("chat");
  const [overview, setOverview] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .models()
      .then((d) => {
        setModels(d.models);
        setSelectedModel(d.default);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  async function ingest(value: string) {
    const target = value.trim();
    if (!target || ingesting) return;
    setIngesting(true);
    setError("");
    try {
      const isUrl = target.startsWith("http");
      await api.ingest(isUrl ? { repo_url: target } : { local_path: target });
      setRepoLabel(isUrl ? target.replace(/^https:\/\/github\.com\//, "") : target);
      setPhase("workspace");
      setOverview("");
      api
        .overview()
        .then((d) => setOverview(d.overview))
        .catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIngesting(false);
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    // Build the conversation history (completed question/answer pairs) for follow-ups.
    const history: { question: string; answer: string }[] = [];
    for (let i = 0; i < messages.length - 1; i++) {
      const u = messages[i];
      const a = messages[i + 1];
      if (u.role === "user" && u.text && a.role === "assistant" && a.data) {
        history.push({ question: u.text, answer: a.data.answer });
      }
    }

    const userId = idSeq++;
    const botId = idSeq++;
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text: q },
      { id: botId, role: "assistant", thinking: true },
    ]);
    setInput("");
    setBusy(true);
    setError("");
    try {
      // Stream the answer in: append each token live, then swap to the full Answer on the
      // final message (which carries citations, sources, and the observability meta).
      await api.askStream(
        { question: q, model: selectedModel || null, history },
        {
          onToken: (t) =>
            setMessages((m) =>
              m.map((x) =>
                x.id === botId ? { ...x, thinking: false, text: (x.text ?? "") + t } : x,
              ),
            ),
          onFinal: (res) =>
            setMessages((m) =>
              m.map((x) =>
                x.id === botId ? { ...x, thinking: false, text: undefined, data: res } : x,
              ),
            ),
          onError: (msg) => {
            setMessages((m) => m.filter((x) => x.id !== botId));
            setError(msg);
          },
        },
      );
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== botId));
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openCitation(citation: Citation, sources: Source[]) {
    const match = sources.find(
      (s) =>
        s.file_path === citation.file_path &&
        citation.start_line <= s.end_line &&
        citation.end_line >= s.start_line,
    );
    if (match) setActiveSource(match);
  }

  if (phase === "landing") {
    return (
      <div className="app">
        <div className="landing">
          <div className="landing-inner">
            <div className="badge">
              <span className="mark" style={{ width: 16, height: 16, borderRadius: 5, fontSize: 10 }}>
                G
              </span>{" "}
              Code intelligence
            </div>
            <h1>
              Ask your <span className="accent">codebase</span>.
            </h1>
            <p className="sub">
              Point Glyph at a GitHub repo or a local folder, then ask questions and get answers
              grounded in the real code, with file and line citations.
            </p>
            <div className="ingest-box">
              <input
                autoFocus
                placeholder="https://github.com/owner/repo   ·   or a local path"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ingest(repoInput)}
              />
              <button
                className="btn btn-primary"
                disabled={ingesting || !repoInput.trim()}
                onClick={() => ingest(repoInput)}
              >
                {ingesting ? (
                  <>
                    <span className="spinner" /> Ingesting
                  </>
                ) : (
                  "Ingest →"
                )}
              </button>
            </div>
            <div className="hint">
              Try <b onClick={() => ingest("app")}>app</b> to index Glyph&apos;s own code.
            </div>
          </div>
        </div>
        {error && <div className="error-toast">{error}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="left">
          <span className="mark">G</span>
          <span className="wordmark">
            Glyph<span className="dot">.</span>
          </span>
          <span className="repo-chip">
            <span className="ok" /> {repoLabel}
          </span>
        </div>
        <div className="topbar-right">
          <div className="view-toggle">
            <button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>
              Chat
            </button>
            <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>
              Map
            </button>
          </div>
          <ModelPicker models={models} selected={selectedModel} onSelect={setSelectedModel} />
        </div>
      </div>

      <div className="workspace">
        {view === "graph" ? (
          <GraphView
            onPickFile={(file) => {
              setView("chat");
              ask(`Explain \`${file}\` and what it does.`);
            }}
          />
        ) : (
          <>
            <div className="chat">
          <div className="messages" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="suggest">
                {overview && (
                  <div className="overview-card">
                    <div className="ov-title">
                      <span className="ov-dot" /> Overview
                    </div>
                    <p>{overview}</p>
                  </div>
                )}
                <div className="title">Ask anything about this code</div>
                <div className="grid">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="suggest-card" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages-inner">
                {messages.map((m) => (
                  <div key={m.id} className={`msg ${m.role}`}>
                    <div className="role">
                      {m.role === "user" ? (
                        <>
                          <span className="avatar you">U</span> You
                        </>
                      ) : (
                        <>
                          <span
                            className="mark"
                            style={{ width: 20, height: 20, borderRadius: 6, fontSize: 11 }}
                          >
                            G
                          </span>{" "}
                          Glyph
                        </>
                      )}
                    </div>
                    {m.role === "user" ? (
                      <div className="bubble">{m.text}</div>
                    ) : m.thinking ? (
                      <div className="thinking">
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : m.data ? (
                      <Answer
                        data={m.data}
                        onOpen={(c) => openCitation(c, m.data!.sources)}
                        onFollowUp={ask}
                      />
                    ) : m.text !== undefined ? (
                      // Words appearing live, before the final message settles the answer.
                      <div className="answer streaming">
                        {m.text}
                        <span className="stream-cursor">▍</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="composer-wrap">
            <div className="composer">
              <textarea
                rows={1}
                placeholder="Ask about the code…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
              />
              <button
                className="send"
                disabled={busy || !input.trim()}
                onClick={() => ask(input)}
                aria-label="Send"
              >
                ↑
              </button>
            </div>
          </div>
        </div>

            {activeSource && (
              <CodePanel source={activeSource} onClose={() => setActiveSource(null)} />
            )}
          </>
        )}
      </div>

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
