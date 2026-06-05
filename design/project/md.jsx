// md.jsx — lightweight markdown renderer + syntax highlighter (Python / TypeScript).

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KW = "def|class|return|if|else|elif|for|while|import|from|async|await|export|function|const|let|var|new|in|of|as|not|and|or|is|None|True|False|null|true|false|undefined|try|except|finally|with|lambda|interface|type|extends|implements|public|private|self|raise|yield|await|continue|break|pass";
const TOKEN_RE = new RegExp(
  "(#[^\\n]*|//[^\\n]*)" +                                  // 1 comment
  "|(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)" + // 2 string
  "|\\b(\\d[\\d_.]*)\\b" +                                  // 3 number
  "|\\b(" + KW + ")\\b" +                                   // 4 keyword
  "|([A-Za-z_][\\w]*)(?=\\s*\\()",                          // 5 fn call
  "g"
);

function highlightLine(line) {
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

// returns HTML string of <span class="ln"> lines
function highlightHtml(code) {
  return code.replace(/\n$/, "").split("\n").map((l) => `<span class="ln">${highlightLine(l) || "&nbsp;"}</span>`).join("");
}

// inline markdown → html (bold + inline code)
function mdInline(text) {
  let h = escapeHtml(text);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return h;
}

// Full markdown → React nodes
function Markdown({ children }) {
  const src = children || "";
  const blocks = [];
  const lines = src.split("\n");
  let i = 0, key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push(
        <pre key={key++}>
          <CopyButton text={buf.join("\n")} className="code-copy" />
          <code className="mono" dangerouslySetInnerHTML={{ __html: highlightHtml(buf.join("\n")) }} />
        </pre>
      );
      continue;
    }

    // headings
    if (/^####\s/.test(line)) { blocks.push(<h4 key={key++} dangerouslySetInnerHTML={{ __html: mdInline(line.replace(/^####\s/, "")) }} />); i++; continue; }
    if (/^###\s/.test(line)) { blocks.push(<h3 key={key++} dangerouslySetInnerHTML={{ __html: mdInline(line.replace(/^###\s/, "")) }} />); i++; continue; }

    // ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
      blocks.push(<ol key={key++}>{items.map((it, j) => <li key={j} dangerouslySetInnerHTML={{ __html: mdInline(it) }} />)}</ol>);
      continue;
    }
    // unordered list
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s/, "")); i++; }
      blocks.push(<ul key={key++}>{items.map((it, j) => <li key={j} dangerouslySetInnerHTML={{ __html: mdInline(it) }} />)}</ul>);
      continue;
    }

    // blank
    if (line.trim() === "") { i++; continue; }

    // paragraph (gather until blank / block)
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(```|###|####|\d+\.\s|[-*]\s)/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={key++} dangerouslySetInnerHTML={{ __html: mdInline(para.join(" ")) }} />);
  }

  return <div className="md">{blocks}</div>;
}

// CopyButton — shared
function CopyButton({ text, className, label }) {
  const [done, setDone] = React.useState(false);
  function copy(e) {
    e.stopPropagation();
    navigator.clipboard?.writeText(text).then(() => {
      setDone(true); setTimeout(() => setDone(false), 1400);
    }).catch(() => {});
  }
  return (
    <button className={"iconbtn " + (className || "")} onClick={copy} aria-label="Copy"
      style={{ width: 28, height: 28 }}>
      {done ? <span className="copied-toast"><Icon name="check" size={15} /></span> : <Icon name="copy" size={14} />}
      {label && <span style={{ marginLeft: 6, fontSize: 12 }}>{done ? "Copied" : label}</span>}
    </button>
  );
}

Object.assign(window, { Markdown, mdInline, highlightHtml, highlightLine, escapeHtml, CopyButton });
