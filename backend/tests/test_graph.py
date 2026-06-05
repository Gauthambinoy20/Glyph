"""Tests for the dependency import graph."""

from app.analyze.graph import build_import_graph
from app.ingest.cache import embed_new_chunks
from app.store.chroma_store import ChromaStore

from tests.helpers import FakeEmbedder, make_chunk


def test_import_graph_links_internal_imports(tmp_path) -> None:
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    chunks = [
        make_chunk(
            "from app.store.chroma_store import ChromaStore\n",
            name="<module>",
            path="ingest/cache.py",
        ),
        make_chunk(
            "class ChromaStore:\n    pass\n", name="ChromaStore", path="store/chroma_store.py"
        ),
        make_chunk("x = 1\n", name="<module>", path="lonely.py"),
    ]
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))

    graph = build_import_graph(store)

    ids = {node["id"] for node in graph["nodes"]}
    assert {"ingest/cache.py", "store/chroma_store.py", "lonely.py"} <= ids
    # cache.py imports chroma_store -> there is an edge between them.
    assert {"source": "ingest/cache.py", "target": "store/chroma_store.py"} in graph["edges"]
    # lonely.py imports nothing internal -> it has no outgoing edge.
    assert all(edge["source"] != "lonely.py" for edge in graph["edges"])


def test_import_graph_resolves_relative_js_ts_imports(tmp_path) -> None:
    """Relative JS/TS imports (./x, ../y) resolve to the right file (covers _resolve_relative)."""
    store = ChromaStore(path=str(tmp_path / "c"), embed_model="fake", dim=8)
    chunks = [
        make_chunk(
            'import { thing } from "./util";\nexport function a() {}', name="a", path="src/app.ts"
        ),
        make_chunk('import { a } from "../src/app";\n', name="t", path="test/app.test.ts"),
        make_chunk("export const thing = 1;\n", name="thing", path="src/util.ts"),
    ]
    embed_new_chunks(chunks, store, FakeEmbedder(dim=8))

    edges = build_import_graph(store)["edges"]

    # app.ts imports ./util -> src/util.ts
    assert {"source": "src/app.ts", "target": "src/util.ts"} in edges
    # app.test.ts imports ../src/app -> src/app.ts
    assert {"source": "test/app.test.ts", "target": "src/app.ts"} in edges
