import type { Source } from "../api";

interface Props {
  source: Source;
  onClose: () => void;
}

/** The right-hand panel that shows the code behind a clicked citation, with line numbers. */
export function CodePanel({ source, onClose }: Props) {
  const lines = source.code.split("\n");

  return (
    <div className="code-panel">
      <div className="head">
        <div className="file">
          <b>{source.file_path}</b> · lines {source.start_line}-{source.end_line}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close code panel">
          ✕
        </button>
      </div>
      <div className="body">
        <pre>
          {lines.map((line, i) => (
            <div className="code-row" key={i}>
              <span className="ln">{source.start_line + i}</span>
              <span className="code">{line || " "}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
