// Observability modal: the session's query log — latency (retrieve vs LLM), tokens, cache hits.

import { useEffect } from "react";

import { Icon } from "./Icon";

export interface QueryLogEntry {
  question: string;
  model: string;
  latency_ms: number;
  retrieve_ms: number;
  llm_ms: number;
  tokens: number;
  cached: boolean;
}

export function QueryLog({ entries, onClose }: { entries: QueryLogEntry[]; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "min(840px, 94vw)", height: "min(560px, 84vh)" }}
      >
        <div className="modal-hd">
          <span className="card-title" style={{ fontSize: 13 }}>
            <span className="gd" /> Observability · {entries.length} {entries.length === 1 ? "query" : "queries"}
          </span>
          <button className="iconbtn" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30 }}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body scroll" style={{ overflow: "auto", padding: 0 }}>
          {entries.length === 0 ? (
            <div className="pal-empty">No queries yet — ask something to see its latency and tokens here.</div>
          ) : (
            <table className="qlog">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Model</th>
                  <th>Retrieve</th>
                  <th>LLM</th>
                  <th>Total</th>
                  <th>Tokens</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i}>
                    <td className="mono">{i + 1}</td>
                    <td className="qlog-q">{e.question}</td>
                    <td className="mono">{e.model.split("/").pop()}</td>
                    <td className="mono">{e.retrieve_ms}ms</td>
                    <td className="mono">{(e.llm_ms / 1000).toFixed(1)}s</td>
                    <td className="mono">{(e.latency_ms / 1000).toFixed(1)}s</td>
                    <td className="mono">{e.tokens.toLocaleString()}</td>
                    <td>{e.cached && <span className="tier">cached</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
