"""Editorial research records, kept separate from release-certified graph data."""
import argparse
import gzip
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from lib.knowledge_pages import esc, write
from lib.literature import problem_source_url
from lib.problem_resolutions import is_kernel_verified
from lib.research_results import STORIES, render_result_pages

CATALOG = Path(__file__).resolve().parents[1] / "site/assets/research-news.json"
REPO = "https://github.com/the-omega-institute/trureturing"
BOOK = "https://the-omega-institute.github.io/trureturing-mdbook/"


def _kernel_verified(resolution):
    return is_kernel_verified(resolution)


def _status(item):
    marker = item.get("kernel_verified")
    marker_verified = isinstance(marker, dict) and bool(marker.get("frozen_node_id")) and bool(marker.get("freeze_status"))
    verified = _kernel_verified(item.get("resolution_record", {})) or marker_verified
    return item["kind"].capitalize() + (" in Lean" if verified else " / source record")


def _source_host(url):
    """Parsed lowercase host of a source URL (empty on malformed), for exact host
    matching. Substring checks like 'oeis.org' in url are unsafe: the string can sit
    anywhere in an arbitrary URL (evil.com/oeis.org, oeis.org.evil.com)."""
    try:
        return (urlsplit(str(url or "")).hostname or "").lower()
    except ValueError:
        return ""


def _host_is(host, domain):
    return host == domain or host.endswith("." + domain)


def _derived_field(problem, source_url, resolution=None):
    slug = str(problem.get("slug", "")).lower()
    host = _source_host(source_url)
    if slug.startswith("oeis-") or _host_is(host, "oeis.org"):
        return "Integer sequences (OEIS)"
    if problem.get("arxiv_id") or _host_is(host, "arxiv.org"):
        return "arXiv"
    domain = problem.get("domain") or (resolution or {}).get("domain")
    return str(domain) if domain else "Open problem"


def _short_summary(text, limit=320):
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    first = re.search(r".+?[.!?。！？](?:\s|$)", text)
    if first and len(first.group(0).strip()) <= limit:
        return first.group(0).strip()
    return text[: limit - 1].rstrip() + "…"


def _problem_summary(problem, limit=320):
    raw = str(problem.get("sections", {}).get("Problem", "")).strip()
    paragraphs = re.split(r"\n\s*\n", raw)
    paragraph = paragraphs[0]
    # A citation introducing a block quote is not the question itself.
    if (len(paragraphs) > 1 and paragraphs[1].lstrip().startswith(">")
            and (paragraph.rstrip().endswith(":") or re.search(r"\b(verbatim|quoted)\b", paragraph, re.I))):
        paragraph = paragraphs[1]
    paragraph = re.sub(r"(?m)^\s*>\s?", "", paragraph)
    # Keep source notation literal: Markdown emphasis can eat multiplication '*'.
    return _short_summary(paragraph, limit)


def _derived_record(problem, resolution, snapshot):
    gid = resolution["declaration_gid"]
    module, _, declaration = gid.rpartition(".")
    source = snapshot.get("graph", {}).get("source_snapshot", {})
    source_url = resolution.get("source_url") or problem_source_url(problem)
    return {
        "id": problem["slug"], "title": problem["title"],
        "field": _derived_field(problem, source_url, resolution), "kind": resolution["kind"],
        "module": module, "declaration": declaration,
        "date": resolution.get("date"),
        "source_commit": resolution.get("source_commit") or problem.get("source_commit") or source.get("source_commit") or snapshot.get("source_commit"),
        "source_url": source_url, "summary": _problem_summary(problem),
        "scope": resolution.get("scope") or problem.get("sections", {}).get("Problem", ""),
        "statement_id": resolution.get("statement_id") or problem.get("statement_id") or source.get("statement_id"),
        "kernel_verified": resolution["kernel_verified"],
    }


def result_records(snapshot, catalog=None):
    results = [dict(item) for item in json.loads(Path(catalog or CATALOG).read_text())["results"]]
    stories = json.loads(STORIES.read_text())
    if catalog is not None and snapshot.get("schema_version") == "pages-library-snapshot.v1":
        current = {p["slug"] for p in snapshot["problems"] if _kernel_verified(p.get("resolution"))}
        results = [item for item in results if item["id"] in current]
    elif catalog is None and CATALOG == Path(__file__).resolve().parents[1] / "site/assets/research-news.json" and len(results) > len(stories):
        results = [item for item in results if item["id"] in stories]
    for item in results:
        if item["id"] in stories:
            item["result_path"] = f'results/{item["id"]}/'
    by_declaration = {r["module"] + "." + r["declaration"]: r for r in results}
    for problem in snapshot["problems"]:
        resolution = problem.get("resolution")
        if not resolution:
            continue
        verified = _kernel_verified(resolution)
        gid = resolution["declaration_gid"]
        module = resolution["source_path"][len("Blueprint/"):-3]
        if gid in by_declaration:
            item = by_declaration[gid]
            if item["kind"] != resolution["kind"]:
                item.update(_derived_record(problem, resolution, snapshot))
        else:
            # A source resolution becomes a research result only after the #48
            # kernel gate annotated it. Unknown/unverified records fail closed.
            if not verified:
                continue
            item = _derived_record(problem, resolution, snapshot)
            results.append(item)
            by_declaration[gid] = item
        item["problem_slug"] = problem["slug"]
        item["resolution_record"] = resolution
        if verified:
            item["kernel_verified"] = resolution["kernel_verified"]
    return results


def append_verified(snapshot, catalog=None):
    """Synchronize results from upstream evidence; editorial text is optional.

    Source identity, scope, kind and verification always follow the snapshot.
    Matching editorial rows may customize presentation, never block publication.
    Historical renderer-only callers retain their editorial aliases.
    """
    path = Path(catalog) if catalog is not None else CATALOG
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("Invalid research-news catalog")
    ids = {item["id"]: item for item in data["results"]}
    results = []
    for problem in snapshot.get("problems", []):
        resolution = problem.get("resolution")
        if not _kernel_verified(resolution):
            continue
        record = _derived_record(problem, resolution, snapshot)
        prior = ids.get(record["id"], {})
        if all(prior.get(key) == record[key] for key in ("kind", "module", "declaration")):
            for key in ("title", "field", "summary", "pr"):
                if key in prior:
                    if key == "summary":
                        old_scope = str(prior.get("scope") or "").strip()
                        old_lead = re.split(r"\n\s*\n", old_scope, maxsplit=1)[0]
                        if prior[key] in (
                            _short_summary(old_lead),
                            _problem_summary({"sections": {"Problem": old_scope}}),
                        ):
                            continue
                    record[key] = prior[key]
        results.append(record)
    if snapshot.get("schema_version") != "pages-library-snapshot.v1":
        current = {item["id"] for item in results}
        results.extend({k: v for k, v in item.items() if k != "kernel_verified"}
                       for item in data["results"] if item["id"] not in current)
    results.sort(key=lambda item: item["id"])
    output = {**data, "results": results}
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    return output


def _read_snapshot(path):
    raw = Path(path).read_bytes()
    if str(path).endswith(".gz"):
        raw = gzip.decompress(raw)
    return json.loads(raw)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Research news catalog tools")
    commands = parser.add_subparsers(dest="command", required=True)
    append = commands.add_parser("append-verified", help="append kernel-verified derived records")
    append.add_argument("--snapshot", required=True, type=Path)
    append.add_argument("--catalog", type=Path, default=CATALOG)
    args = parser.parse_args(argv)
    if args.command == "append-verified":
        before = json.loads(args.catalog.read_text())
        after = append_verified(_read_snapshot(args.snapshot), args.catalog)
        added = len(after["results"]) - len(before.get("results", []))
        print(f"Appended {added} verified research record(s); catalog has {len(after['results'])} result(s).")


if __name__ == "__main__":
    main()


def _result_statement(item):
    """Render complete scope, keeping optional editorial prose without repeating it."""
    from lib.living_library import MARKDOWN
    scope = str(item.get("scope") or "").strip()
    summary = str(item.get("summary") or "").strip()
    # Derived summaries are the first paragraph (sometimes truncated). They must
    # never replace the source text or leave a quotation introduction dangling.
    prefix = summary.removesuffix("…").rstrip()
    repeated = bool(prefix) and " ".join(scope.split()).startswith(" ".join(prefix.split()))
    introduction = f'<p>{esc(summary)}</p>' if summary and not repeated else ''
    return introduction + f'<div class="result-statement prose">{MARKDOWN.render(scope)}</div>'


def render_news(output, snapshot, shell, catalog_path=None):
    from lib.knowledge_spaces import render_spaces
    from lib.reading_views import apply_reading_views
    # Legacy renderer-only callers cannot publish a verified spaces manifest.
    if "schema_version" in snapshot:
        render_spaces(output, snapshot)
    catalog = json.loads(Path(catalog_path or CATALOG).read_text())
    publications, results = [], []
    nodes = snapshot["graph"]["nodes"]
    records = [item for item in result_records(snapshot, catalog_path)
               if not item.get("resolution_record") or _kernel_verified(item["resolution_record"])]
    for item in records:
        module, commit = item["module"], item["source_commit"]
        released = any(n.get("repo_path") == module + ".lean" or n.get("id") == module for n in nodes)
        release_state = "Module present in current Truth release; resolution evidence is pinned below." if released else "Upstream Frozen / not in current Truth release"
        item["release_state"] = release_state
        evidence = f'{REPO}/blob/{commit}/Golden/Frozen/state/{module}.lean.json'
        date = f'<time datetime="{item["date"]}">{item["date"]}</time>' if item.get("date") else '<span>Release source record</span>'
        status = _status(item)
        proof = f'<a href="{REPO}/pull/{item["pr"]}">Development PR #{item["pr"]}</a>' if item.get("pr") else ''
        binding = f'<a href="research/{item["problem_slug"]}/">Release problem dossier</a>' if item.get("resolution_record") else ''
        reading = f'<a href="{item["result_path"]}">Read result <i data-lucide="arrow-up-right"></i></a><a href="{item["result_path"]}#lean">Lean theorem <i data-lucide="code-xml"></i></a>' if item.get("result_path") else f'<a href="{REPO}/blob/{commit}/Blueprint/{module}.md">Proof explanation <i data-lucide="arrow-up-right"></i></a>'
        body = f'''<article class="news-result" id="{item['id']}"><div class="news-result-meta">{date}<span class="news-status {item['kind']}">{status}</span></div><div><p class="eyebrow">{esc(item['field'])}</p><h3>{esc(item['title'])}</h3>{_result_statement(item)}<div class="news-links">{reading}<a href="{esc(item['source_url'])}">Original question</a>{binding}</div><details><summary>Proof record</summary><p class="news-release-state">{release_state}</p><p><a href="{REPO}/blob/{commit}/{module}.lean">{esc(module + '.' + item['declaration'])}</a></p><div class="news-links">{proof}<a href="{BOOK}Blueprint/{module}.html">Read in mdBook <i data-lucide="arrow-up-right"></i></a></div><p><a href="{evidence}">Frozen module record</a> <code>{esc(item.get('statement_id', 'Source marker; typed-claim and Lean validation are not replayed by Pages.'))}</code></p><small>Evidence snapshot: {commit}. The linked mdBook follows upstream development.</small></details></div></article>'''
        results.append(body)
    for item in catalog["publications"]:
        preview = f'<a class="paper-preview" href="{esc(item["url"])}"><img src="{item["image"]}" alt="First page of {esc(item["title"])}" width="340" height="480" loading="lazy"></a>' if item.get("image") else '<div class="journal-mark" aria-label="RAIRO journal article"><strong>RAIRO</strong><span>Theoretical Informatics<br>and Applications</span><span>60 / 2026 / 29</span><a href="https://doi.org/10.1051/ita/2026032">10.1051/ita/2026032</a></div>'
        qualification = f'<p class="news-qualification">{esc(item["qualification"])}</p>' if item.get("qualification") else ''
        publications.append(f'''<article class="news-paper" id="{item['id']}">{preview}<div><p class="eyebrow"><time datetime="{item['date']}">{item['date']}</time> / {esc(item['status'])}</p><h3><a href="{esc(item['url'])}">{esc(item['title'])}</a></h3><p class="paper-authors">{esc(item['authors'])}</p><p class="paper-venue">{esc(item['venue'])}</p><p>{esc(item['summary'])}</p><p class="paper-highlight">{esc(item['highlight'])}</p>{qualification}<div class="news-links"><a href="{esc(item['url'])}">Read article <i data-lucide="arrow-up-right"></i></a></div><details><summary>Source &amp; evidence</summary><p>{esc(item['evidence'])}</p></details></div></article>''')
    # Evidence cards are built once. The reading projection groups these same cards.
    body = ('<main class="site-main research-news">' + ''.join(results)
            + '<section id="publications" class="news-section"><h2>Publications</h2>'
            + ''.join(publications) + '</section></main>')
    document = shell("Research", "", body, appearance="editorial").replace('</head>',
        '<link rel="stylesheet" href="assets/research-news.css"><link rel="stylesheet" href="assets/research-editorial.css">'
        '<script type="module" src="assets/research-news.mjs"></script></head>')
    write(output / "research.html", document)
    render_result_pages(output, records, shell)
    apply_reading_views(output, snapshot, records)
