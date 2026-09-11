"""Reader-facing result pages with verbatim, pinned Lean source."""
import hashlib
import json
from pathlib import Path

from lib.knowledge_pages import esc, write

ASSETS = Path(__file__).resolve().parents[1] / "site/assets"
STORIES = ASSETS / "result-stories.json"
REPO = "https://github.com/the-omega-institute/trureturing"


def followup_families():
    families = json.loads((ASSETS / "research-catalog.json").read_text())["families"]
    stories = json.loads(STORIES.read_text())
    followups = [family for family in families if family.get("builds_on")]
    if any(family["builds_on"] not in stories for family in followups):
        raise ValueError("Research direction references an unknown completed result")
    return followups


def render_followups(snapshot):
    resolved = {problem['slug'] for problem in snapshot['problems'] if problem.get('resolution')}
    rows = []
    for family in followup_families():
        if family['id'] in resolved:
            continue
        targets = ''.join(f'<a href="#rp={target["id"]}">{esc(target["title"])} <i data-lucide="arrow-up-right"></i></a>' for target in family['targets'])
        rows.append(f'''<article class="result-followup"><p class="eyebrow">{esc(family['area'])}</p><h3><a href="#rp={family['id']}">{esc(family['title'])}</a></h3><p>{esc(family['next_step'])}</p><div class="followup-targets">{targets}</div><a class="followup-origin" href="results/{family['builds_on']}/">Completed result <i data-lucide="arrow-up-right"></i></a></article>''')
    return f'''<section class="result-followups" id="next-questions" aria-labelledby="next-questions-title"><div class="news-section-heading"><div><p class="eyebrow">FROM RESULTS TO NEW QUESTIONS</p><h2 id="next-questions-title">The next questions</h2></div><a href="research.html#results">Completed results <i data-lucide="arrow-down"></i></a></div><div class="followup-grid">{''.join(rows) or '<p>No remaining follow-up families in this source snapshot.</p>'}</div></section>'''


def proof_source(item, story):
    raw = (ASSETS / "proofs" / (item["id"] + ".lean")).read_bytes()
    if hashlib.sha256(raw).hexdigest() != story["source_sha256"]:
        raise ValueError(f"Pinned Lean source digest mismatch: {item['id']}")
    source = raw.decode("utf-8")
    lines = source.splitlines()

    def excerpt(bounds):
        start, end = bounds
        if not 1 <= start <= end <= len(lines):
            raise ValueError(f"Invalid Lean excerpt range: {item['id']}")
        return "\n".join(lines[start - 1:end])

    theorem = excerpt(story["theorem_lines"])
    if not theorem.startswith("theorem " + item["declaration"] + " "):
        raise ValueError(f"Lean excerpt names a different declaration: {item['id']}")
    end = story["theorem_lines"][1]
    if end < len(lines) and lines[end].strip():
        raise ValueError(f"Lean theorem excerpt ends inside a declaration: {item['id']}")
    definitions = "\n\n".join(excerpt(bounds) for bounds in story["definition_lines"])
    return source, theorem, definitions


def math_blocks(formulas):
    return "".join(f'<div class="math-display">{esc(formula)}</div>' for formula in formulas)


def render_result_pages(output, items, shell):
    stories = json.loads(STORIES.read_text())
    resolved = {item['problem_slug'] for item in items if item.get('resolution_record')}
    followups = [family for family in followup_families() if family['id'] not in resolved]
    for item in items:
        story = stories.get(item["id"])
        if not story:
            continue
        source, theorem, definitions = proof_source(item, story)
        root = "../../"
        lean_url = f'{REPO}/blob/{item["source_commit"]}/{item["module"]}.lean'
        source_asset = f'assets/proofs/{item["id"]}.lean'
        steps = "".join(f'<li><h3>{esc(step["title"])}</h3><p>{esc(step["body"])}</p><code>{esc(step["declaration"])}</code></li>' for step in story["steps"])
        example = story["example"]
        rows = "".join(
            f'<div class="result-sequence"><span>{esc(row["label"])}</span><ol>'
            + "".join(f'<li class="{"marked" if index in row["marked"] else ""}">{value}</li>' for index, value in enumerate(row["values"]))
            + '</ol></div>' for row in example["rows"])
        others = "".join(f'<a href="../{other["id"]}/">{esc(other["title"])}<i data-lucide="arrow-up-right"></i></a>' for other in items if other["id"] in stories and other["id"] != item["id"])
        next_questions = ''.join(f'<a href="{root}conjectures.html#rp={family["id"]}">{esc(family["title"])} <i data-lucide="arrow-up-right"></i></a>' for family in followups if family['builds_on'] == item['id'])
        next_section = f'<section class="result-more" id="next-questions"><p class="eyebrow">CONTINUING THIS WORK</p><h2>What comes next</h2>{next_questions}</section>' if next_questions else ''
        body = f'''<main class="site-main result-page">
<nav class="result-breadcrumb" aria-label="Breadcrumb"><a href="{root}research.html#results"><i data-lucide="arrow-left"></i> Research</a><span>{esc(item['field'])}</span></nav>
<header class="result-heading"><p class="eyebrow">THE OMEGA INSTITUTE / RESEARCH RESULT</p><h1>{esc(item['title'])}</h1><div class="result-meta"><span class="news-status {item['kind']}">{item['kind'].capitalize()} in Lean</span><time datetime="{item['date']}">{item['date']}</time><a href="{esc(item['source_url'])}">Original paper <i data-lucide="arrow-up-right"></i></a></div><p class="result-lede">{esc(story['finding'])}</p><div class="result-equations prose">{math_blocks(story['formulas'])}</div></header>
<div class="result-layout"><aside class="result-toc"><nav aria-label="Result sections"><a href="#question">The question</a><a href="#example">A concrete example</a><a href="#proof">Proof idea</a><a href="#scope">Exact scope</a><a href="#lean">Lean theorem</a><a href="#sources">Sources</a></nav></aside><article class="result-content">
<section id="question"><p class="eyebrow">01 / THE QUESTION</p><h2>From the original paper</h2><p>{esc(story['question'])}</p><a class="result-citation" href="{esc(item['source_url'])}">{esc(story['source_label'])}</a></section>
<section id="example"><p class="eyebrow">02 / A CONCRETE EXAMPLE</p><h2>{esc(example['title'])}</h2><figure class="result-example"><div class="prose">{math_blocks(example['formulas'])}</div>{rows}<figcaption>{esc(example['text'])}</figcaption></figure></section>
<section id="proof"><p class="eyebrow">03 / PROOF IDEA</p><h2>How the argument works</h2><ol class="result-proof-steps">{steps}</ol></section>
<section id="scope"><p class="eyebrow">04 / EXACT SCOPE</p><h2>What this settles</h2><p>{esc(item['scope'])}</p><p class="result-boundary">{esc(story['boundary'])}</p></section>
<section id="lean"><p class="eyebrow">05 / FORMAL STATEMENT</p><h2>The Lean theorem</h2><p>{esc(story['notation'])}</p><div class="result-code-toolbar"><span>Lean 4.33.0 / exact source excerpt</span><div><button type="button" data-copy-theorem aria-label="Copy theorem" title="Copy theorem" hidden><i data-lucide="copy"></i></button><a href="{root}{source_asset}" download title="Download full Lean source" aria-label="Download full Lean source"><i data-lucide="download"></i></a></div></div><pre class="result-code" tabindex="0" aria-label="Lean theorem and proof"><code id="result-theorem">{esc(theorem)}</code></pre><p class="result-copy-status" role="status"></p><p class="result-code-note">This theorem uses definitions and lemmas from the complete module.</p><details class="result-source-details"><summary>Definitions used in the statement</summary><pre class="result-code" tabindex="0"><code>{esc(definitions)}</code></pre></details><details class="result-source-details"><summary>Complete Lean module ({len(source.splitlines())} lines)</summary><pre class="result-code result-full-source" tabindex="0"><code>{esc(source)}</code></pre></details><div class="news-links"><a href="{root}{source_asset}" download>Download .lean <i data-lucide="download"></i></a><a href="{lean_url}#L{story['theorem_lines'][0]}">View pinned source <i data-lucide="arrow-up-right"></i></a></div></section>
<section id="sources"><p class="eyebrow">06 / SOURCES</p><h2>Paper and proof provenance</h2><div class="result-source-links"><a href="{esc(item['source_url'])}">{esc(story['source_label'])}</a><a href="{lean_url}">Complete Lean source at the evidence commit</a><a href="https://the-omega-institute.github.io/trureturing-mdbook/Blueprint/{item['module']}.html">Further reading in mdBook</a></div><details class="result-provenance"><summary>Repository &amp; verification record</summary><p class="news-release-state">{esc(item['release_state'])}</p><div class="news-links"><a href="{REPO}/pull/{item['pr']}">Development PR #{item['pr']}</a><a href="{REPO}/blob/{item['source_commit']}/Golden/Frozen/state/{item['module']}.lean.json">Frozen module record</a></div><dl><dt>Source commit</dt><dd><code>{item['source_commit']}</code></dd><dt>Frozen module statement ID</dt><dd><code>{esc(item['statement_id'])}</code></dd><dt>Lean file SHA-256</dt><dd><code>{story['source_sha256']}</code></dd></dl><p>mdBook follows upstream development. The Lean source on this page is fixed to the commit above.</p></details></section>
<section><h2>From this result to the next question</h2><p><a href="{root}discover.html?record=result%3A{item['id']}">Explore the evidence journey and research map</a></p></section>{next_section}<section class="result-more"><h2>More results</h2>{others}<a href="{root}conjectures.html">Explore the conjecture bank <i data-lucide="arrow-up-right"></i></a></section>
</article></div></main>'''
        html = shell(item["title"], root, body, appearance="editorial").replace('</head>', f'<link rel="stylesheet" href="{root}assets/research-news.css"><link rel="stylesheet" href="{root}assets/research-result.css"><link rel="stylesheet" href="{root}assets/research-editorial.css"><script type="module" src="{root}assets/research-result.mjs"></script></head>')
        write(output / "results" / item["id"] / "index.html", html)
        write(output / source_asset, source)
