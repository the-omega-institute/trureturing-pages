"""Project a real trureturing truth-graph.v1.json (canonical lower_snake_case schema)
into the pages display schema consumed by site/dag.html.

Input truth-graph schema (produced by StrataLint dag-render):
  {"schema":"stratalint.truth-graph.v1","truth":{"nodes":[{depth,gid,module_name,repo_path,state}],
   "edges":[{dependency,dependent}],"state_counts":{...}}, "documents":{...},"joins":{...},"provenance":{...}}

Display schema (site/data/truth-graph.v1.json), consumed by dag.html's fetch/renderNodes:
  {"schema_version":"truth-graph.v1","synthetic":false,"source_snapshot":{...},
   "counts":{...},"nodes":[{"id","title","status","summary","depth"}]}

The projection keeps the mathematical DAG (closed/open/tail nodes carrying a gid) and drops
the repository "semantic" file nodes, which are display noise. Deterministic: nodes sorted by
(status rank, gid) so the same inputs always yield byte-identical output.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

# Math states shown in the DAG view (semantic repo-file nodes are excluded as noise).
_MATH_STATES = ("closed", "open", "tail")
_STATUS_TITLE = {"closed": "Closed", "open": "Open", "tail": "Tail", "semantic": "Semantic"}
_STATUS_RANK = {"open": 0, "tail": 1, "closed": 2}  # frontier first


def _display_status(state: str) -> str:
    return _STATUS_TITLE.get(state, state.capitalize())


def project(truth_graph: dict, source_snapshot: dict | None = None) -> dict:
    """Return the pages display projection of a real truth-graph dict. Pure + deterministic."""
    truth = truth_graph["truth"]
    raw_nodes = truth["nodes"]
    math_nodes = [n for n in raw_nodes if n.get("gid") and n.get("state") in _MATH_STATES]

    def render(node: dict) -> dict:
        gid = node["gid"]
        module = node.get("module_name") or gid
        state = node["state"]
        depth = node.get("depth")
        return {
            "id": gid,
            "title": module,
            "status": _display_status(state),
            "summary": f"{_display_status(state)} · depth {depth} · {node.get('repo_path', '')}".strip(),
            "depth": depth,
        }

    nodes = sorted(
        (render(n) for n in math_nodes),
        key=lambda d: (_STATUS_RANK.get(d["status"].lower(), 9), d["id"]),
    )

    # Math-state nodes that carry no gid (e.g. the umbrella root module `Trureturing`, which imports
    # everything and is not itself a theorem) cannot be linked or displayed, so they are filtered out.
    # Account for them explicitly so the counts stay closed: dag totals == shown + filtered_no_gid.
    filtered_no_gid = sum(1 for n in raw_nodes if n.get("state") in _MATH_STATES and not n.get("gid"))
    shown_by_status = Counter(n["status"] for n in nodes)
    state_counts = truth.get("state_counts", {})
    counts = {
        "shown": len(nodes),
        "shown_closed": shown_by_status.get("Closed", 0),
        "shown_open": shown_by_status.get("Open", 0),
        "shown_tail": shown_by_status.get("Tail", 0),
        "dag_closed": state_counts.get("closed"),
        "dag_open": state_counts.get("open"),
        "dag_tail": state_counts.get("tail"),
        "dag_semantic": state_counts.get("semantic"),
        "filtered_no_gid": filtered_no_gid,
        "edges": len(truth.get("edges", [])),
    }

    snap = source_snapshot or {}
    source_block = {
        "source_repo": snap.get("source_repo"),
        "source_commit": snap.get("source_commit"),
        "truth_graph_sha256": snap.get("truth_graph_sha256"),
        "blessed_by": snap.get("blessed_by"),
        "approved_at": snap.get("derived_at"),
    }

    return {
        "schema_version": "truth-graph.v1",
        "synthetic": False,
        "source_snapshot": source_block,
        "counts": counts,
        "note": (
            f"Showing {len(nodes)} of {len(nodes) + filtered_no_gid} mathematical nodes; "
            f"{filtered_no_gid} carry no GID (the umbrella root module) and are not listed."
        ),
        "nodes": nodes,
    }


def project_files(truth_graph_path: str, output_path: str, source_snapshot_path: str | None = None) -> dict:
    tg_bytes = Path(truth_graph_path).read_bytes()
    snap = json.loads(Path(source_snapshot_path).read_bytes()) if source_snapshot_path else None
    # Bind the raw truth-graph bytes to the blessing: the projection must be built
    # from exactly the graph the snapshot pins, not merely copy the snapshot's
    # digest into the output. A mismatch means the wrong raw graph would be
    # published under the blessed digest, so fail before writing (nonzero exit).
    if snap is not None:
        expected = snap.get("truth_graph_sha256")
        actual = hashlib.sha256(tg_bytes).hexdigest()
        if expected != actual:
            raise SystemExit(
                f"raw truth-graph digest {actual} does not match blessed "
                f"truth_graph_sha256 {expected}")
    tg = json.loads(tg_bytes)
    result = project(tg, snap)
    Path(output_path).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    import sys

    tg_path, out_path = sys.argv[1], sys.argv[2]
    snap_path = sys.argv[3] if len(sys.argv) > 3 else None
    r = project_files(tg_path, out_path, snap_path)
    c = r["counts"]
    print(f"projected {c['shown']} shown math nodes "
          f"(closed={c['shown_closed']} open={c['shown_open']} tail={c['shown_tail']}; "
          f"dag_closed={c['dag_closed']} filtered_no_gid={c['filtered_no_gid']}) -> {out_path}")
