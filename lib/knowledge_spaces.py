"""Rebuildable knowledge-space navigation from an already verified Library snapshot.

Scribe owns attribution. Truth owns proof state. This projection owns neither.
There is no corpus-specific catalog, keyword classification, or source-branch read.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

PROFILE = "knowledge-spaces-v1"
SCHEMA = "pages-knowledge-spaces.v1"
MANIFEST = "pages-knowledge-spaces-manifest.v1"
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def canonical(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def digest(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing or invalid {field}.")
    return value


def public_url(value: object) -> str:
    # Use the existing Scribe/dossier URL boundary, including hostile port checks.
    from lib.literature import validate_http_url
    validate_http_url(value)
    return value


def unique_rows(rows: list[dict], field: str) -> dict[str, dict]:
    found = {}
    for row in rows:
        key = text(row.get(field), field)
        if key in found:
            raise ValueError(f"Duplicate {field}: {key}")
        found[key] = row
    return found


def build_catalog(snapshot: dict) -> dict:
    if snapshot.get("schema_version") != "pages-library-snapshot.v1":
        raise ValueError("Knowledge spaces require a Library snapshot v1.")
    release, graph_digest = snapshot.get("truth_release_digest"), snapshot.get("atlas_graph_digest")
    if not isinstance(release, str) or not DIGEST.fullmatch(release):
        raise ValueError("Invalid truth-release binding.")
    if not isinstance(graph_digest, str) or not DIGEST.fullmatch(graph_digest):
        raise ValueError("Invalid Atlas binding.")
    graph = snapshot["graph"]
    source = graph["source_snapshot"]
    if source.get("truth_release_digest") != release:
        raise ValueError("Mixed snapshot/graph truth releases.")
    commit = source.get("source_commit", "")
    if not COMMIT.fullmatch(commit):
        raise ValueError("Knowledge spaces require an exact source commit.")
    nodes = unique_rows(graph["nodes"], "id")
    problems = unique_rows(snapshot.get("problems", []), "slug")
    scopes, records, targets = {}, [], []

    def add_scope(kind: str, key: str, title: str, ids=(), problem=None, reference=None):
        identity = kind + ":" + key
        sid = hashlib.sha256(identity.encode()).hexdigest()
        item = scopes.setdefault(sid, {
            "id": sid, "kind": kind, "key": key, "title": title,
            "member_ids": set(), "problem_slugs": set(), "references": {},
        })
        item["member_ids"].update(ids)
        if problem:
            item["problem_slugs"].add(problem)
        if reference:
            item["references"][canonical(reference)] = reference
        return sid

    def citation(raw: dict) -> dict:
        # Preserve all emitted attribution, without manufacturing a review date.
        item = {k: raw[k] for k in ("identity", "identifiers", "url", "source_url",
                                   "title", "authors", "year", "role", "declaration_gid") if k in raw}
        text(item.get("identity"), "citation identity")
        text(item.get("title"), "citation title")
        public_url(item.get("source_url") or item.get("url"))
        if item.get("url"):
            public_url(item["url"])
        return item

    for node_id, node in sorted(nodes.items()):
        references = {canonical(c): c for raw in node.get("literature", []) for c in [citation(raw)]}
        record = {
            "id": node_id, "kind": node.get("kind", "unknown"),
            "title": text(node.get("human_title") or node.get("title") or node_id, "node title"),
            "summary": node.get("human_abstract") or "",
            "statement": node.get("human_theorem") or "",
            "domain": node.get("domain") or "Unclassified",
            "state": node.get("state") or node.get("status") or "unspecified",
            "blueprint_path": node.get("blueprint_path"),
            "source_path": node.get("repo_path"),
            "references": [references[k] for k in sorted(references)],
            "wiki_path": "knowledge/node/" + hashlib.sha256(node_id.encode()).hexdigest() + "/",
        }
        records.append(record)
        # A source domain is an upstream address, not a newly inferred discipline.
        if node.get("kind") == "truth":
            add_scope("domain", record["domain"], record["domain"], [node_id])
        for ref in record["references"]:
            members = [node_id] if node.get("kind") == "truth" else []
            add_scope("source", ref["identity"], ref["title"], members, reference=ref)

    from lib.literature import literature_identity, problem_source_url
    for slug, problem in sorted(problems.items()):
        if not SLUG.fullmatch(slug):
            raise ValueError("Unsafe problem slug.")
        url = public_url(problem_source_url(problem))
        identity, identifiers, canonical_url = literature_identity(url, url_source=True)
        ref = {"identity": identity, "identifiers": identifiers, "url": canonical_url,
               "source_url": url, "title": identity, "role": "original-question"}
        anchors = set(problem.get("motivation_gids", []))
        members = sorted(i for i in anchors if i in nodes and nodes[i].get("kind") == "truth")
        missing = sorted(anchors - set(members))
        resolution = problem.get("resolution")
        if resolution and (resolution.get("kind") not in ("proved", "refuted")
                           or not resolution.get("kernel_verified")):
            raise ValueError("Resolution lacks the existing published formalization gate.")
        # A resolving module can be a member even when omitted from motivation anchors.
        if resolution:
            gid = text(resolution.get("declaration_gid"), "resolution declaration")
            host = text(resolution.get("source_path"), "resolution source")
            if not host.startswith("Blueprint/") or not host.endswith(".md"):
                raise ValueError("Resolution source must be a Blueprint Markdown path.")
            module = host[len("Blueprint/"):-3]
            members = sorted(set(members) | {i for i, n in nodes.items()
                             if n.get("kind") == "truth" and
                             (i == module or n.get("repo_path") == module + ".lean")})
        item = {
            "slug": slug, "title": text(problem.get("title"), "problem title"),
            "url": url, "path": "research/" + slug + "/", "member_ids": members,
            "missing_anchor_ids": missing, "triage": problem.get("triage"),
            "result": resolution["kind"] if resolution else "unresolved-in-release",
            "resolution": resolution, "literature_status": problem.get("literature_status", "not-rechecked"),
        }
        targets.append(item)
        add_scope("target", slug, item["title"], members, problem=slug, reference=ref)
        add_scope("source", identity, identity, members, problem=slug, reference=ref)
        host = urlsplit(url).hostname.lower()
        # A website grouping is explicit. It does not assert one mathematical corpus.
        add_scope("collection", host, host, members, problem=slug)

    final_scopes = []
    for scope in scopes.values():
        refs = [scope["references"][k] for k in sorted(scope["references"])]
        # Prefer a real Scribe title to an identifier, independent of input order.
        authored = sorted({r["title"] for r in refs if r.get("role") != "original-question"})
        if scope["kind"] == "source" and authored:
            scope["title"] = authored[0]
        final_scopes.append({**scope, "member_ids": sorted(scope["member_ids"]),
                             "problem_slugs": sorted(scope["problem_slugs"]), "references": refs})
    return {
        "schema_version": SCHEMA, "profile": PROFILE,
        "truth_release_digest": release, "atlas_graph_digest": graph_digest,
        "source_commit": commit, "snapshot_content_digest": digest(canonical(snapshot)),
        "granularity": "recorded-module-relations",
        "records": records, "targets": targets,
        "spaces": sorted(final_scopes, key=lambda s: (s["kind"], s["title"], s["id"])),
        "coverage": {
            "attribution": "Scribe-emitted citations and source dossiers",
            "membership": "source domains, citation associations and recorded target anchors",
            "theory_atom_coverage": "not supplied by Library snapshot v1",
            "research_attempts": "not supplied by Library snapshot v1",
            "declaration_use_edges": "not supplied by Library snapshot v1",
            "quarantined_problems": snapshot.get("quarantined_problems", []),
        },
    }


def write_atomic(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_bytes(data)
    temp.replace(path)


def render_spaces(output: Path, snapshot: dict) -> dict:
    catalog = build_catalog(snapshot)
    raw = canonical(catalog)
    checksum = digest(raw)
    path = "data/spaces/" + checksum[7:] + ".json"
    write_atomic(output / path, raw)
    manifest = {k: catalog[k] for k in ("profile", "truth_release_digest", "atlas_graph_digest", "source_commit")}
    manifest.update(schema_version=MANIFEST, catalog_path=path, catalog_sha256=checksum)
    # Manifest last: a reader never discovers a partially written catalog.
    write_atomic(output / "data/knowledge-spaces.v1.json", canonical(manifest))
    return catalog


def overview_html(catalog: dict) -> str:
    esc = lambda value: html.escape(str(value), quote=True)
    domains = [s for s in catalog["spaces"] if s["kind"] == "domain"]
    examples = sorted(domains, key=lambda s: (-len(s["member_ids"]), s["title"]))[:6]
    cards = "".join('<a class="research-focus-card" href="spaces.html?space=' + s["id"] + '">'
                    '<p class="eyebrow">SOURCE DOMAIN</p><h3>' + esc(s["title"]) + '</h3><p>'
                    + str(len(s["member_ids"])) + ' released modules</p></a>' for s in examples)
    return ('<section id="knowledge-spaces" class="research-frontier"><div class="news-section-heading">'
            '<div><p class="eyebrow">THE CONNECTED KNOWLEDGE SYSTEM</p><h2>Explore research spaces</h2></div>'
            '<a href="spaces.html">All spaces and shared foundations</a></div><p>Theory, concepts, '
            'source literature and research targets share one release-bound map. Choose a space, '
            'inspect its foundations, or compare it with another.</p><div class="research-focus-grid">'
            + cards + '</div></section>')


def rebuild_site(output: Path) -> dict:
    """Renderer-only replay. Read immutable archive bytes; never append release history."""
    history = json.loads((output / "data/library-history.v1.json").read_bytes())
    if history.get("schema_version") != "pages-library-history.v1" or not history.get("entries"):
        raise ValueError("A verified Library history is required for replay.")
    entry = history["entries"][-1]
    key = entry.get("digest", "")
    if not DIGEST.fullmatch(key):
        raise ValueError("Invalid archive digest.")
    allowed = {"data/library/" + key[7:] + ext for ext in (".json", ".json.gz")}
    if entry.get("path") not in allowed:
        raise ValueError("Invalid archive path.")
    raw = (output / entry["path"]).read_bytes()
    if digest(raw) != key:
        raise ValueError("Archive bytes failed verification.")
    snapshot = json.loads(gzip.decompress(raw) if entry["path"].endswith(".gz") else raw)
    atlas = json.loads((output / "data/pages-atlas-manifest.v1.json").read_bytes())
    if atlas.get("schema_version") != "pages-atlas-manifest.v1":
        raise ValueError("Invalid current Atlas manifest.")
    if entry.get("source_commit") != snapshot["graph"]["source_snapshot"].get("source_commit"):
        raise ValueError("Archive source commit mismatch.")
    for field in ("truth_release_digest", "atlas_graph_digest"):
        if entry.get(field) != snapshot.get(field) or atlas.get(field) != snapshot.get(field):
            raise ValueError("Replay requires the same current Library and Atlas.")
    if history.get("current_truth_release_digest") != snapshot["truth_release_digest"]:
        raise ValueError("Library tip is not current.")
    return render_spaces(output, snapshot)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, type=Path)
    args = parser.parse_args()
    result = rebuild_site(args.site)
    print(f"Knowledge spaces: {len(result['spaces'])}; release {result['truth_release_digest']}")
