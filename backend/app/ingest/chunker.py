"""AST aware code chunker.

We split a source file into meaningful pieces (one per function, method, class,
interface or type) instead of cutting it every N characters. Each piece records
the exact file, symbol name and 1-indexed start/end lines, which is what lets the
rest of the app cite real code locations later.

Supported first: Python, JavaScript/JSX, TypeScript, TSX. Anything else falls back
to plain fixed-size text chunks so ingestion never crashes on an odd file.
"""

from __future__ import annotations

from dataclasses import dataclass

from tree_sitter import Node, Parser
from tree_sitter_language_pack import get_language

# Map a file extension to a tree-sitter language id.
# Note: .tsx uses its OWN grammar, separate from .ts, or JSX is mis-parsed.
_EXT_TO_LANG: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".tsx": "tsx",
}

# Per language, the node types that define a named symbol, and the label we give it.
_DEF_TYPES: dict[str, dict[str, str]] = {
    "python": {
        "function_definition": "function",
        "class_definition": "class",
    },
    "javascript": {
        "function_declaration": "function",
        "class_declaration": "class",
        "method_definition": "method",
    },
    "typescript": {
        "function_declaration": "function",
        "class_declaration": "class",
        "method_definition": "method",
        "interface_declaration": "interface",
        "type_alias_declaration": "type",
    },
}
# TSX uses the same symbol types as TypeScript.
_DEF_TYPES["tsx"] = _DEF_TYPES["typescript"]

# Cache one parser per language so we do not rebuild grammars on every file.
_parser_cache: dict[str, Parser] = {}


@dataclass
class Chunk:
    """One retrievable piece of code with its exact location."""

    file_path: str
    language: str
    symbol_name: str
    type: str  # function | method | class | interface | type | module | text
    start_line: int  # 1-indexed, inclusive
    end_line: int  # 1-indexed, inclusive
    code: str


def language_for_path(path: str) -> str | None:
    """Return the tree-sitter language id for a file path, or None if unsupported."""
    dot = path.rfind(".")
    if dot == -1:
        return None
    return _EXT_TO_LANG.get(path[dot:].lower())


def parser_for(lang: str) -> Parser:
    """Return a cached tree-sitter parser for a language id.

    We build a standard Parser from get_language (not get_parser), because in this
    library version get_parser returns a non-standard object, while get_language gives
    a normal tree_sitter.Language that the standard Parser API understands.
    """
    if lang not in _parser_cache:
        _parser_cache[lang] = Parser(get_language(lang))
    return _parser_cache[lang]


def _name_of(node: Node) -> str:
    """Read the 'name' field of a definition node, or a placeholder if missing."""
    name_node = node.child_by_field_name("name")
    if name_node is None or name_node.text is None:
        return "<anonymous>"
    return name_node.text.decode("utf-8", "replace")


def _slice(source: bytes, node: Node) -> str:
    """Return the exact source text for a node, decoded safely."""
    return source[node.start_byte : node.end_byte].decode("utf-8", "replace")


def _make_chunk(
    span_node: Node, name_node: Node, source: bytes, lang: str, path: str, kind: str
) -> Chunk:
    """Build a Chunk: take the line span and code from span_node, the name from name_node."""
    return Chunk(
        file_path=path,
        language=lang,
        symbol_name=_name_of(name_node),
        type=kind,
        # start_point/end_point are 0-indexed (row, col), so add 1 for human lines.
        start_line=span_node.start_point[0] + 1,
        end_line=span_node.end_point[0] + 1,
        code=_slice(source, span_node),
    )


def _decorated_inner(node: Node) -> Node | None:
    """For a Python decorated_definition, return the inner function/class node."""
    for child in node.named_children:
        if child.type in ("function_definition", "class_definition"):
            return child
    return None


def _arrow_declarator(node: Node) -> Node | None:
    """For a JS/TS const/let declaration, return the declarator that holds a function.

    Catches patterns like `const square = (x) => x * x`, where the name lives on the
    declarator, not on the arrow function itself.
    """
    for child in node.named_children:
        if child.type == "variable_declarator":
            value = child.child_by_field_name("value")
            if value is not None and value.type in (
                "arrow_function",
                "function_expression",
                "function",
            ):
                return child
    return None


def _span_with_export(node: Node) -> Node:
    """Return the wrapping `export ...` node if there is one, else the node itself.

    This keeps the `export` keyword inside the chunk so its lines line up with the file.
    """
    parent = node.parent
    if parent is not None and parent.type == "export_statement":
        return parent
    return node


def _produces_symbol(node: Node, lang: str) -> bool:
    """Return True if a top-level node yields its own symbol chunk (not module code)."""
    if node.type in _DEF_TYPES[lang]:
        return True
    if node.type == "decorated_definition":
        return True
    if node.type in ("lexical_declaration", "variable_declaration"):
        return _arrow_declarator(node) is not None
    # `export function ...`, `export const x = () => ...`, `export interface ...`
    if node.type == "export_statement":
        return any(_produces_symbol(child, lang) for child in node.named_children)
    return False


def extract_symbol_chunks(root: Node, source: bytes, lang: str, path: str) -> list[Chunk]:
    """Walk the syntax tree and emit one chunk per function/method/class/interface/type."""
    chunks: list[Chunk] = []

    def visit_body(def_node: Node) -> None:
        # Recurse into a definition's body so nested defs (e.g. class methods) are found.
        body = def_node.child_by_field_name("body")
        if body is not None:
            for child in body.named_children:
                visit(child)

    def visit(node: Node) -> None:
        # Python decorated def: emit ONE chunk covering the decorators, name from the inner def.
        if node.type == "decorated_definition":
            inner = _decorated_inner(node)
            if inner is not None:
                kind = _DEF_TYPES[lang].get(inner.type, "function")
                chunks.append(_make_chunk(node, inner, source, lang, path, kind))
                visit_body(inner)
                return

        # A normal named definition. Use a separate name so mypy keeps the str | None type
        # (the decorated branch above already binds `kind` to a plain str).
        def_kind = _DEF_TYPES[lang].get(node.type)
        if def_kind is not None:
            chunks.append(_make_chunk(_span_with_export(node), node, source, lang, path, def_kind))
            visit_body(node)
            return

        # JS/TS arrow function assigned to a const/let.
        if node.type in ("lexical_declaration", "variable_declaration"):
            declarator = _arrow_declarator(node)
            if declarator is not None:
                span = _span_with_export(node)
                chunks.append(_make_chunk(span, declarator, source, lang, path, "function"))
                return

        # Anything else: keep looking inside it (covers `export ...` wrappers too).
        for child in node.named_children:
            visit(child)

    visit(root)
    return chunks


def extract_module_chunks(root: Node, source: bytes, lang: str, path: str) -> list[Chunk]:
    """Group top-level code that is NOT a definition (imports, constants, scripts).

    Without this, module-level code would be silently un-retrievable. Contiguous runs
    of non-definition statements become one `<module>` chunk each.
    """
    chunks: list[Chunk] = []
    run: list[Node] = []

    def flush() -> None:
        if not run:
            return
        first, last = run[0], run[-1]
        chunks.append(
            Chunk(
                file_path=path,
                language=lang,
                symbol_name="<module>",
                type="module",
                start_line=first.start_point[0] + 1,
                end_line=last.end_point[0] + 1,
                code=source[first.start_byte : last.end_byte].decode("utf-8", "replace"),
            )
        )
        run.clear()

    for child in root.named_children:
        if _produces_symbol(child, lang):
            flush()  # a definition breaks the run
        else:
            run.append(child)
    flush()
    return chunks


def split_oversized(chunk: Chunk, max_lines: int) -> list[Chunk]:
    """Split a chunk that is too large into line-accurate parts.

    The embedding model has a token limit, so very long functions must be cut into
    sequential pieces. Each part keeps the parent name plus a part index and exact lines.
    """
    if (chunk.end_line - chunk.start_line + 1) <= max_lines:
        return [chunk]

    lines = chunk.code.split("\n")
    parts: list[Chunk] = []
    for index, start in enumerate(range(0, len(lines), max_lines)):
        block = lines[start : start + max_lines]
        part_start = chunk.start_line + start
        parts.append(
            Chunk(
                file_path=chunk.file_path,
                language=chunk.language,
                symbol_name=f"{chunk.symbol_name}#part{index}",
                type=chunk.type,
                start_line=part_start,
                end_line=part_start + len(block) - 1,
                code="\n".join(block),
            )
        )
    return parts


def chunk_text_fallback(path: str, source: bytes, max_lines: int = 40) -> list[Chunk]:
    """Split an unsupported file into plain fixed-size text chunks (never crash)."""
    text = source.decode("utf-8", "replace")
    lines = text.split("\n")
    chunks: list[Chunk] = []
    for start in range(0, len(lines), max_lines):
        block = lines[start : start + max_lines]
        if not "".join(block).strip():
            continue  # skip blocks that are entirely blank
        first_line = start + 1
        last_line = start + len(block)
        chunks.append(
            Chunk(
                file_path=path,
                language="text",
                symbol_name=f"<text:{first_line}-{last_line}>",
                type="text",
                start_line=first_line,
                end_line=last_line,
                code="\n".join(block),
            )
        )
    return chunks


def chunk_file(path: str, source: bytes, max_lines: int = 120) -> list[Chunk]:
    """Turn one file's bytes into a list of chunks (the main entry point).

    Supported languages are parsed by tree-sitter into symbol + module chunks, then any
    oversized chunk is sub-split. Unsupported files fall back to plain text chunks.
    """
    lang = language_for_path(path)
    if lang is None:
        return chunk_text_fallback(path, source)

    parser = parser_for(lang)
    tree = parser.parse(source)
    root = tree.root_node

    raw_chunks = extract_symbol_chunks(root, source, lang, path)
    raw_chunks += extract_module_chunks(root, source, lang, path)

    final: list[Chunk] = []
    for chunk in raw_chunks:
        final.extend(split_oversized(chunk, max_lines))
    return final
