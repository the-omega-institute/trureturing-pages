"""Publish sourced discovery records without promoting relations to proof claims."""
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET

from lib.knowledge_pages import esc, write
from lib.research_bridges import extend_index, RELATIONS as BRIDGE_RELATIONS

ASSETS = Path(__file__).resolve().parents[1] / "site/assets"
BASE = "https://the-omega-institute.github.io/trureturing-pages/"
RELATIONS = {
    "studied_object": "Result studies this sequence; the sequence itself is not marked solved.",
    "paper_context": "Related in the cited paper; no proof coverage is implied.",
    "topic_member": "Curated subject association, not a proof dependency.",
    "builds_on": "Proposed follow-up based on a reviewed result, not a proved implication.",
    "proposed_target": "Proposed subproblem of a research family.",
    "source_anchor": "Source-authored motivation link to a released module, not theorem-use evidence.",
}

RELATIONS.update(BRIDGE_RELATIONS)


def build_index(snapshot):
    news = json.loads((ASSETS / "research-news.json").read_text())
    catalog = json.loads((ASSETS / "research-catalog.json").read_text())
    stories = json.loads((ASSETS / "result-stories.json").read_text())
    curated = json.loads((ASSETS / "discovery-curation.json").read_text())
    records, edges = [], []

    def record(id, kind, title, summary, path, **fields):
        api_url = BASE + "api/v1/records/" + hashlib.sha256(id.encode()).hexdigest() + ".json"
        records.append(dict(id=id, kind=kind, title=title, summary=summary, url=BASE + path, api_url=api_url, **fields))

    def edge(start, end, kind, scope, evidence_url):
        edges.append(dict(source=start, target=end, kind=kind, scope=scope, evidence_url=evidence_url))

    for item in news["results"]:
        id = "result:" + item["id"]
        record(id, "result", item["title"], item["summary"], f'results/{item["id"]}/',
               status=item["kind"], scope=item["scope"], aliases=[item["module"], item["declaration"], item["field"]],
               evidence={"source_url": item["source_url"], "source_commit": item["source_commit"],
                         "declaration": item["module"] + "." + item["declaration"], "statement_id": item["statement_id"],
                         "lean_url": BASE + f'assets/proofs/{item["id"]}.lean',
                         "source_sha256": stories[item["id"]]["source_sha256"],
                         "assessment": "reviewed-pinned-result", "release_membership": "not-inferred"})
    for item in news["publications"]:
        record("publication:" + item["id"], "publication", item["title"], item["summary"],
               "research.html#" + item["id"], status=item["status"], aliases=[item["venue"], item.get("doi", "")],
               scope=item.get("qualification", item["evidence"]), evidence={"source_url": item["url"]})
    for family in catalog["families"]:
        id = "question:" + family["id"]
        source_url = "https://doi.org/" + family["doi"]
        record(id, "question", family["title"], family["question"], "conjectures.html#rp=" + family["id"],
               status="proposed-research", scope=family["gap"], aliases=family.get("keywords", []) + [family["area"]],
               evidence={"source_url": source_url, "source_commit": family.get("source_commit", catalog["source_commit"])})
        if family.get("builds_on"):
            edge("result:" + family["builds_on"], id, "builds_on", family["foothold"], source_url)
        for target in family["targets"]:
            tid = "target:" + target["id"]
            record(tid, "target", target["title"], target["question"], "conjectures.html#rp=" + target["id"],
                   status="proposed-target", scope=target["gap"], aliases=[family["area"]], evidence={"source_url": source_url})
            edge(id, tid, "proposed_target", target["next_step"], source_url)
    for node in snapshot["graph"]["nodes"]:
        gid = node["id"]
        record("module:" + gid, "module", node.get("human_title") or node.get("title") or gid,
               "Module in the published source snapshot; membership is not a proof-completion claim.",
               "atlas.html#node=" + quote(gid, safe=""), status="released-module", aliases=[gid],
               evidence={"truth_release_digest": snapshot["truth_release_digest"]})
    ids = {r["id"] for r in records}
    for problem in snapshot["problems"]:
        id = "dossier:" + problem["slug"]
        record(id, "dossier", problem["title"], problem["sections"]["Problem"], "research/" + problem["slug"] + "/",
               status="source-dossier", aliases=[], scope="Read the source dossier for its resolution and assumptions.",
               evidence={"truth_release_digest": snapshot["truth_release_digest"]})
        for gid in problem["motivation_gids"]:
            if "module:" + gid in ids:
                edge("module:" + gid, id, "source_anchor", "Motivation declared in the release dossier.", BASE + "research/" + problem["slug"] + "/")
    for topic in curated["topics"]:
        id = "topic:" + topic["id"]
        record(id, "topic", topic["title"], topic["summary"], "discover.html?q=" + quote(topic["title"]),
               status="curated-topic", aliases=topic["aliases"])
        for target in topic["records"]:
            edge(id, target, "topic_member", topic["summary"], next(r["url"] for r in records if r["id"] == target))
    for sequence in curated["sequences"]:
        if not re.fullmatch(r"A\d{6}", sequence["id"]):
            raise ValueError("Invalid OEIS identifier")
        id = "oeis:" + sequence["id"]
        record(id, "sequence", sequence["title"], "OEIS sequence with source-backed research connections.",
               "oeis/" + sequence["id"] + "/", status="external-sequence", aliases=sequence["aliases"] + [sequence["id"], "OEIS"],
               identifiers={"oeis": sequence["id"]}, evidence={"source_url": sequence["source_url"]})
        for relation in sequence["links"]:
            edge(id, relation["record"], relation["kind"], relation["scope"], relation["evidence_url"])
    paths = extend_index(snapshot, records, edges, news, catalog, stories, ASSETS, BASE)
    ids = {r["id"] for r in records}
    if len(ids) != len(records) or any(e["source"] not in ids or e["target"] not in ids or e["kind"] not in RELATIONS for e in edges):
        raise ValueError("Invalid discovery graph references")
    return {"schema_version": "pages-discovery.v1", "truth_release_digest": snapshot["truth_release_digest"],
            "reviewed": curated["reviewed"], "relation_types": RELATIONS, "research_paths": paths,
            "records": sorted(records, key=lambda r: r["id"]), "relations": sorted(edges, key=lambda e: (e["source"], e["target"]))}


def render_discovery(output, snapshot, shell):
    data = build_index(snapshot)
    encoded = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    root = output / "api/v1"
    write(root / "index.json", encoded)
    response = {"200": {"description": "Versioned public JSON record", "content": {"application/json": {"schema": {"type": "object"}}}}, "404": {"description": "Not indexed; does not imply unsolved"}}
    paths = {"/api/v1/manifest.json": {"get": {"operationId": "getDiscoveryManifest", "responses": response}},
             "/api/v1/index.json": {"get": {"operationId": "getDiscoveryIndex", "description": "Download and search locally; query parameters do not filter this static resource.", "responses": response}},
             "/api/v1/oeis/{oeis_id}.json": {"get": {"operationId": "lookupOEIS", "parameters": [{"name": "oeis_id", "in": "path", "required": True, "schema": {"type": "string", "pattern": "^A[0-9]{6}$"}}], "responses": response}},
             "/api/v1/records/{record_hash}.json": {"get": {"operationId": "getResearchRecord", "parameters": [{"name": "record_hash", "in": "path", "required": True, "description": "Lowercase SHA-256 of the UTF-8 record ID", "schema": {"type": "string", "pattern": "^[a-f0-9]{64}$"}}], "responses": response}}}
    write(output / "api/openapi.json", json.dumps({"openapi": "3.1.0", "info": {"title": "trureturing Research Discovery", "version": "1.0.0"}, "servers": [{"url": BASE.rstrip("/")}], "paths": paths}))
    write(root / "manifest.json", json.dumps({"schema_version": "pages-discovery-manifest.v1", "index_url": BASE + "api/v1/index.json",
          "index_sha256": digest, "records": len(data["records"]), "relations": len(data["relations"]),
          "truth_release_digest": data["truth_release_digest"], "query_execution": "client-side", "docs_url": BASE + "api/"}))
    by_id = {r["id"]: r for r in data["records"]}
    adjacent = {id: [] for id in by_id}
    for edge in data["relations"]:
        adjacent[edge["source"]].append(edge)
        adjacent[edge["target"]].append(edge)
    for id, record in by_id.items():
        related = adjacent[id]
        name = hashlib.sha256(id.encode()).hexdigest()
        payload = {"schema_version": "pages-discovery-record.v1", "record": record, "relations": related,
                   "neighbors": [by_id[n] for n in sorted({e[k] for e in related for k in ("source", "target")} - {id})], "index_sha256": digest, "research_paths": [p for p in data["research_paths"] if any(id in stage["records"] for stage in p["stages"])]}
        write(root / "records" / (name + ".json"), json.dumps(payload, ensure_ascii=False))
        if record["kind"] != "sequence":
            continue
        oeis = record["identifiers"]["oeis"]
        write(root / "oeis" / (oeis + ".json"), json.dumps(payload, ensure_ascii=False))
        items = "".join(f'<article><p class="eyebrow">{esc(e["kind"].replace("_", " "))}</p><h2><a href="{esc(by_id[e["target"]]["url"])}">{esc(by_id[e["target"]]["title"])}</a></h2><p>{esc(e["scope"])}</p><a href="{esc(e["evidence_url"])}">Association source</a></article>' for e in related if e["source"] == id)
        body = f'<main class="site-main discovery"><p class="eyebrow">OEIS / RESEARCH CONNECTIONS</p><h1>{oeis}: {esc(record["title"])}</h1><a href="{record["evidence"]["source_url"]}">OEIS entry</a>{items}<p><a href="../../discover.html?record=oeis%3A{oeis}">Explore related questions and bridges</a></p><a href="../../api/v1/oeis/{oeis}.json">JSON for AI clients</a></main>'
        html = shell(oeis + " research connections", "../../", body, appearance="editorial")
        html = html.replace('</head>', f'<link rel="stylesheet" href="../../assets/discovery.css"><link rel="canonical" href="{record["url"]}"><meta name="description" content="{esc(record["title"] + ": related formal results, exact proof scope and remaining questions in trureturing.")}"></head>')
        write(output / "oeis" / oeis / "index.html", html)
    sequences = [r for r in data["records"] if r["kind"] == "sequence"]
    rows = "".join(f'<article><p class="eyebrow">{esc(r["identifiers"]["oeis"])}</p><h2><a href="{esc(r["url"])}">{esc(r["title"])}</a></h2><p>{esc(r["summary"])}</p><p>{len(adjacent[r["id"]])} sourced connections</p><a href="../discover.html?record={quote(r["id"], safe="")}">Open research map</a></article>' for r in sequences)
    oeis_body = '<main class="site-main discovery"><p class="eyebrow">INTEGER SEQUENCES / CONNECTED RESEARCH</p><h1>OEIS connections</h1><p>Start with a sequence. Follow the exact question, the scope of our result, and the next possible bridge.</p><p>A sequence identifier is not a conjecture. Each connection distinguishes a result about that sequence from related paper context and proposed questions.</p><div class="discovery-results">' + rows + '</div><p><a href="../discover.html">Explore all research journeys</a> · <a href="../api/">API for AI clients</a></p></main>'
    write(output / "oeis/index.html", shell("OEIS connections", "../", oeis_body, appearance="editorial").replace('</head>', '<link rel="stylesheet" href="../assets/discovery.css"></head>'))
    docs = '''<main class="site-main discovery"><h1>Research Discovery API</h1><p>Public, read-only JSON resources. No authentication or API key is required.</p>
<ul><li><a href="v1/manifest.json">GET /api/v1/manifest.json</a>: index URL, SHA-256 and release coordinate.</li><li><a href="v1/index.json">GET /api/v1/index.json</a>: searchable records and sourced, typed relationships.</li><li><a href="v1/oeis/A010060.json">GET /api/v1/oeis/A010060.json</a>: exact OEIS lookup, connected records and scope.</li><li>GET /api/v1/records/{sha256-of-UTF8-record-id}.json: record, neighbors and incident edges.</li></ul>
<p><a href="openapi.json">OpenAPI 3.1 specification</a></p><p>Search the downloaded index by title, aliases, identifiers and summary. Query parameters do not filter these static endpoints. Unknown identifiers return HTTP 404, which means not indexed, not unsolved. Follow record URLs for human-readable results.</p>
<p>Research paths expose public_problem, general_theorem, representation, new_problem and human_understanding stages. Check each stage status: a worked example does not establish independent understanding; a proposed transfer does not establish measured benefit. For a future measured-transfer claim, require a fixed held-out target set, baseline and bridge-enabled runs under the same budget, an ablation, raw outcomes and a versioned evaluation report tied to the exact representation proof. Independent understanding requires a separate reader task and assessment record. Missing evidence remains missing. Literature records retain DOI/arXiv identity and author attribution. Citation and acknowledgement edges are source-authored, not extracted theorem-use dependencies.</p>
<p>Only result records carry reviewed proved/refuted status. Sequence associations, topic membership, proposed bridges and source anchors never propagate that status. Module membership does not certify every declaration. Source commits and release membership are separate. This curated index is not an exhaustive literature review or an extracted Lean theorem-use graph.</p>
<p>Read the manifest, fetch the index and check its SHA-256. Retry if deployment changes cause a mismatch. Record responses identify their index snapshot. These immutable IDs can be used to join data across releases; retain snapshots in your own client for history.</p><a href="../discover.html">Search and explore</a></main>'''
    write(output / "api/index.html", shell("Research Discovery API", "../", docs, appearance="editorial"))
    write(output / "llms.txt", f'# trureturing\n\nMathematical research, Lean proofs and sourced research connections.\n\n- API documentation: {BASE}api/\n- Discovery manifest: {BASE}api/v1/manifest.json\n- Search: {BASE}discover.html\n\nDownload the JSON index and search locally. Exact OEIS resources use /api/v1/oeis/Axxxxxx.json. Associations are not proof claims; inspect relation kind, scope, result status and pinned evidence. A010060 identifies the underlying Thue-Morse sequence, not its derived complexity sequence.\n')
    urls = {BASE, BASE + "discover.html", BASE + "api/", BASE + "oeis/"}
    urls.update(r["url"].split("#")[0].split("?")[0] for r in data["records"])
    sitemap = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for url in sorted(urls):
        ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = url
    write(output / "sitemap.xml", ET.tostring(sitemap, encoding="unicode"))
