import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

import type { Citation } from "../api";

interface Props {
  text: string;
  citations: Citation[];
  onOpen: (citation: Citation) => void;
}

/** Render a grounded answer: the markdown body, then clickable citation chips. */
export function Answer({ text, citations, onOpen }: Props) {
  const notFound = text.trim().toLowerCase().startsWith("not found");

  return (
    <div>
      {notFound ? (
        <p className="not-found">{text}</p>
      ) : (
        <div className="answer">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{text}</ReactMarkdown>
        </div>
      )}

      {citations.length > 0 && (
        <div className="citations">
          <span className="label">Sources</span>
          {citations.map((c, i) => (
            <button key={i} className="cite" onClick={() => onOpen(c)}>
              {c.file_path}
              <span className="hash">
                :{c.start_line}-{c.end_line}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
