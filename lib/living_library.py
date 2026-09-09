"""Release-bound content, problem dossiers, and an append-only Library archive."""
from __future__ import annotations

import argparse
import hashlib
import gzip
import io
import json
import re
import subprocess
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import urlopen

import yaml
from markdown_it import MarkdownIt
from mdit_py_plugins.texmath import texmath_plugin

from lib.knowledge_pages import esc, render_knowledge_site, site_header, stable_file_name, write

SCHEMA = "pages-library-history.v1"
SNAPSHOT = "pages-library-snapshot.v1"
DIGEST = re.compile(r"sha256:[a-f0-9]{64}\Z")
SECTIONS = ("Problem", "Motivation", "Gap", "Route", "Falsifier", "Evidence", "Triage", "ASSUMED-UNVERIFIED")
MARKDOWN = MarkdownIt("commonmark", {"html": False}).use(texmath_plugin, delimiters="brackets")


def render_math(renderer, tokens, idx, options, env):
    block = tokens[idx].type != "math_inline"
    tag = "div" if block else "span"
    return f'<{tag} class="math-{ "display" if block else "inline" }">{esc(tokens[idx].content)}</{tag}>'


for math_rule in ("math_inline", "math_block", "math_block_eqno"):
    MARKDOWN.add_render_rule(math_rule, render_math)


class CatalogLoader(yaml.BaseLoader):
    def construct_mapping(self, node, deep=False):
        keys = [key.value for key, _ in node.value]
        if len(set(keys)) != len(keys):
            raise ValueError("Duplicate problem metadata key.")
        return super().construct_mapping(node, deep)


def digest(raw: bytes) -> str:
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def compress(raw: bytes) -> bytes:
    buffer = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buffer, mtime=0) as stream:
        stream.write(raw)
    return buffer.getvalue()


def archive_json(entry: dict, raw: bytes) -> dict:
    return json.loads(gzip.decompress(raw) if entry["path"].endswith(".gz") else raw)


def write_bytes(path: Path, content: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_bytes(content)
    temp.replace(path)


def git(repo: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(repo), *args])


def parse_problem(text: str, filename: str) -> dict:
    parts = text.split("\n---\n", 1)
    if not text.startswith("---\n") or len(parts) != 2:
        raise ValueError(f"Missing problem frontmatter: {filename}")
    meta = yaml.load(parts[0][4:], Loader=CatalogLoader)
    if not isinstance(meta, dict):
        raise ValueError(f"Invalid problem metadata: {filename}")
    slug = meta.get("slug", "")
    if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or filename != slug + ".md":
        raise ValueError(f"Invalid problem slug: {filename}")
    if meta.get("triage") not in ("theorem", "window", "wall"):
        raise ValueError(f"Invalid problem triage: {slug}")
    if "doi" in meta:
        if not isinstance(meta["doi"], str) or not re.fullmatch(r"10\.\d{4,9}/[^\s<>\"]+", meta["doi"]):
            raise ValueError(f"Invalid DOI source: {slug}")
        source = {"doi": meta["doi"]}
    else:
        if not isinstance(meta.get("arxiv_id"), str) or not re.fullmatch(r"\d{4}\.\d{4,5}(?:v\d+)?", meta["arxiv_id"]):
            raise ValueError(f"Invalid arXiv source: {slug}")
        source = {"arxiv_id": meta["arxiv_id"]}
    gids = meta.get("motivation_gids")
    if not isinstance(gids, list) or not gids or any(not isinstance(gid, str) or not gid for gid in gids) or len(set(gids)) != len(gids):
        raise ValueError(f"Invalid problem anchors: {slug}")
    tokens = MARKDOWN.parse(parts[1])
    title, sections, current = None, {}, None
    # CommonMark headings give section boundaries without mistaking fenced examples for headings.
    for i, token in enumerate(tokens):
        if token.type != "heading_open":
            continue
        heading = tokens[i + 1].content
        if token.tag == "h1" and title is None:
            title = heading
        if token.tag == "h2":
            if heading in sections:
                raise ValueError(f"Duplicate problem section: {slug}/{heading}")
            sections[heading] = {"start": token.map[1]}
            if current:
                sections[current]["end"] = token.map[0]
            current = heading
    if not title or set(sections) != set(SECTIONS):
        raise ValueError(f"Problem sections differ from catalog contract: {slug}")
    lines = parts[1].splitlines()
    content = {name: "\n".join(lines[item["start"]:item.get("end", len(lines))]).strip() for name, item in sections.items()}
    if any(not value for value in content.values()):
        raise ValueError(f"Empty problem section: {slug}")
    return {"slug": slug, "title": title, "bibkey": str(meta.get("bibkey", "")), **source, "triage": meta["triage"], "motivation_gids": gids, "sections": content, "source_digest": digest(text.encode()), "literature_status": "not-rechecked", "last_literature_check": None, "route_status": "proposed"}


def source_material(repo: Path, commit: str) -> tuple[list[dict], dict[str, str]]:
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Research source must be an exact commit.")
    objects = {}
    for record in git(repo, "ls-tree", "-rz", commit).split(b"\0"):
        if not record:
            continue
        meta, path = record.split(b"\t", 1)
        mode, kind, object_id = meta.decode().split()
        if kind == "blob" and mode in ("100644", "100755"):
            objects[path.decode()] = object_id
    problems = [parse_problem(git(repo, "show", f"{commit}:{path}").decode(), Path(path).name)
                for path in sorted(objects) if path.startswith("Problems/") and path.count("/") == 1 and path.endswith(".md")]
    try:
        matches = git(repo, "grep", "-l", "-z", "-F", "scribe-open-problem-resolution-v", commit, "--", "Blueprint/*.md")
    except subprocess.CalledProcessError as error:
        if error.returncode != 1:
            raise
        matches = b""
    blueprints = {}
    for match in matches.split(b"\0"):
        if match:
            path = match.decode().removeprefix(commit + ":")
            blueprints[path] = git(repo, "show", f"{commit}:{path}").decode()
    from lib.problem_resolutions import bind_resolutions
    problems = bind_resolutions(problems, blueprints, objects)
    return problems, objects


def create_snapshot(graph: dict, graph_digest: str, problems: list[dict], blobs: dict[str, str]) -> dict:
    fields = ("id", "gid", "title", "human_title", "human_abstract", "human_theorem", "kind", "domain", "layer", "state", "status", "repo_path", "true_depth", "depth")
    nodes = []
    for original in sorted(graph["nodes"], key=lambda n: n["id"]):
        node = {key: original[key] for key in fields if key in original}
        node["source_blob"] = blobs.get(node.get("repo_path"))
        content = {key: node.get(key) for key in ("title", "human_title", "human_abstract", "human_theorem", "repo_path", "source_blob", "state", "status")}
        node["content_digest"] = digest(json.dumps(content, sort_keys=True, ensure_ascii=False).encode())
        nodes.append(node)
    edges = [{key: edge[key] for key in ("source", "target", "layer", "status") if key in edge} for edge in graph["edges"]]
    return {"schema_version": SNAPSHOT, "truth_release_digest": graph["source_snapshot"]["truth_release_digest"], "atlas_graph_digest": graph_digest, "graph": {"source_snapshot": graph["source_snapshot"], "nodes": nodes, "edges": edges}, "problems": problems}


def validate_index(index: dict) -> dict:
    if index.get("schema_version") != SCHEMA or not isinstance(index.get("entries"), list) or not index["entries"]:
        raise ValueError("Invalid Library history index.")
    seen = set()
    for entry in index["entries"]:
        if not all(isinstance(entry.get(k), str) and DIGEST.fullmatch(entry[k]) for k in ("digest", "truth_release_digest", "atlas_graph_digest")):
            raise ValueError("Invalid Library release coordinate.")
        if entry["path"] not in (f'data/library/{entry["digest"][7:]}.json', f'data/library/{entry["digest"][7:]}.json.gz') or entry["digest"] in seen:
            raise ValueError("Invalid Library archive path or duplicate snapshot.")
        seen.add(entry["digest"])
    if index.get("current_truth_release_digest") != index["entries"][-1]["truth_release_digest"]:
        raise ValueError("Library history does not end at current release.")
    return index


def read_remote(base: str, path: str, optional=False) -> bytes | None:
    parsed = urlsplit(base)
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1")):
        raise ValueError("Previous Library deployment must use HTTPS.")
    try:
        with urlopen(urljoin(base.rstrip("/") + "/", path), timeout=30) as response:
            return response.read()
    except HTTPError as error:
        if optional and error.code == 404:
            return None
        raise


def page_shell(title: str, root: str, body: str, active="Research", appearance=None) -> str:
    theme = " research-editorial" if appearance == "editorial" else ""
    color = "#f7f8fa" if appearance == "editorial" else "#090c10"
    critical = '<style>html,body{background:#f7f8fa;color:#232629}body{transition:background-color .24s ease,color .24s ease}</style>' if appearance == "editorial" else ''
    if appearance == "editorial":
        critical += f'<link rel="stylesheet" href="{root}assets/research-editorial.css">'
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="{color}"><title>{esc(title)} | trureturing</title>{critical}
<link rel="stylesheet" href="{root}assets/site-theme.css"><link rel="stylesheet" href="{root}assets/relation-map.css"><link rel="stylesheet" href="{root}assets/vendor/katex/katex.min.css"><link rel="stylesheet" href="{root}assets/living-library.css">
<script defer src="{root}assets/vendor/lucide.min.js"></script><script defer src="{root}assets/vendor/d3.min.js"></script><script defer src="{root}assets/vendor/katex/katex.min.js"></script><script defer src="{root}assets/graph-relations.js"></script><script defer src="{root}assets/relation-map.js"></script><script type="module" src="{root}assets/living-library.js"></script></head><body class="site-themed living-page{theme}" data-site-root="{root}">{site_header(root, active)}{body}<footer class="site-footer">THE OMEGA INSTITUTE / LIVING MATHEMATICS <a href="{root}dag.html">Analysis console</a></footer></body></html>'''


def render_research(snapshot: dict, output: Path, entry: dict):
    graph, problems = snapshot["graph"], snapshot["problems"]
    nodes = {n["id"]: n for n in graph["nodes"]}
    snap = graph["source_snapshot"]
    commit = snap.get("source_commit", "")
    repo = "https://github.com/the-omega-institute/trureturing"
    rows = []
    triage = {"theorem": "Focused target", "window": "Exploratory", "wall": "Long horizon"}
    for problem in problems:
        slug = problem["slug"]
        source_label = problem.get("doi") or "arXiv:" + problem["arxiv_id"]
        source_url = "https://doi.org/" + quote(problem["doi"], safe="/") if problem.get("doi") else "https://arxiv.org/abs/" + problem["arxiv_id"]
        resolution = problem.get("resolution")
        route_label = "Source-recorded " + resolution["kind"] if resolution else "Proposed route"
        status_label = "Repository record: " + resolution["kind"] if resolution else "Our route: proposed"
        resolution_link = f'<a href="{repo}/blob/{commit}/{resolution["source_path"]}">Resolution source: {esc(resolution["declaration_gid"])}</a>' if resolution else ""
        anchors = [nodes[gid] for gid in problem["motivation_gids"] if gid in nodes]
        families = sorted({str(n.get("domain", "Unclassified")) for n in anchors})
        rows.append(f'<a class="problem-row" href="research/{slug}/" data-triage="{problem["triage"]}" data-gids="{esc(json.dumps(problem["motivation_gids"]))}" data-search="{esc((problem["title"] + " " + " ".join(families) + " " + problem["sections"]["Problem"] + " " + source_label).lower())}"><span class="problem-number">{len(rows)+1:02}</span><div><p class="eyebrow">{esc(" / ".join(families[:3]))}</p><h2>{esc(problem["title"])}</h2><p>{esc(triage[problem["triage"]])} <span class="route-chip">{esc(route_label)}</span></p></div><span class="problem-anchor-count">{len(anchors)}<small>released anchors</small></span><i data-lucide="arrow-up-right"></i></a>')
        root = "../../"
        links = []
        for gid in problem["motivation_gids"]:
            node = nodes.get(gid)
            url = root + f"knowledge/node/{stable_file_name(gid)}/" if node else repo + f"/blob/{commit}/{quote(gid, safe='/')}.lean"
            links.append(f'<li><a href="{url}">{esc(node.get("human_title") or node.get("title") or gid) if node else esc(gid)}</a><small>{"Released anchor" if node else "Absent from this graph"}</small></li>')
        sections = []
        labels = {"Problem": "The question", "Motivation": "Our foothold", "Gap": "Missing bridges", "Route": "Proposed approach", "Falsifier": "What would falsify this route", "Evidence": "Evidence to collect", "Triage": "Scope assessment", "ASSUMED-UNVERIFIED": "Unverified assumptions"}
        for name in SECTIONS:
            section_id = name.lower()
            sections.append(f'<section id="{section_id}" class="dossier-section"><p class="eyebrow">{esc(name)}</p><h2>{labels[name]}</h2><div class="prose">{MARKDOWN.render(problem["sections"][name])}</div></section>')
        body = f'''<main class="dossier-layout"><aside class="dossier-toc"><a href="{root}conjectures.html">All conjectures</a><p class="eyebrow">PROBLEM DOSSIER</p><nav aria-label="Problem sections">{''.join(f'<a href="#{name.lower()}">{labels[name]}</a>' for name in SECTIONS)}</nav><a href="{root}evolution.html">Evolution</a></aside><article class="dossier-main"><header class="dossier-heading"><p class="eyebrow">RESEARCH / {esc(triage[problem['triage']])}</p><h1>{esc(problem['title'])}</h1><div class="dossier-status"><span>Literature status: not rechecked</span><span>{esc(status_label)}</span></div><div class="dossier-source">{resolution_link}<a href="{esc(source_url)}">{esc(source_label)}</a><a href="{repo}/blob/{commit}/Problems/{slug}.md">Source dossier</a><a href="{root}library-history.html#release={snapshot['truth_release_digest']}">Release {snapshot['truth_release_digest'][7:19]}</a></div></header><section class="bridge-section"><div class="section-heading"><div><p class="eyebrow">RELEASED FOUNDATIONS / PROPOSED CONNECTION</p><h2>Research connections</h2></div><span>{len(anchors)} released anchors</span></div><div class="research-map" data-problem-map="{slug}" data-snapshot-path="{entry['path']}" data-snapshot-digest="{entry['digest']}"></div><details><summary>All source anchors ({len(links)})</summary><ul class="anchor-list">{''.join(links)}</ul></details></section>{''.join(sections)}<section class="dossier-section" id="research-history"><h2>Dossier &amp; anchor history</h2><div data-problem-history="{slug}">Loading release observations...</div></section></article></main>'''
        write(output / "research" / slug / "index.html", page_shell(problem["title"], root, body, active="Conjectures"))
    body = f'''<main class="site-main research-home"><header class="page-heading"><div><p class="eyebrow">THE OMEGA INSTITUTE / RESEARCH FRONTIER</p><h1>Conjectures</h1><p class="lede">Open questions. Missing bridges. The next proof.</p></div><a class="console-link" href="research.html">Research news <i data-lucide="arrow-up-right"></i></a></header><div class="research-stats"><div><strong>{len(problems)}</strong><span>Source-backed dossiers</span></div><div><strong>{len({gid for p in problems for gid in p['motivation_gids'] if gid in nodes})}</strong><span>Released foundations</span></div><div><strong>{snapshot['truth_release_digest'][7:19]}</strong><span>Truth release</span></div></div><div class="research-browser"><aside><label for="research-search">Find a question</label><input type="search" id="research-search" placeholder="Problem, field, or source"><label for="research-triage">Research scope</label><select id="research-triage"><option value="">All targets</option><option value="theorem">Focused target</option><option value="window">Exploratory</option><option value="wall">Long horizon</option></select><p id="research-count" role="status">{len(problems)} dossiers</p><a id="research-clear-node" href="conjectures.html" hidden>All conjectures</a><div class="research-activity"><p class="eyebrow">DEVELOPMENT</p><a href="{repo}/commits/dev/">Daily Lean activity <i data-lucide="arrow-up-right"></i></a><small>Source branch activity / not a Truth release</small></div><a href="library-history.html">Release archive</a></aside><section class="problem-list" aria-label="Research questions">{''.join(rows) or '<p>No research dossiers in this source release.</p>'}<p id="research-empty" hidden>No questions match these filters.</p></section></div></main>'''
    from lib.research_news import render_news, resolved_questions
    from lib.research_results import render_followups
    destinations = '<nav class="conjecture-destinations" aria-label="Question views"><a href="#research-workbench">Research directions</a><a href="#resolved-questions">Resolved questions</a><a href="https://the-omega-institute.github.io/trureturing-mdbook/open-problems.html">Further reading / mdBook <i data-lucide="arrow-up-right"></i></a></nav>'
    body = body.replace('</header>', '</header>' + destinations + render_followups(snapshot), 1).replace('</main>', resolved_questions(snapshot) + '</main>')
    body = body.replace('aria-label="Question views">', 'aria-label="Question views"><a href="discover.html">Concepts &amp; OEIS</a>')
    bank = page_shell("Conjectures", "", body, active="Conjectures", appearance="editorial").replace('</head>', '<link rel="stylesheet" href="assets/research-news.css"></head>')
    write(output / "conjectures.html", bank)
    render_news(output, snapshot, page_shell)
    from lib.discovery import render_discovery
    render_discovery(output, snapshot, page_shell)
    history_body = '<main class="site-main"><header class="page-heading"><div><p class="eyebrow">LIBRARY / CONTENT ARCHIVE</p><h1>Library history</h1><p id="library-history-status" class="lede" role="status">Verifying release archive...</p></div><a href="knowledge/">Current Library</a></header><div class="archive-toolbar"><label for="archive-release">Release</label><select id="archive-release" disabled></select><label for="archive-search">Find a concept</label><input id="archive-search" type="search" placeholder="Title, domain, or ID" disabled></div><div id="archive-summary"></div><div id="archive-nodes" class="archive-list"></div><button id="archive-more" type="button" hidden>Show more</button></main>'
    write(output / "library-history.html", page_shell("Library history", "", history_body, "Library"))


def content_timeline(archived: list) -> dict:
    nodes, problems, previous_nodes, previous_problems = {}, {}, {}, {}
    for index, (_, snapshot, _) in enumerate(archived):
        current_nodes = {n["id"]: n for n in snapshot["graph"]["nodes"]}
        for node_id in sorted(set(previous_nodes) | set(current_nodes)):
            before, after = previous_nodes.get(node_id), current_nodes.get(node_id)
            if index == 0 or not before or not after or before["content_digest"] != after["content_digest"]:
                node = after or before
                event = "Baseline" if index == 0 else "Appeared" if not before else "Absent" if not after else "Content changed"
                nodes.setdefault(node_id, []).append({"observation": index, "event": event, "title": node.get("human_title") or node.get("title") or node_id, "present": bool(after), "source_changed": bool(before and after and before.get("source_blob") != after.get("source_blob"))})
        current_problems = {p["slug"]: p for p in snapshot["problems"]}
        for slug in sorted(set(previous_problems) | set(current_problems)):
            before, after = previous_problems.get(slug), current_problems.get(slug)
            problem = after or before
            changed = [gid for gid in problem["motivation_gids"] if previous_nodes.get(gid, {}).get("content_digest") != current_nodes.get(gid, {}).get("content_digest")]
            dossier_changed = bool(before and after and before["source_digest"] != after["source_digest"])
            resolution_changed = bool(before and after and before.get("resolution") != after.get("resolution"))
            if index == 0 or not before or not after or changed or dossier_changed or resolution_changed:
                event = "Baseline" if index == 0 else "Added" if not before else "Absent" if not after else "Resolution changed" if resolution_changed else "Dossier changed" if dossier_changed else "Anchors changed"
                review = "Source-recorded " + after["resolution"]["kind"] if after and after.get("resolution") else "Reassessment needed" if index and after and (changed or resolution_changed) else "Proposed route"
                problems.setdefault(slug, []).append({"observation": index, "event": event, "present": bool(after), "changed_anchors": changed if index else [], "review": review})
        previous_nodes, previous_problems = current_nodes, current_problems
    return {"schema_version": "pages-content-timeline.v1", "nodes": nodes, "problems": problems}


def build_library(graph_path: Path, manifest_path: Path, output: Path, source_repo: Path | None = None, previous_url: str | None = None):
    raw = graph_path.read_bytes()
    graph, manifest = json.loads(raw), json.loads(manifest_path.read_bytes())
    graph_hash = digest(raw)
    release = graph["source_snapshot"]["truth_release_digest"]
    if manifest.get("schema_version") != "pages-atlas-manifest.v1" or manifest.get("atlas_graph_digest") != graph_hash or manifest.get("truth_release_digest") != release or not DIGEST.fullmatch(release):
        raise ValueError("Library input does not match verified Atlas manifest.")
    if graph.get("synthetic"):
        problems, blobs = [], {}
    elif source_repo:
        problems, blobs = source_material(source_repo, graph["source_snapshot"]["source_commit"])
        # Formalization gate: no resolution renders as solved unless its exact declaration is a
        # kernel-verified node in this same published truth-release. The bundle's truth-export is
        # the sole authority; a resolution the release does not attest fails the build closed.
        from lib.problem_resolutions import index_truth_export, verify_resolutions
        truth_export = json.loads((graph_path.parent / "truth-export.v1.json").read_bytes())
        verify_resolutions(problems, index_truth_export(truth_export))
    else:
        raise ValueError("A real Library release requires its exact source checkout.")
    index_path = output / "data/library-history.v1.json"
    prior_raw = read_remote(previous_url, "data/library-history.v1.json", True) if previous_url else (index_path.read_bytes() if index_path.exists() else None)
    prior = validate_index(json.loads(prior_raw)) if prior_raw else None
    entries, archived = list(prior["entries"]) if prior else [], []
    for entry in entries:
        data = read_remote(previous_url, entry["path"]) if previous_url else (output / entry["path"]).read_bytes()
        if digest(data) != entry["digest"]:
            raise ValueError("Archived Library snapshot failed verification.")
        item = archive_json(entry, data)
        if digest(data) != entry["digest"] or item.get("schema_version") != SNAPSHOT or item.get("truth_release_digest") != entry["truth_release_digest"] or item.get("atlas_graph_digest") != entry["atlas_graph_digest"] or item["graph"]["source_snapshot"]["truth_release_digest"] != entry["truth_release_digest"]:
            raise ValueError("Archived Library snapshot failed verification.")
        archived.append((entry, item, data))
    snapshot = create_snapshot(graph, graph_hash, problems, blobs)
    data = compress((json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode())
    key = digest(data)
    existing = next((i for i, (entry, item, _) in enumerate(archived) if entry["digest"] == key or item == snapshot), None)
    if existing is not None and existing != len(entries) - 1:
        raise ValueError("Incoming Library release is older than the archived tip.")
    entry = {"digest": key, "path": f"data/library/{key[7:]}.json.gz", "truth_release_digest": release, "atlas_graph_digest": graph_hash, "source_commit": graph["source_snapshot"].get("source_commit"), "node_count": len(graph["nodes"]), "problem_count": len(problems)}
    if existing is None:
        entries.append(entry)
        archived.append((entry, snapshot, data))
    else:
        entry = entries[existing]
    # Rebuild old Wiki routes from immutable content; publish the new index only after all output succeeds.
    for coordinate, item, content in archived:
        write_bytes(output / coordinate["path"], content)
        if item["truth_release_digest"] != release:
            render_knowledge_site(item["graph"], output, immutable_only=True, archive_snapshot_digest=coordinate["digest"])
    render_knowledge_site(graph, output)
    render_research(snapshot, output, entry)
    timeline = json.dumps(content_timeline(archived), ensure_ascii=False, separators=(",", ":")) + "\n"
    timeline_data = compress(timeline.encode())
    timeline_digest = digest(timeline_data)
    timeline_path = f"data/library/{timeline_digest[7:]}.json.gz"
    write_bytes(output / timeline_path, timeline_data)
    index = validate_index({"schema_version": SCHEMA, "current_truth_release_digest": release, "entries": entries, "timeline": {"path": timeline_path, "digest": timeline_digest}})
    write(index_path, json.dumps(index, indent=2) + "\n")
    return index


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-repo", type=Path)
    parser.add_argument("--previous-url")
    args = parser.parse_args()
    result = build_library(args.graph, args.manifest, args.output, args.source_repo, args.previous_url)
    print(f"Library: {len(result['entries'])} verified observations")
