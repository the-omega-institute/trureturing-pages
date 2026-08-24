"""Project a real trureturing truth-graph.v1.json (canonical lower_snake_case schema)
into the pages display schema consumed by site/dag.html.

Input truth-graph schema (produced by StrataLint dag-render):
  {"schema":"stratalint.truth-graph.v1","truth":{"nodes":[{depth,gid,module_name,repo_path,state}],
   "edges":[{dependency,dependent}],"state_counts":{...}}, "documents":{...},"joins":{...},"provenance":{...}}

Display schema (site/data/truth-graph.v1.json), consumed by dag.html's graph renderer:
  {"schema_version":"truth-graph.v1","synthetic":false,"source_snapshot":{...},
   "counts":{...},
   "nodes":[{"id","gid","title","status","state","summary","depth","repo_path","layer","domain"}],
   "edges":[{"source","target","dependency","dependent"}]}

The projection keeps every real Lean truth node (closed/open/tail .lean files), including the
GID-less umbrella module, and every dependency edge whose endpoints are both kept. Repository
"semantic" file nodes remain display noise. Deterministic: nodes and edges are sorted so the same
inputs always yield byte-identical output.
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


def _node_id(node: dict) -> str:
    """Use the canonical GID, with a stable repo-path fallback for the umbrella module."""
    gid = node.get("gid")
    if gid:
        return gid
    repo_path = node["repo_path"]
    return repo_path[:-5] if repo_path.endswith(".lean") else repo_path


def _grouping(gid: str | None, repo_path: str) -> tuple[str, str]:
    """Return tower layer and domain labels derived from the canonical path."""
    parts = (gid or repo_path.removesuffix(".lean")).split("/")
    if len(parts) >= 3:
        return "/".join(parts[:2]), parts[2]
    return "Root", parts[0]


def project(truth_graph: dict, source_snapshot: dict | None = None) -> dict:
    """Return the pages display projection of a real truth-graph dict. Pure + deterministic."""
    truth = truth_graph["truth"]
    raw_nodes = truth["nodes"]
    math_nodes = [
        n for n in raw_nodes
        if n.get("state") in _MATH_STATES and n.get("repo_path", "").endswith(".lean")
    ]

    def render(node: dict) -> dict:
        gid = node.get("gid")
        node_id = _node_id(node)
        module = node.get("module_name") or gid or node_id
        state = node["state"]
        depth = node.get("depth")
        repo_path = node["repo_path"]
        layer, domain = _grouping(gid, repo_path)
        return {
            "id": node_id,
            "gid": gid,
            "title": module,
            "status": _display_status(state),
            "state": state,
            "summary": f"{_display_status(state)} · depth {depth} · {repo_path}",
            "depth": depth,
            "repo_path": repo_path,
            "layer": layer,
            "domain": domain,
        }

    nodes = sorted(
        (render(n) for n in math_nodes),
        key=lambda d: (_STATUS_RANK.get(d["state"], 9), d["id"]),
    )

    id_by_path = {node["repo_path"]: _node_id(node) for node in math_nodes}
    raw_edges = truth.get("edges", [])
    edges = sorted(
        (
            {
                "source": id_by_path[edge["dependency"]],
                "target": id_by_path[edge["dependent"]],
                "dependency": edge["dependency"],
                "dependent": edge["dependent"],
            }
            for edge in raw_edges
            if edge.get("dependency") in id_by_path and edge.get("dependent") in id_by_path
        ),
        key=lambda edge: (edge["source"], edge["target"]),
    )

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
        "nodes_without_gid": sum(1 for n in math_nodes if not n.get("gid")),
        "source_edges": len(raw_edges),
        "filtered_edges": len(raw_edges) - len(edges),
        "edges": len(edges),
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
            f"Showing all {len(nodes)} real Lean truth nodes and {len(edges)} dependency edges; "
            f"{len(raw_edges) - len(edges)} edges had endpoints outside the display truth set."
        ),
        "nodes": nodes,
        "edges": edges,
    }


def project_files(
    truth_graph_path: str,
    output_path: str,
    source_snapshot_path: str | None = None,
    expected_digest: str | None = None,
) -> dict:
    tg_bytes = Path(truth_graph_path).read_bytes()
    snap = json.loads(Path(source_snapshot_path).read_bytes()) if source_snapshot_path else None
    actual = hashlib.sha256(tg_bytes).hexdigest()
    # Bind the raw truth-graph bytes to the blessing: the projection must be built
    # from exactly the graph the snapshot pins, not merely copy the snapshot's
    # digest into the output. A mismatch means the wrong raw graph would be
    # published under the blessed digest, so fail before writing (nonzero exit).
    if snap is not None:
        expected = snap.get("truth_graph_sha256")
        if expected != actual:
            raise SystemExit(
                f"raw truth-graph digest {actual} does not match blessed "
                f"truth_graph_sha256 {expected}")
    # Bind the write to the caller's expected digest too. The caller (act) passes
    # the triggering event's digest; if the current inputs have advanced past it,
    # fail before writing so a stale trigger cannot mutate the published output
    # (closes the read-current-inputs / phantom-publish race).
    if expected_digest is not None and expected_digest != actual:
        raise SystemExit(
            f"raw truth-graph digest {actual} does not match expected "
            f"digest {expected_digest} (inputs advanced past the trigger)")
    tg = json.loads(tg_bytes)
    result = project(tg, snap)
    Path(output_path).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    import sys

    tg_path, out_path = sys.argv[1], sys.argv[2]
    snap_path = sys.argv[3] if len(sys.argv) > 3 else None
    expected_digest = sys.argv[4] if len(sys.argv) > 4 else None
    r = project_files(tg_path, out_path, snap_path, expected_digest)
    c = r["counts"]
    print(f"projected {c['shown']} shown math nodes "
          f"(closed={c['shown_closed']} open={c['shown_open']} tail={c['shown_tail']}; "
          f"edges={c['edges']} filtered_edges={c['filtered_edges']}) -> {out_path}")
