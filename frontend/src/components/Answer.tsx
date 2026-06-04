import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

import type { AskResponse, Citation, Source } from "../api";

interface Props {
  data: AskResponse;
  onOpen: (citation: Citation) => void;
  onFollowUp: (question: string) => void;
}

/** Suggest a few follow-up questions from the symbols Glyph just looked at. */
function followUps(sources: Source[]): string[] {
  const symbols = Array.from(
    new Set(sources.map((s) => s.symbol_name).filter((s) => s && s !== "<module>")),
  );
  const questions = symbols.slice(0, 3).map((s) => `How does \`${s}\` work?`);
  questions.push("What are the main parts of this code?");
  return questions.slice(0, 4);
}

/** Render an answer: body, observability chip, citations, the retrieved sources, follow-ups. */
export function Answer({ data, onOpen, onFollowUp }: Props) {
  const notFound = data.answer.trim().toLowerCase().startsWith("not found");
  const tokens = data.meta?.token_usage.total_tokens;

  return (
    <div>
      {notFound ? (
        <p className="not-found">{data.answer}</p>
      ) : (
        <div className="answer">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{data.answer}</ReactMarkdown>
        </div>
      )}

      {data.meta && (
        <div className="metrics">
          <span className="mono">{data.meta.model.split("/").pop()}</span>
          <span className="sep">·</span>
          <span>{(data.meta.latency_ms / 1000).toFixed(1)}s</span>
          <span className="sep">·</span>
          <span>{tokens} tokens</span>
        </div>
      )}

      {data.citations.length > 0 && (
        <div className="citations">
          <span className="label">Cited</span>
          {data.citations.map((c, i) => (
            <button key={i} className="cite" onClick={() => onOpen(c)}>
              {c.file_path}
              <span className="hash">
                :{c.start_line}-{c.end_line}
              </span>
            </button>
          ))}
        </div>
      )}

      {data.sources.length > 0 && (
        <details className="sources">
          <summary>{data.sources.length} sources retrieved</summary>
          <div className="source-list">
            {data.sources.map((s) => (
              <button
                key={s.id}
                className="source-row"
                onClick={() =>
                  onOpen({
                    file_path: s.file_path,
                    start_line: s.start_line,
                    end_line: s.end_line,
                  })
                }
              >
                <span className="sym">{s.symbol_name}</span>
                <span className="loc">
                  {s.file_path}:{s.start_line}-{s.end_line}
                </span>
              </button>
            ))}
          </div>
        </details>
      )}

      {!notFound && (
        <div className="followups">
          {followUps(data.sources).map((q) => (
            <button key={q} className="followup" onClick={() => onFollowUp(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
