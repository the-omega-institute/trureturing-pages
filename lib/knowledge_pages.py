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
        set(items), key=lambda item: (title(nodes[item[0]]).casefold(), item)
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
    upstream = [nodes[key] for key in dict.fromkeys(item[0] for item in parents)]
    downstream = [nodes[key] for key in dict.fromkeys(item[0] for item in children)]
    import textwrap
    columns = 3
    center_y = 30 + ((len(upstream) + columns - 1) // columns) * 92
    downstream_y = center_y + 122
    height = downstream_y + max(1, (len(downstream) + columns - 1) // columns) * 92
    def boxes(items: list[dict[str, Any]], y: int, kind: str) -> str:
        if not items:
            return ""
        output = []
        for index, item in enumerate(items):
            x = 20 + (index % columns) * 280
            row_y = y + (index // columns) * 92
            lines = textwrap.wrap(title(item), width=31)[:3]
            text = "".join(f'<text x="125" y="{24 + line_index * 15}" text-anchor="middle">{esc(line)}</text>' for line_index, line in enumerate(lines))
            output.append(
                f'<a href="../{stable_file_name(item["id"])}/">'
                f'<g class="mini-node {kind}" transform="translate({x:.0f} {row_y})">'
                f'<title>{esc(title(item))}</title><rect width="250" height="68" rx="5"/>{text}</g></a>'
            )
        return "".join(output)
    lines = []
    for index in range(len(upstream)):
        x = 145 + (index % columns) * 280
        y = 24 + (index // columns) * 92 + 68
        lines.append(f'<path d="M{x} {y} L420 {center_y}"/>')
    for index in range(len(downstream)):
        x = 145 + (index % columns) * 280
        y = downstream_y + (index // columns) * 92
        lines.append(f'<path d="M420 {center_y + 68} L{x} {y}"/>')
    center = (
        f'<g class="mini-node current" transform="translate(295 {center_y})">'
        f'<title>{esc(title(node))}</title><rect width="250" height="68" rx="5"/>'
        + "".join(f'<text x="125" y="{24 + i * 15}" text-anchor="middle">{esc(line)}</text>' for i, line in enumerate(textwrap.wrap(title(node), width=31)[:3])) + '</g>'
    )
    return (
        '<div class="mini-graph-shell"><svg class="mini-graph" '
        f'viewBox="0 0 840 {height}" role="img" aria-label="Direct dependency neighborhood">'
        '<g class="mini-edges">' + "".join(lines) + "</g>"
        + boxes(upstream, 24, "upstream") + center
        + boxes(downstream, downstream_y, "downstream") + "</svg></div>"
    )


def relation_category(layer: str) -> str:
    if "intuition" in layer:
        return "advisory"
    if layer.startswith("blueprint-"):
        return "document"
    if "affinity" in layer:
        return "affinity"
    if layer in ("truth-dependency", "module-import", "frozen-prerequisite", "dependency"):
        return "proof"
    return "authored"


def site_header(root: str, active: str = "Library") -> str:
    links = [("Explore", "atlas.html"), ("Research", "research.html"), ("Library", "knowledge/"), ("Evolution", "evolution.html")]
    nav = "".join(f'<a href="{root}{path}"' + (' aria-current="page"' if label == active else '') + f'>{label}</a>' for label, path in links)
    return f'<header class="knowledge-header"><a class="brand" href="{root}index.html">trureturing</a><nav aria-label="Primary navigation">{nav}</nav><span class="header-coordinate"><a href="https://github.com/the-omega-institute/trureturing" target="_blank" rel="noreferrer">GitHub <i data-lucide="arrow-up-right"></i></a><span class="coordinate-label">MATHEMATICAL ATLAS</span></span></header>'


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
    relation_digest: str = "",
) -> str:
    snap = source_snapshot(graph)
    node_id = str(node["id"])
    slug = stable_file_name(node_id)
    root = "../../../../" if immutable else "../../../"
    index = "../../../../knowledge/" if immutable else "../../"
    current = f' <a href="../../../../knowledge/node/{slug}/">Current view</a>' if immutable else ""
    banner = f'<div class="release-banner">Immutable release view{current}</div>' if immutable else ""
    dag = root + "atlas.html#node=" + quote(node_id, safe="")
    research = root + "conjectures.html#node=" + quote(node_id, safe="")
    proof_parents = [item for item in parents if relation_category(item[1]) == "proof"]
    proof_children = [item for item in children if relation_category(item[1]) == "proof"]
    documents = [item for item in parents + children if relation_category(item[1]) == "document"]
    affinity = [item for item in parents + children if relation_category(item[1]) == "affinity"]
    other = [item for item in parents + children if relation_category(item[1]) in ("advisory", "authored")]
    _, release_key = release_coordinate(graph)
    relations_url = f'{root}release/{release_key}/relations.v1.json'
    authored = node.get("exposition_authority") == "blueprint-authored"
    abstract = node.get("human_abstract") or (
        "No authored Blueprint abstract is available for this node."
    )
    theorem = (
        f'<section class="knowledge-theorem"><b>THEOREM</b>'
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
    evolution_link = (
        f'<a class="toc-atlas" href="{root}evolution.html#node={quote(node_id, safe="")}">'
        'Architecture evolution <i data-lucide="arrow-up-right"></i></a>'
        if node.get("kind", "truth") == "truth" else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title(node))} · trureturing knowledge</title>
<meta name="theme-color" content="#090c10">
<link rel="stylesheet" href="{root}assets/knowledge.css">
<link rel="stylesheet" href="{root}assets/relation-map.css">
<link rel="stylesheet" href="{root}assets/site-theme.css">
<script defer src="{root}assets/vendor/lucide.min.js"></script>
<script defer src="{root}assets/vendor/d3.min.js"></script>
<script defer src="{root}assets/graph-relations.js"></script>
<script defer src="{root}assets/relation-map.js"></script>
<script defer src="{root}assets/knowledge-page.js"></script><script type="module" src="{root}assets/living-library.js"></script><link rel="stylesheet" href="{root}assets/living-library.css"></head>
<body class="knowledge-node-page site-themed" data-site-root="{root}" data-node-id="{esc(node_id)}" data-relations-url="{esc(relations_url)}" data-relations-digest="{esc(relation_digest)}" data-release-digest="{esc(snap['release'])}">{site_header(root)}{banner}
<main class="knowledge-main knowledge-layout">
<aside class="knowledge-toc"><a class="toc-back" href="{index}">All concepts</a><p class="eyebrow">CONCEPT WIKI</p>
<nav aria-label="On this page"><a href="#overview">Overview</a><a href="#relationships">Relationship maps</a><a href="#proof-paths">Proof paths</a><a href="#references">Related knowledge</a><a href="#content-history">Content history</a><a href="#provenance">Provenance</a></nav>
<div class="toc-coordinate"><span>{esc(node.get('domain'))}</span><strong>{esc(node.get('status') or node.get('state'))}</strong><small>RELEASE {esc(snap['release'].removeprefix('sha256:')[:12])}</small></div>
<a class="toc-atlas" href="{dag}">Open in Atlas <i data-lucide="arrow-up-right"></i></a>
{evolution_link}</aside>
<article class="knowledge-article">
<header class="knowledge-hero" id="overview"><div><p class="eyebrow">{esc(node.get('domain'))} / CONCEPT</p>
<h1>{esc(title(node))}</h1><p class="knowledge-lede">{esc(abstract)}</p></div>
<div class="status-stack"><span class="status-chip {esc(state)}">{esc(node.get("status"))}</span>
<span class="authority-chip">{authority}</span></div></header>
<div class="concept-metrics"><div><span>DIRECT PREREQUISITES</span><strong>{len(set(key for key, _ in proof_parents))}</strong></div><div><span>DIRECT CONSEQUENCES</span><strong>{len(set(key for key, _ in proof_children))}</strong></div><div><span>PROOF DEPTH</span><strong>{esc(node.get('true_depth', node.get('depth', 0)))}</strong></div><div><span>DOCUMENT LINKS</span><strong>{len(set(key for key, _ in documents))}</strong></div></div>{theorem}
<section class="knowledge-section" id="relationships"><div class="section-heading"><div>
<p class="section-kicker">RELATIONSHIP ATLAS</p><h2>Every connection, in context.</h2>
</div><a class="text-link" href="{dag}">Explore in 3D <i data-lucide="arrow-up-right"></i></a></div>
<div class="relationship-categories" role="tablist" aria-label="Relationship map type">
<button role="tab" aria-selected="true" data-relationship-type="all">All relations</button><button role="tab" aria-selected="false" data-relationship-type="proof">Proof paths</button><button role="tab" aria-selected="false" data-relationship-type="affinity">Structural affinity</button><button role="tab" aria-selected="false" data-relationship-type="document">Documents</button></div>
<div class="relationship-controls"><label>Range <select id="knowledge-range" aria-label="Relationship range"><option value="1">Direct</option><option value="2">Two hops</option><option value="all" selected>Full lineage</option></select></label><span id="knowledge-map-status" role="status">Direct recorded relationships</span></div>
<div id="knowledge-relation-map"></div><div data-relation-fallback>{mini_graph(node, proof_parents, proof_children, nodes)}</div>
<div class="relationship-key"><span><i></i>Proof dependency</span><span><i class="affinity"></i>Structural affinity</span><span><i class="document"></i>Document link</span></div></section>
<div class="knowledge-columns" id="proof-paths"><section class="knowledge-section">
<p class="section-kicker">Certified topology / UPSTREAM</p><h2>Prerequisites</h2><div data-rel-list="upstream">{relation_list(proof_parents, nodes)}</div>
</section><section class="knowledge-section"><p class="section-kicker">Certified topology / DOWNSTREAM</p>
<h2>Consequences</h2><div data-rel-list="downstream">{relation_list(proof_children, nodes)}</div></section></div>
<section class="knowledge-section" id="references"><p class="section-kicker">RELATED KNOWLEDGE</p><h2>Structural connections</h2><div data-rel-list="affinity">{relation_list(affinity, nodes)}</div>
<h2 class="reference-heading">Documents &amp; exposition</h2><div data-rel-list="document">{relation_list(documents, nodes)}</div>
<details class="other-relations"><summary>Other authored &amp; advisory relationships</summary><div data-rel-list="other">{relation_list(other, nodes)}</div></details></section>
<section class="knowledge-section" id="content-history"><p class="section-kicker">LIBRARY / RELEASE VERSIONS</p><h2>Content history</h2><div data-content-history="{esc(node_id)}">Loading release versions...</div><a href="{root}library-history.html#node={quote(node_id, safe='')}">Browse the archive</a></section>
<section class="knowledge-section provenance-section" id="provenance"><div class="section-heading">
<div><p class="section-kicker">Certified provenance</p><h2>Exact release coordinate</h2></div>
<div class="source-actions">{source}<a href="{research}">Research workspace</a></div></div><dl class="knowledge-metadata">{rows}</dl></section>
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
            f'data-search="{esc(search)}" data-domain="{esc(node.get("domain") or "Other")}" data-kind="{esc(node.get("kind") or "truth")}"><span class="concept-state '
            f'{esc(str(node.get("state") or "").lower())}"></span><span>'
            f'<strong>{esc(title(node))}</strong><small>{esc(node.get("domain"))} · '
            f'{esc(node.get("status"))}</small></span><em>Depth '
            f'{esc(node.get("true_depth", node.get("depth", 0)))}</em></a>'
        )
    domains = "".join(f'<option value="{esc(domain)}">{esc(domain)}</option>' for domain in sorted({str(node.get("domain") or "Other") for node in nodes}))
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Concept index · trureturing</title>
<meta name="theme-color" content="#090c10"><link rel="stylesheet" href="../assets/knowledge.css">
<link rel="stylesheet" href="../assets/site-theme.css"><script defer src="../assets/vendor/lucide.min.js"></script><script defer src="../assets/knowledge-page.js"></script></head>
<body class="knowledge-index-page site-themed">{site_header('../')}
<main class="knowledge-main"><section class="knowledge-index-hero">
<p class="eyebrow">THE COLLECTION / WIKI</p><h1>Concept Library<span>.</span></h1>
<p>Formal mathematics, its connections, and the ideas behind each proof.</p><dl class="index-stats">
<div><dt>Concepts &amp; documents</dt><dd>{len(nodes):,}</dd></div>
<div><dt>Truth release</dt><dd>{esc(snap["release"])}</dd></div>
<div><dt>Source</dt><dd>{esc(snap["commit"][:12] or "unavailable")}</dd></div></dl></section>
<section class="concept-browser"><div class="concept-toolbar">
<label for="concept-search">Find a concept</label>
<input id="concept-search" type="search" placeholder="Title, domain, path, or node ID">
<select id="concept-domain" aria-label="Filter by domain"><option value="">All domains</option>{domains}</select>
<select id="concept-kind" aria-label="Filter by entry type"><option value="">All entries</option><option value="truth">Mathematical concepts</option><option value="blueprint">Documents</option></select></div>
<div class="library-results-bar"><span id="concept-count">{len(nodes)} entries</span><a href="../library-history.html">Content &amp; release history <i data-lucide="history"></i></a><a href="../conclusions.html">Selected conclusions</a></div>
<div class="concept-list">{"".join(rows)}</div><p id="library-empty" hidden>No entries match these filters.</p>
<div class="library-pagination" hidden><button type="button" id="library-previous" aria-label="Previous results" title="Previous results"><i data-lucide="arrow-left"></i></button><span id="library-page"></span><button type="button" id="library-next" aria-label="Next results" title="Next results"><i data-lucide="arrow-right"></i></button></div></section></main>
<footer class="knowledge-footer">Generated from the graph used by the interactive DAG.</footer>
</body></html>
"""


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def render_knowledge_site(
    graph: dict[str, Any], site_root: str | Path, immutable_only: bool = False,
    archive_snapshot_digest: str | None = None,
) -> dict[str, Any]:
    annotate_graph(graph)
    root = Path(site_root)
    nodes = graph["nodes"]
    by_id = {node["id"]: node for node in nodes}
    parents, children = relation_maps(graph)
    _, release_key = release_coordinate(graph)
    ordered = sorted(nodes, key=lambda item: item["id"])
    offsets = {node["id"]: index for index, node in enumerate(ordered)}
    relation_data = {
        "schema_version": "pages-knowledge-relations.v1",
        "truth_release_digest": release_coordinate(graph)[0],
        "nodes": [{"id": node["id"], "title": title(node), "kind": node.get("kind") or "truth", "domain": node.get("domain"), "state": node.get("state"), "status": node.get("status"), "slug": stable_file_name(node["id"])} for node in ordered],
        "edges": [[offsets[endpoint(edge["source"])] , offsets[endpoint(edge["target"])], edge.get("layer") or "dependency", edge.get("status") or ""] for edge in graph.get("edges", []) if endpoint(edge["source"]) in offsets and endpoint(edge["target"]) in offsets],
    }
    relation_text = json.dumps(relation_data, ensure_ascii=False, separators=(",", ":")) + "\n"
    relation_digest = "sha256:" + hashlib.sha256(relation_text.encode()).hexdigest()
    write(root / f"release/{release_key}/relations.v1.json", relation_text)
    current = root / "knowledge/node"
    frozen = root / f"release/{release_key}/node"
    for directory in ((frozen,) if immutable_only else (current, frozen)):
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True)
    for node_id, node in sorted(by_id.items()):
        slug = stable_file_name(node_id)
        args = (graph, node, parents[node_id], children[node_id], by_id)
        if not immutable_only:
            write(current / slug / "index.html", node_page(*args, immutable=False, relation_digest=relation_digest))
        if archive_snapshot_digest:
            if not _DIGEST.fullmatch(archive_snapshot_digest):
                raise ValueError("Archived Wiki requires a snapshot digest.")
            target = '../../../../library-version.html#snapshot=' + quote(archive_snapshot_digest, safe='') + '&node=' + quote(node_id, safe='')
            redirect = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title(node))} | Archived Library</title><link rel="stylesheet" href="../../../../assets/site-theme.css"><script>location.replace(new URL({json.dumps(target)}, location.href));</script></head><body class="site-themed"><main class="site-main"><h1>{esc(title(node))}</h1><a href="{esc(target)}">Read immutable release version</a><p>{esc(release_coordinate(graph)[0])}</p></main></body></html>'''
            write(frozen / slug / "index.html", redirect)
        else:
            write(frozen / slug / "index.html", node_page(*args, immutable=True, relation_digest=relation_digest))
    if immutable_only:
        return {"release_digest": release_coordinate(graph)[0]}
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


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph", type=Path)
    parser.add_argument("site", type=Path)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    graph_bytes = args.graph.read_bytes()
    graph = json.loads(graph_bytes)
    if args.manifest:
        manifest = json.loads(args.manifest.read_bytes())
        if "sha256:" + hashlib.sha256(graph_bytes).hexdigest() != manifest["atlas_graph_digest"]:
            raise ValueError("Atlas graph does not match its manifest")
        if release_coordinate(graph)[0] != manifest["truth_release_digest"]:
            raise ValueError("Atlas graph and manifest use different releases")
    render_knowledge_site(graph, args.site)
