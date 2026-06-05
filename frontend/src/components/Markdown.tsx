// Lightweight markdown renderer + a small Python/TypeScript syntax highlighter.
// Kept dependency-free and deterministic so the answer rendering is fully under our control.

import { useState } from "react";
import type { ReactNode } from "react";

import { Icon } from "./Icon";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KW =
  "def|class|return|if|else|elif|for|while|import|from|async|await|export|function|const|let|var|new|in|of|as|not|and|or|is|None|True|False|null|true|false|undefined|try|except|finally|with|lambda|interface|type|extends|implements|public|private|self|raise|yield|continue|break|pass";
const TOKEN_RE = new RegExp(
  "(#[^\\n]*|//[^\\n]*)" + // comment
    "|(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)" + // string
    "|\\b(\\d[\\d_.]*)\\b" + // number
    "|\\b(" +
    KW +
    ")\\b" + // keyword
    "|([A-Za-z_][\\w]*)(?=\\s*\\()", // function call
  "g",
);

/** Highlight one line of code into an HTML string of <span class="tok-*"> tokens. */
export function highlightLine(line: string): string {
  const esc = escapeHtml(line);
  return esc.replace(TOKEN_RE, (m, com, str, num, kw, fn) => {
    if (com) return `<span class="tok-com">${com}</span>`;
    if (str) return `<span class="tok-str">${str}</span>`;
    if (num) return `<span class="tok-num">${num}</span>`;
    if (kw) return `<span class="tok-kw">${kw}</span>`;
    if (fn) return `<span class="tok-fn">${fn}</span>`;
    return m;
  });
}

/** Highlight a whole code block into joined <span class="ln"> lines. */
export function highlightHtml(code: string): string {
  return code
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => `<span class="ln">${highlightLine(l) || "&nbsp;"}</span>`)
    .join("");
}

/** Inline markdown (bold + inline code) to an HTML string. */
export function mdInline(text: string): string {
  let h = escapeHtml(text);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return h;
}

/** Render a markdown string: headings, lists, paragraphs, and highlighted code fences. */
export function Markdown({ children }: { children: string }) {
  const src = children || "";
  const blocks: ReactNode[] = [];
  const lines = src.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push(
        <pre key={key++}>
          <CopyButton text={buf.join("\n")} className="code-copy" />
          <code className="mono" dangerouslySetInnerHTML={{ __html: highlightHtml(buf.join("\n")) }} />
        </pre>,
      );
      continue;
    }

    if (/^####\s/.test(line)) {
      blocks.push(
        <h4 key={key++} dangerouslySetInnerHTML={{ __html: mdInline(line.replace(/^####\s/, "")) }} />,
      );
      i++;
      continue;
    }
    if (/^###\s/.test(line)) {
      blocks.push(
        <h3 key={key++} dangerouslySetInnerHTML={{ __html: mdInline(line.replace(/^###\s/, "")) }} />,
      );
      i++;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((it, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: mdInline(it) }} />
          ))}
        </ol>,
      );
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: mdInline(it) }} />
          ))}
        </ul>,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(```|###|####|\d+\.\s|[-*]\s)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++} dangerouslySetInnerHTML={{ __html: mdInline(para.join(" ")) }} />);
  }

  return <div className="md">{blocks}</div>;
}

/** A small copy-to-clipboard button that flips to a check for a moment after copying. */
export function CopyButton({ text, className, label }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  function copy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      })
      .catch(() => {});
  }
  return (
    <button
      className={"iconbtn " + (className || "")}
      onClick={copy}
      aria-label="Copy"
      style={{ width: 28, height: 28 }}
    >
      {done ? (
        <span className="copied-toast">
          <Icon name="check" size={15} />
        </span>
      ) : (
        <Icon name="copy" size={14} />
      )}
      {label && <span style={{ marginLeft: 6, fontSize: 12 }}>{done ? "Copied" : label}</span>}
    </button>
  );
}
