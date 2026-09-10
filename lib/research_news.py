"""Editorial research records, kept separate from release-certified graph data."""
import json
from pathlib import Path

from lib.knowledge_pages import esc, write
from lib.research_results import STORIES, render_result_pages

CATALOG = Path(__file__).resolve().parents[1] / "site/assets/research-news.json"
REPO = "https://github.com/the-omega-institute/trureturing"
BOOK = "https://the-omega-institute.github.io/trureturing-mdbook/"


def result_records(snapshot):
    results = json.loads(CATALOG.read_text())["results"]
    stories = json.loads(STORIES.read_text())
    for item in results:
        if item["id"] in stories:
            item["result_path"] = f'results/{item["id"]}/'
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
        registration = "Source-recorded resolution in this release" if item.get("resolution_record") else "Reviewed result / pinned upstream proof"
        slug = item.get("problem_slug")
        dossier = f'<a href="research/{slug}/">Release dossier</a>' if item.get("resolution_record") else ''
        attributes = f' data-problem-slug="{esc(slug)}" data-resolution-kind="{item["kind"]}"' if item.get("resolution_record") else ''
        result_url = item.get("result_path", f'research.html#{item["id"]}')
        rows.append(f'''<article class="resolved-question" id="resolved-{item['id']}"><p class="eyebrow">{esc(item['field'])}</p><h3>{esc(item['title'])}</h3><p><span class="news-status {item['kind']}">{item['kind'].capitalize()}{' / source record' if item.get('resolution_record') and not item.get('pr') else ' in Lean'}</span></p><p>{esc(item['summary'])}</p><small>{registration}</small><div class="news-links"><a href="{result_url}">Result &amp; exact scope <i data-lucide="arrow-up-right"></i></a><a href="{BOOK}Blueprint/{item['module']}.html">mdBook explanation <i data-lucide="arrow-up-right"></i></a>{dossier}</div></article>''')
        rows[-1] = rows[-1].replace('class="resolved-question"', 'class="resolved-question"' + attributes, 1)
    return f'''<section class="resolved-questions" id="resolved-questions" aria-labelledby="resolved-title"><div class="news-section-heading"><div><p class="eyebrow">QUESTIONS WITH RESULTS</p><h2 id="resolved-title">Resolved questions</h2></div><a href="{BOOK}open-problems.html">Further reading / mdBook <i data-lucide="arrow-up-right"></i></a></div><div class="resolved-question-list">{''.join(rows)}</div></section>'''


def render_news(output, snapshot, shell):
    catalog = json.loads(CATALOG.read_text())
    publications, results = [], []
    nodes = snapshot["graph"]["nodes"]
    records = result_records(snapshot)
    for item in records:
        module, commit = item["module"], item["source_commit"]
        released = any(n.get("repo_path") == module + ".lean" or n.get("id") == module for n in nodes)
        release_state = "Module present in current Truth release; resolution evidence is pinned below." if released else "Upstream Frozen / not in current Truth release"
        item["release_state"] = release_state
        evidence = f'{REPO}/blob/{commit}/Golden/Frozen/state/{module}.lean.json'
        date = f'<time datetime="{item["date"]}">{item["date"]}</time>' if item.get("date") else '<span>Release source record</span>'
        status = item['kind'].capitalize() + (" in Lean" if item.get("pr") else " / source record")
        proof = f'<a href="{REPO}/pull/{item["pr"]}">Development PR #{item["pr"]}</a>' if item.get("pr") else ''
        binding = f'<a href="research/{item["problem_slug"]}/">Release problem dossier</a>' if item.get("resolution_record") else ''
        reading = f'<a href="{item["result_path"]}">Read result <i data-lucide="arrow-up-right"></i></a><a href="{item["result_path"]}#lean">Lean theorem <i data-lucide="code-xml"></i></a>' if item.get("result_path") else f'<a href="{REPO}/blob/{commit}/Blueprint/{module}.md">Proof explanation <i data-lucide="arrow-up-right"></i></a>'
        body = f'''<article class="news-result" id="{item['id']}"><div class="news-result-meta">{date}<span class="news-status {item['kind']}">{status}</span></div><div><p class="eyebrow">{esc(item['field'])}</p><h3>{esc(item['title'])}</h3><p>{esc(item['summary'])}</p><div class="news-links">{reading}<a href="{esc(item['source_url'])}">Original question</a><a href="conjectures.html#resolved-{item['id']}">Question record</a>{binding}</div><details><summary>Exact scope &amp; proof record</summary><p>{esc(item['scope'])}</p><p class="news-release-state">{release_state}</p><p><a href="{REPO}/blob/{commit}/{module}.lean">{esc(module + '.' + item['declaration'])}</a></p><div class="news-links">{proof}<a href="{BOOK}Blueprint/{module}.html">Read in mdBook <i data-lucide="arrow-up-right"></i></a></div><p><a href="{evidence}">Frozen module record</a> <code>{esc(item.get('statement_id', 'Source marker; typed-claim and Lean validation are not replayed by Pages.'))}</code></p><small>Evidence snapshot: {commit}. The linked mdBook follows upstream development.</small></details></div></article>'''
        results.append(body)
    for item in catalog["publications"]:
        preview = f'<a class="paper-preview" href="{esc(item["url"])}"><img src="{item["image"]}" alt="First page of {esc(item["title"])}" width="340" height="480" loading="lazy"></a>' if item.get("image") else '<div class="journal-mark" aria-label="RAIRO journal article"><strong>RAIRO</strong><span>Theoretical Informatics<br>and Applications</span><span>60 / 2026 / 29</span><a href="https://doi.org/10.1051/ita/2026032">10.1051/ita/2026032</a></div>'
        qualification = f'<p class="news-qualification">{esc(item["qualification"])}</p>' if item.get("qualification") else ''
        publications.append(f'''<article class="news-paper" id="{item['id']}">{preview}<div><p class="eyebrow"><time datetime="{item['date']}">{item['date']}</time> / {esc(item['status'])}</p><h3><a href="{esc(item['url'])}">{esc(item['title'])}</a></h3><p class="paper-authors">{esc(item['authors'])}</p><p class="paper-venue">{esc(item['venue'])}</p><p>{esc(item['summary'])}</p><p class="paper-highlight">{esc(item['highlight'])}</p>{qualification}<div class="news-links"><a href="{esc(item['url'])}">Read article <i data-lucide="arrow-up-right"></i></a></div><details><summary>Source &amp; evidence</summary><p>{esc(item['evidence'])}</p></details></div></article>''')
    body = f'''<main class="site-main research-news"><header class="news-heading"><p class="eyebrow">THE OMEGA INSTITUTE</p><h1>Research</h1><p class="news-lede">Mathematical discoveries, formal proofs, and the questions that come next.</p><nav class="news-links" aria-label="Research destinations"><a href="conjectures.html#next-questions">Our next questions <i data-lucide="arrow-up-right"></i></a><a href="atlas.html#mode=frontier">Mathematical Atlas <i data-lucide="arrow-up-right"></i></a></nav></header><nav class="news-index" aria-label="Research sections"><a href="#results">Resolved questions <strong>{len(results):02}</strong></a><a href="#publications">Publications <strong>{len(publications):02}</strong></a><span>Updated {catalog['reviewed']}</span></nav><section id="results" class="news-section"><div class="news-section-heading"><div><p class="eyebrow">FROM QUESTION TO RESULT</p><h2>Resolved questions</h2></div><a href="conjectures.html#next-questions">Where this leads next <i data-lucide="arrow-up-right"></i></a></div><div class="news-results-grid">{''.join(results)}</div></section><section id="publications" class="news-section"><div class="news-section-heading"><div><p class="eyebrow">PAPERS &amp; PREPRINTS</p><h2>Publications</h2></div></div>{''.join(publications)}</section><section class="news-onward"><h2>The next questions</h2><p>Explore the conjectures and proof targets growing from these results.</p><a href="conjectures.html#next-questions">Conjectures <i data-lucide="arrow-up-right"></i></a><a href="{BOOK}open-problems.html">Further reading in mdBook <i data-lucide="arrow-up-right"></i></a></section></main>'''
    body = body.replace('</header>', '</header><nav class="conjecture-destinations" aria-label="Connected research"><a href="discover.html">Research bridges</a><a href="oeis/">OEIS connections</a></nav>', 1)
    html = shell("Research", "", body, appearance="editorial").replace('</head>', '<link rel="stylesheet" href="assets/research-news.css"><link rel="stylesheet" href="assets/research-editorial.css"><script type="module" src="assets/research-news.mjs"></script></head>')
    write(output / "research.html", html)
    render_result_pages(output, records, shell)
