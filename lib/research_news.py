"""Editorial research records, kept separate from release-certified graph data."""
import json
from pathlib import Path

from lib.knowledge_pages import esc, write

CATALOG = Path(__file__).resolve().parents[1] / "site/assets/research-news.json"
REPO = "https://github.com/the-omega-institute/trureturing"
BOOK = "https://the-omega-institute.github.io/trureturing-mdbook/"


def result_records(snapshot):
    results = json.loads(CATALOG.read_text())["results"]
    by_declaration = {r["module"] + "." + r["declaration"]: r for r in results}
    for problem in snapshot["problems"]:
        resolution = problem.get("resolution")
        if not resolution:
            continue
        gid = resolution["declaration_gid"]
        module = resolution["source_path"][len("Blueprint/"):-3]
        if gid in by_declaration:
            item = by_declaration[gid]
            if item["kind"] != resolution["kind"]:
                raise ValueError(f"Editorial result conflicts with source resolution: {gid}")
        else:
            item = {"id": problem["slug"], "title": problem["title"], "field": "Registered external question",
                    "kind": resolution["kind"], "module": module, "declaration": gid[len(module) + 1:],
                    "date": None, "source_commit": snapshot["graph"]["source_snapshot"]["source_commit"],
                    "source_url": "https://doi.org/" + problem["doi"] if problem.get("doi") else "https://arxiv.org/abs/" + problem["arxiv_id"],
                    "summary": "Resolution recorded in the source snapshot for this Truth release.",
                    "scope": problem["sections"]["Problem"]}
            results.append(item)
            by_declaration[gid] = item
        item["problem_slug"] = problem["slug"]
        item["resolution_record"] = resolution
    return results


def resolved_questions(snapshot):
    rows = []
    for item in result_records(snapshot):
        registration = "Source-recorded resolution in this release" if item.get("resolution_record") else "Pinned proof evidence / release binding not recorded"
        slug = item.get("problem_slug")
        dossier = f'<a href="research/{slug}/">Release dossier</a>' if item.get("resolution_record") else ''
        attributes = f' data-problem-slug="{esc(slug)}" data-resolution-kind="{item["kind"]}"' if item.get("resolution_record") else ''
        rows.append(f'''<article class="resolved-question" id="resolved-{item['id']}"><p class="eyebrow">{esc(item['field'])}</p><h3>{esc(item['title'])}</h3><p><span class="news-status {item['kind']}">{item['kind'].capitalize()}{' / source record' if item.get('resolution_record') and not item.get('pr') else ' in Lean'}</span></p><p>{esc(item['summary'])}</p><small>{registration}</small><div class="news-links"><a href="research.html#{item['id']}">Result &amp; exact scope <i data-lucide="arrow-up-right"></i></a><a href="{BOOK}Blueprint/{item['module']}.html">mdBook explanation <i data-lucide="arrow-up-right"></i></a>{dossier}</div></article>''')
        rows[-1] = rows[-1].replace('class="resolved-question"', 'class="resolved-question"' + attributes, 1)
    return f'''<section class="resolved-questions" id="resolved-questions" aria-labelledby="resolved-title"><div class="news-section-heading"><div><p class="eyebrow">QUESTIONS WITH RESULTS</p><h2 id="resolved-title">Resolved questions</h2></div><a href="{BOOK}open-problems.html">mdBook problem registry <i data-lucide="arrow-up-right"></i></a></div><div class="resolved-question-list">{''.join(rows)}</div></section>'''


def render_news(output, snapshot, shell):
    catalog = json.loads(CATALOG.read_text())
    publications, results = [], []
    nodes = snapshot["graph"]["nodes"]
    for item in result_records(snapshot):
        module, commit = item["module"], item["source_commit"]
        released = any(n.get("repo_path") == module + ".lean" or n.get("id") == module for n in nodes)
        release_state = "Module present in current Truth release; resolution evidence is pinned below." if released else "Upstream Frozen / not in current Truth release"
        evidence = f'{REPO}/blob/{commit}/Golden/Frozen/state/{module}.lean.json'
        date = f'<time datetime="{item["date"]}">{item["date"]}</time>' if item.get("date") else '<span>Release source record</span>'
        status = item['kind'].capitalize() + (" in Lean" if item.get("pr") else " / source record")
        proof = f'<a href="{REPO}/pull/{item["pr"]}">Merged proof #{item["pr"]}</a>' if item.get("pr") else ''
        binding = f'<a href="research/{item["problem_slug"]}/">Release problem dossier</a>' if item.get("resolution_record") else ''
        body = f'''<article class="news-result" id="{item['id']}"><div class="news-result-meta">{date}<span class="news-status {item['kind']}">{status}</span></div><div><p class="eyebrow">{esc(item['field'])}</p><h3>{esc(item['title'])}</h3><p>{esc(item['summary'])}</p><p class="news-release-state">{release_state}</p><div class="news-links"><a href="{BOOK}Blueprint/{module}.html">Read dossier <i data-lucide="arrow-up-right"></i></a>{proof}{binding}<a href="conjectures.html#resolved-{item['id']}">Question record</a><a href="{esc(item['source_url'])}">Original question</a></div><details><summary>Exact scope &amp; proof record</summary><p>{esc(item['scope'])}</p><p><a href="{REPO}/blob/{commit}/{module}.lean">{esc(module + '.' + item['declaration'])}</a></p><p><a href="{evidence}">Frozen module record</a> <code>{esc(item.get('statement_id', 'Source marker; typed-claim and Lean validation are not replayed by Pages.'))}</code></p><small>Evidence snapshot: {commit}. The linked mdBook follows upstream development.</small></details></div></article>'''
        results.append(body)
    for item in catalog["publications"]:
        preview = f'<a class="paper-preview" href="{esc(item["url"])}"><img src="{item["image"]}" alt="First page of {esc(item["title"])}" width="340" height="480" loading="lazy"></a>' if item.get("image") else '<div class="journal-mark" aria-label="RAIRO journal article"><strong>RAIRO</strong><span>Theoretical Informatics<br>and Applications</span><span>60 / 2026 / 29</span><a href="https://doi.org/10.1051/ita/2026032">10.1051/ita/2026032</a></div>'
        qualification = f'<p class="news-qualification">{esc(item["qualification"])}</p>' if item.get("qualification") else ''
        publications.append(f'''<article class="news-paper" id="{item['id']}">{preview}<div><p class="eyebrow"><time datetime="{item['date']}">{item['date']}</time> / {esc(item['status'])}</p><h3><a href="{esc(item['url'])}">{esc(item['title'])}</a></h3><p class="paper-authors">{esc(item['authors'])}</p><p class="paper-venue">{esc(item['venue'])}</p><p>{esc(item['summary'])}</p><p class="paper-highlight">{esc(item['highlight'])}</p>{qualification}<div class="news-links"><a href="{esc(item['url'])}">Read article <i data-lucide="arrow-up-right"></i></a></div><details><summary>Source &amp; evidence</summary><p>{esc(item['evidence'])}</p></details></div></article>''')
    body = f'''<main class="site-main research-news"><header class="news-heading"><p class="eyebrow">THE OMEGA INSTITUTE / RESEARCH NEWS</p><h1>Research</h1><p class="news-lede">New proofs. Published work. Open horizons.</p><nav class="news-links" aria-label="Research destinations"><a href="conjectures.html">Conjectures <i data-lucide="arrow-up-right"></i></a><a href="{BOOK}open-problems.html">Problem registry / mdBook <i data-lucide="arrow-up-right"></i></a><a href="atlas.html#mode=frontier">Explore the frontier <i data-lucide="arrow-up-right"></i></a></nav></header><nav class="news-index" aria-label="Research sections"><a href="#results"><strong>{len(results):02}</strong> Recent resolutions</a><a href="#publications"><strong>{len(publications):02}</strong> Publications &amp; preprints</a><span>Updated {catalog['reviewed']}</span></nav><section id="results" class="news-section"><div class="news-section-heading"><div><p class="eyebrow">FROM QUESTION TO RESULT</p><h2>Recent resolutions</h2></div><a href="conjectures.html">Questions still ahead <i data-lucide="arrow-up-right"></i></a></div>{''.join(results)}</section><section id="publications" class="news-section"><div class="news-section-heading"><div><p class="eyebrow">PAPERS / METHODS / EXPERIMENTS</p><h2>Publications</h2></div></div>{''.join(publications)}</section></main>'''
    html = shell("Research", "", body).replace('</head>', '<link rel="stylesheet" href="assets/research-news.css"><script type="module" src="assets/research-news.mjs"></script></head>')
    write(output / "research.html", html)
