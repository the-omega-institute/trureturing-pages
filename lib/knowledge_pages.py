"""Deterministic static concept pages for the release-bound truth DAG."""
from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import quote

_DIGEST = re.compile(r"sha256:([0-9a-f]{64})\Z")


def stable_file_name(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def title(node: dict[str, Any]) -> str:
    return str(node.get("human_title") or node.get("title") or node["id"])


def release_coordinate(graph: dict[str, Any]) -> tuple[str, str]:
    snap = graph.get("source_snapshot") or {}
    digest = str(snap.get("truth_release_digest") or "unreleased")
    match = _DIGEST.fullmatch(digest)
    return digest, match.group(1) if match else "unreleased"


def annotate_graph(graph: dict[str, Any]) -> dict[str, Any]:
    digest, key = release_coordinate(graph)
    seen: set[str] = set()
    for node in graph.get("nodes", []):
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id or node_id in seen:
            raise ValueError("knowledge-page node ids must be unique strings")
        seen.add(node_id)
        slug = stable_file_name(node_id)
        node["knowledge_page"] = f"knowledge/node/{slug}/"
        node["release_page"] = f"release/{key}/node/{slug}/"
        authored = bool(node.get("human_abstract") or node.get("human_theorem"))
        node["exposition_authority"] = (
            "blueprint-authored" if authored else "path-derived-fallback"
        )
    graph["knowledge_pages"] = {
        "schema": "pages-knowledge-index.v1",
        "release_digest": digest,
        "current_index": "knowledge/index.html",
        "immutable_root": f"release/{key}/node/",
        "node_count": len(graph.get("nodes", [])),
    }
    return graph


def endpoint(value: Any) -> str:
    return str(value.get("id")) if isinstance(value, dict) else str(value)


def relation_maps(
    graph: dict[str, Any],
) -> tuple[dict[str, list[tuple[str, str]]], dict[str, list[tuple[str, str]]]]:
    ids = {node["id"] for node in graph["nodes"]}
    parents: dict[str, list[tuple[str, str]]] = defaultdict(list)
    children: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for edge in graph.get("edges", []):
        source, target = endpoint(edge.get("source")), endpoint(edge.get("target"))
        layer = str(edge.get("layer") or "dependency")
        if source in ids and target in ids:
            parents[target].append((source, layer))
            children[source].append((target, layer))
    return parents, children


def relation_list(
    items: list[tuple[str, str]],
    nodes: dict[str, dict[str, Any]],
) -> str:
    if not items:
        return '<p class="knowledge-empty">None recorded in this release.</p>'
    rows = []
    for node_id, layer in sorted(
        items, key=lambda item: (title(nodes[item[0]]).casefold(), item)
    ):
        node = nodes[node_id]
        rows.append(
            f'<li><a href="../{stable_file_name(node_id)}/"><span>'
            f'{esc(title(node))}</span><small>{esc(layer)} · '
            f'{esc(node.get("status") or node.get("state"))}</small></a></li>'
        )
    return '<ul class="knowledge-relations">' + "".join(rows) + "</ul>"


def mini_graph(
    node: dict[str, Any],
    parents: list[tuple[str, str]],
    children: list[tuple[str, str]],
    nodes: dict[str, dict[str, Any]],
) -> str:
    upstream = [nodes[item[0]] for item in parents[:4]]
    downstream = [nodes[item[0]] for item in children[:4]]
    def boxes(items: list[dict[str, Any]], y: int, kind: str) -> str:
        if not items:
            return ""
        gap = 840 / (len(items) + 1)
        output = []
        for index, item in enumerate(items):
            x = gap * (index + 1) - 65
            output.append(
                f'<a href="../{stable_file_name(item["id"])}/">'
                f'<g class="mini-node {kind}" transform="translate({x:.0f} {y})">'
                f'<rect width="130" height="42" rx="9"/><text x="65" y="25" '
                f'text-anchor="middle">{esc(title(item)[:20])}</text></g></a>'
            )
        return "".join(output)
    lines = []
    for index in range(len(upstream)):
        x = 840 / (len(upstream) + 1) * (index + 1)
        lines.append(f'<path d="M{x:.0f} 66 L420 142"/>')
    for index in range(len(downstream)):
        x = 840 / (len(downstream) + 1) * (index + 1)
        lines.append(f'<path d="M420 184 L{x:.0f} 258"/>')
    center = (
        '<g class="mini-node current" transform="translate(355 142)">'
        f'<rect width="130" height="42" rx="9"/><text x="65" y="25" '
        f'text-anchor="middle">{esc(title(node)[:20])}</text></g>'
    )
    return (
        '<div class="mini-graph-shell"><svg class="mini-graph" '
        'viewBox="0 0 840 324" aria-label="Direct dependency neighborhood">'
        '<g class="mini-edges">' + "".join(lines) + "</g>"
        + boxes(upstream, 24, "upstream") + center
        + boxes(downstream, 258, "downstream") + "</svg></div>"
    )


def source_snapshot(graph: dict[str, Any]) -> dict[str, str]:
    snap = graph.get("source_snapshot") or {}
    return {
        "repo": str(snap.get("source_repo") or "the-omega-institute/trureturing"),
        "commit": str(snap.get("source_commit") or ""),
        "tree": str(snap.get("source_tree") or ""),
        "release": str(snap.get("truth_release_digest") or "unreleased"),
    }


def node_page(
    graph: dict[str, Any],
    node: dict[str, Any],
    parents: list[tuple[str, str]],
    children: list[tuple[str, str]],
    nodes: dict[str, dict[str, Any]],
    immutable: bool,
) -> str:
    snap = source_snapshot(graph)
    node_id = str(node["id"])
    slug = stable_file_name(node_id)
    root = "../../../../" if immutable else "../../../"
    index = "../../../../knowledge/" if immutable else "../../"
    current = f' <a href="../../../../knowledge/node/{slug}/">Current view</a>' if immutable else ""
    banner = f'<div class="release-banner">Immutable release view{current}</div>' if immutable else ""
    dag = root + "dag.html#node=" + quote(node_id, safe="")
    authored = node.get("exposition_authority") == "blueprint-authored"
    abstract = node.get("human_abstract") or (
        "No authored Blueprint abstract is available for this node."
    )
    theorem = (
        f'<section class="knowledge-theorem"><b>Authored theorem label</b>'
        f'<p>{esc(node["human_theorem"])}</p></section>'
        if node.get("human_theorem") else ""
    )
    source = ""
    if snap["commit"] and node.get("repo_path"):
        path = quote(str(node["repo_path"]), safe="/")
        url = f'https://github.com/{snap["repo"]}/blob/{snap["commit"]}/{path}'
        source = f'<a href="{esc(url)}" target="_blank" rel="noopener">Lean source</a>'
    metadata = [
        ("Status", node.get("status") or node.get("state")),
        ("Depth", node.get("true_depth", node.get("depth"))),
        ("Layer", node.get("layer")),
        ("Domain", node.get("domain")),
        ("Node ID", node_id),
        ("Repository path", node.get("repo_path")),
        ("Truth release", snap["release"]),
        ("Source commit", snap["commit"]),
        ("Source tree", snap["tree"]),
    ]
    rows = "".join(
        f"<div><dt>{esc(name)}</dt><dd>{esc(value)}</dd></div>"
        for name, value in metadata if value not in (None, "")
    )
    authority = "Authored exposition" if authored else "Path-derived label"
    state = str(node.get("state") or "").lower()
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title(node))} · trureturing knowledge</title>
<link rel="stylesheet" href="{root}assets/knowledge.css"></head>
<body class="knowledge-node-page">{banner}
<header class="knowledge-header"><a class="brand" href="{root}index.html">trureturing</a>
<nav><a href="{index}">Concept index</a><a href="{dag}">Open in DAG</a></nav></header>
<main class="knowledge-main"><article class="knowledge-article">
<header class="knowledge-hero"><div><p class="eyebrow">Human view of certified structure</p>
<h1>{esc(title(node))}</h1><p class="knowledge-lede">{esc(abstract)}</p></div>
<div class="status-stack"><span class="status-chip {esc(state)}">{esc(node.get("status"))}</span>
<span class="authority-chip">{authority}</span></div></header>{theorem}
<section class="knowledge-section"><div class="section-heading"><div>
<p class="section-kicker">Certified topology</p><h2>Direct dependency neighborhood</h2>
</div><a class="text-link" href="{dag}">Explore full map</a></div>
{mini_graph(node, parents, children, nodes)}</section>
<div class="knowledge-columns"><section class="knowledge-section">
<p class="section-kicker">Upstream</p><h2>Depends on</h2>{relation_list(parents, nodes)}
</section><section class="knowledge-section"><p class="section-kicker">Downstream</p>
<h2>Feeds into</h2>{relation_list(children, nodes)}</section></div>
<section class="knowledge-section provenance-section"><div class="section-heading">
<div><p class="section-kicker">Certified provenance</p><h2>Exact release coordinate</h2></div>
<div class="source-actions">{source}</div></div><dl class="knowledge-metadata">{rows}</dl></section>
<section class="authority-note"><h2>Authority boundary</h2><p>Dependency edges,
status, and source coordinates come from the verified release and certified topology.
Blueprint exposition is labeled separately. A fallback title carries no additional
mathematical authority.</p></section></article></main>
<footer class="knowledge-footer">Release-bound static concept page.</footer></body></html>
"""


def index_page(graph: dict[str, Any], nodes: list[dict[str, Any]]) -> str:
    snap = source_snapshot(graph)
    rows = []
    for node in sorted(nodes, key=lambda item: (str(item.get("domain")), title(item))):
        search = " ".join(str(node.get(key) or "") for key in (
            "human_title", "domain", "layer", "repo_path", "id", "status"
        )).casefold()
        rows.append(
            f'<a class="concept-row" href="node/{stable_file_name(node["id"])}/" '
            f'data-search="{esc(search)}"><span class="concept-state '
            f'{esc(str(node.get("state") or "").lower())}"></span><span>'
            f'<strong>{esc(title(node))}</strong><small>{esc(node.get("domain"))} · '
            f'{esc(node.get("status"))}</small></span><em>Depth '
            f'{esc(node.get("true_depth", node.get("depth", 0)))}</em></a>'
        )
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Concept index · trureturing</title>
<link rel="stylesheet" href="../assets/knowledge.css"></head>
<body class="knowledge-index-page"><header class="knowledge-header">
<a class="brand" href="../index.html">trureturing</a><nav>
<a href="../dag.html">Interactive DAG</a><a href="index.v1.json">Index data</a></nav></header>
<main class="knowledge-main"><section class="knowledge-index-hero">
<p class="eyebrow">Human-readable formal knowledge</p><h1>Concept index</h1>
<p>Static, shareable views of every visible truth node with release-bound structure
and separately labeled Blueprint exposition.</p><dl class="index-stats">
<div><dt>Nodes</dt><dd>{len(nodes)}</dd></div>
<div><dt>Truth release</dt><dd>{esc(snap["release"])}</dd></div>
<div><dt>Source</dt><dd>{esc(snap["commit"][:12] or "unavailable")}</dd></div></dl></section>
<section class="concept-browser"><div class="concept-toolbar">
<label for="concept-search">Find a concept</label>
<input id="concept-search" type="search" placeholder="Title, domain, path, or node ID">
<span id="concept-count">{len(nodes)} concepts</span></div>
<div class="concept-list">{"".join(rows)}</div></section></main>
<footer class="knowledge-footer">Generated from the graph used by the interactive DAG.</footer>
<script>(()=>{{const i=document.querySelector("#concept-search");
const r=[...document.querySelectorAll(".concept-row")],c=document.querySelector("#concept-count");
i.addEventListener("input",()=>{{const q=i.value.trim().toLowerCase();let n=0;
for(const x of r){{x.hidden=!!q&&!x.dataset.search.includes(q);if(!x.hidden)n++;}}
c.textContent=`${{n}} concept${{n===1?"":"s"}}`;}});}})();</script></body></html>
"""


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def render_knowledge_site(
    graph: dict[str, Any], site_root: str | Path
) -> dict[str, Any]:
    annotate_graph(graph)
    root = Path(site_root)
    nodes = graph["nodes"]
    by_id = {node["id"]: node for node in nodes}
    parents, children = relation_maps(graph)
    _, release_key = release_coordinate(graph)
    current = root / "knowledge/node"
    frozen = root / f"release/{release_key}/node"
    for directory in (current, frozen):
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True)
    for node_id, node in sorted(by_id.items()):
        slug = stable_file_name(node_id)
        args = (graph, node, parents[node_id], children[node_id], by_id)
        write(current / slug / "index.html", node_page(*args, immutable=False))
        write(frozen / slug / "index.html", node_page(*args, immutable=True))
    write(root / "knowledge/index.html", index_page(graph, nodes))
    snap = source_snapshot(graph)
    index = {
        "schema": "pages-knowledge-index.v1",
        "release_digest": snap["release"],
        "source_commit": snap["commit"],
        "source_tree": snap["tree"],
        "nodes": [
            {
                "id": node["id"], "title": title(node),
                "status": node.get("status"), "domain": node.get("domain"),
                "knowledge_page": node["knowledge_page"],
                "release_page": node["release_page"],
                "exposition_authority": node["exposition_authority"],
            }
            for node in sorted(nodes, key=lambda item: item["id"])
        ],
    }
    write(
        root / "knowledge/index.v1.json",
        json.dumps(index, indent=2, ensure_ascii=False) + "\n",
    )
    write(
        root / "knowledge/current-release.v1.json",
        json.dumps({
            "schema": "pages-current-knowledge-release.v1",
            "release_digest": snap["release"],
            "source_commit": snap["commit"],
            "source_tree": snap["tree"],
            "index": "knowledge/index.v1.json",
            "immutable_root": f"release/{release_key}/node/",
        }, indent=2) + "\n",
    )
    return index
