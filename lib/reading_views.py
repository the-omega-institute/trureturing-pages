"""Small, theme-preserving enhancements to the original research pages.

Scribe and release gates retain authority. This projection groups existing cards;
it does not replace the site's visual language or classify mathematical claims.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())

@dataclass
class Element:
    tag: str
    attrs: dict
    start: int
    inner: int
    end: int = 0

class Fragments(HTMLParser):
    """Retain original markup, including formulae, links and claim annotations."""
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source, self.items, self.stack = source, [], []
        self.lines = [0] + [m.end() for m in re.finditer('\n', source)]
        self.feed(source)
        self.close()

    def source_offset(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        start = self.source_offset()
        item = Element(tag, dict(attrs), start, start + len(self.get_starttag_text()))
        self.items.append(item)
        if tag in VOID:
            item.end = item.inner
        else:
            self.stack.append(item)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop().end = self.source_offset() + len(self.get_starttag_text())

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i].tag == tag:
                self.stack[i].end = self.source.index('>', self.source_offset()) + 1
                del self.stack[i:]
                return

    def select(self, *, tag=None, cls=None, id=None):
        return [e for e in self.items if e.end and (not tag or e.tag == tag)
                and (not cls or cls in (e.attrs.get('class') or '').split())
                and (not id or e.attrs.get('id') == id)]

    def raw(self, element):
        return self.source[element.start:element.end]


def esc(value):
    return escape(str(value if value is not None else ''), quote=True)


def series(url: str) -> tuple[str, str, str]:
    host = (urlsplit(url).hostname or '').lower().removeprefix('www.')
    if host == 'oeis.org':
        return 'oeis', 'OEIS', 'Questions from the On-Line Encyclopedia of Integer Sequences.'
    if host == 'erdosproblems.com':
        return 'erdos', 'Erdős Problems', 'Questions recorded in the Erdős Problems collection.'
    return 'other', 'Other sources', 'Published questions and results from other recorded sources.'


def source_url(problem):
    from lib.literature import problem_source_url
    return problem_source_url(problem)


def group_html(key, title, description, items, *, prefix, noun):
    return (f'<details class="reading-group" id="{prefix}-{key}" data-reading-group>'
            f'<summary><span><strong>{esc(title)}</strong><small>{esc(description)}</small></span>'
            f'<span class="reading-count" data-group-count>{len(items)} {noun}</span></summary>'
            f'<div class="reading-group-body">{"".join(items) or "<p>No matching records in this release.</p>"}</div></details>')


def search_box(kind):
    return (f'<div class="reading-search"><label for="{kind}-query">Find a {"result" if kind == "results" else "question"}</label>'
            f'<input id="{kind}-query" type="search" data-reading-search placeholder="Title, source or module">'
            '<button type="button" data-clear-search>Clear search</button><p role="status" data-search-count></p></div>')


def replace_main(document: str, body: str):
    parsed = Fragments(document)
    mains = parsed.select(tag='main')
    if len(mains) != 1:
        raise ValueError('Expected one main research surface')
    main = mains[0]
    return document[:main.start] + body + document[main.end:]


def add_spaces_navigation(document: str, root=''):
    """Compatibility name. Keep knowledge and contribution destinations in primary navigation.

    The diagnostic page and old Spaces URLs remain resolvable, but neither is a
    primary knowledge destination. Do not alter citation or evidence links.
    """
    def nav(match):
        content = re.sub(r'<a\b[^>]*href="[^"]*(?:spaces|version-status)\.html(?:[?#][^"]*)?"[^>]*>.*?</a>',
                         '', match[1], flags=re.S)
        return '<nav aria-label="Primary navigation">' + content + '</nav>'
    return re.sub(r'<nav aria-label="Primary navigation">(.*?)</nav>', nav, document, flags=re.S)


def common_shell(document: str, root=''):
    # Preserve the producer-selected appearance. Fix prepaint transitions without
    # turning the author's light academic pages into a dark theme (or vice versa).
    document = document.replace('body{transition:background-color .24s ease,color .24s ease}', 'body{transition:none}')
    if 'assets/reading.css' not in document:
        document = document.replace('</head>', f'<link rel="stylesheet" href="{root}assets/reading.css">'
            f'<script type="module" src="{root}assets/reading.mjs"></script></head>', 1)
    document = re.sub(r'<body\b([^>]*)>',
                      lambda m: m[0] if 'data-reading-page' in m[1] else '<body' + m[1] + ' data-reading-page>', document, count=1)
    return add_spaces_navigation(document, root)


def render_result_index(document, snapshot, records, ranking=None, feed=None):
    """A browsable result index; exact statements and evidence stay in each card."""
    from lib.contributions import build_index
    from lib.research_updates import EMPTY
    ranking = ranking or build_index(snapshot, records)
    feed = feed or EMPTY
    assessments = {r['id']: r for r in ranking['results']}
    order = {r['id']: i for i, r in enumerate(ranking['results'])}
    parsed = Fragments(document)
    articles = {e.attrs.get('id'): parsed.raw(e) for e in parsed.select(cls='news-result')}
    collections = [series('https://oeis.org'), series('https://erdosproblems.com'), series('https://other.example')]
    counts = defaultdict(int)
    rows = []
    for r in sorted(records, key=lambda r: order[r['id']]):
        if r['id'] not in articles:
            raise ValueError('Result card is absent: ' + r['id'])
        key, label, _ = series(r['source_url'])
        counts[key] += 1
        path = urlsplit(r['source_url']).path.strip('/')
        reference = path.split('/')[0] if key in ('oeis', 'erdos') else ''
        source_label = label + (' / ' + reference if reference else '')
        search = ' '.join(str(r.get(k) or '') for k in ('title', 'module', 'source_url', 'field', 'summary', 'declaration'))
        assessment = assessments[r['id']]
        excerpt = str(assessment['assessment'].get('contribution') or r.get('summary') or '').strip()
        # Provenance introductions belong in the expanded source record, not the
        # index's one-line preview. Do not invent a mathematical paraphrase.
        if re.match(r'^(?:(?:The )?OEIS\b|Quoted directly\b|From \[)', excerpt, re.I):
            excerpt = ''
        preview = f'<span class="result-excerpt">{esc(excerpt)}</span>' if excerpt else ''
        rows.append(f'<details id="resolved-{esc(r["id"])}" class="reading-item result-item" data-result-row data-collection="{key}" '
            f'data-kind="{esc(r["kind"])}" data-search="{esc(search.lower())}" '
            f'data-assessment="{esc(json.dumps(assessment["assessment"]["dimensions"]))}" '
            f'data-title="{esc(r["title"].casefold())}">'
            f'<summary><span class="result-summary"><span class="result-source">{esc(source_label)}</span>'
            f'<strong>{esc(r["title"])}</strong>{preview}'
            f'<span class="result-score" data-result-score>{score_label(assessment)}</span></span>'
            f'<span class="result-outcome {esc(r["kind"])}">{esc(r["kind"].capitalize())}</span>'
            '<span class="result-disclosure" aria-hidden="true">+</span></summary>'
            f'<div class="reading-item-body">{assessment_story(assessment)}'
            f'{research_followups(r.get("problem_slug") or r["id"], feed)}'
            f'{articles[r["id"]]}{assessment_details(assessment)}</div></details>')
    filters = (f'<button type="button" data-result-collection="all" aria-pressed="true">All results <span>{len(records)}</span></button>'
        + ''.join(f'<button type="button" id="results-{key}" data-result-collection="{key}" aria-pressed="false">'
                  f'{esc(title)} <span>{counts[key]}</span></button>' for key, title, _ in collections if counts[key]))
    body = (
        '<section id="results" class="news-section" data-research-index><div class="news-section-heading"><div>'
        '<p class="eyebrow">THE COLLECTION</p><h2>Problems &amp; contributions</h2></div>'
        '<p>Original questions. Precise scope. Inspectable proofs.</p></div>'
        '<div class="research-index-controls" data-index-controls hidden>'
        '<div class="research-collections" role="group" aria-label="Result collection">' + filters + '</div>'
        '<div class="research-toolbar"><label class="research-search" for="results-query">'
        '<span>Search results</span><input id="results-query" type="search" placeholder="Search by title, sequence or theorem" autocomplete="off"></label>'
        '<label class="research-outcome-filter" for="results-outcome"><span>Outcome</span>'
        '<select id="results-outcome"><option value="all">All outcomes</option><option value="proved">Proved</option>'
        '<option value="refuted">Refuted</option></select></label>'
        '<button type="button" class="research-reset" data-clear-search>Reset filters</button></div></div>'
        + ranking_controls() + '<div class="research-index-meta"><p role="status" aria-live="polite" data-result-count>'
        f'{len(records)} results</p><span data-ranking-order>'
        + ('Ranked by contribution · unassessed results follow' if any(r['status'] != 'pending' for r in ranking['results'])
           else 'Awaiting assessments · ordered by title') + '</span></div>'
        '<div id="result-archive">' + ''.join(rows) + '</div>'
        '<div class="research-no-results" data-result-empty hidden><h3>No matching results</h3>'
        '<p>Try a different title, sequence number or collection.</p></div>'
        '<div class="research-pagination"><button type="button" data-result-more hidden>Show more results</button></div></section>'
    )
    return body


def score_label(item):
    if item['status'] == 'complete':
        return f'{item["score"]:g} / 100'
    return 'Partial assessment' if item['status'] == 'partial' else 'Assessment pending'


def ranking_controls():
    from lib.contributions import DIMENSIONS
    options = ''.join(f'<label><input type="checkbox" data-rank-dimension="{key}" data-weight="{weight}" checked>'
                      f'<span>{esc(label)}</span></label>' for key, (label, weight) in DIMENSIONS.items())
    return ('<details class="ranking-controls"><summary>What matters to you?</summary>'
            '<fieldset data-rank-picker hidden><legend>Rank by one or more dimensions</legend>' + options + '</fieldset>'
            '<p>Complete assessments appear first. Missing evidence stays unscored. '
            'Problem age measures time since the question was posed, not years of unsuccessful research.</p>'
            '<a href="ranking.html">How the ranking works</a></details>')


def assessment_story(item):
    data = item['assessment']
    return ''.join(f'<p class="contribution-story"><strong>{label}</strong> {esc(data[key])}</p>'
                   for key, label in [('question_context', 'Why it matters.'), ('contribution', 'Our contribution.'),
                                      ('next_question', 'What comes next.')] if data.get(key))


def assessment_details(item):
    from lib.contributions import DIMENSIONS
    data = item['assessment']['dimensions']
    if not data:
        return ''
    rows = []
    for key, fact in data.items():
        label, weight = DIMENSIONS[key]
        links = ' · '.join(f'<a href="{esc(url)}">Source {i + 1}</a>' for i, url in enumerate(fact['evidence']))
        rows.append(f'<li><strong>{esc(label)}</strong> · {fact["level"]}/4 · {weight}% weight'
                    f'<p>{esc(fact["rationale"])}</p>{links}</li>')
    return '<details class="assessment-evidence"><summary>Ranking evidence</summary><ul>' + ''.join(rows) + '</ul></details>'


def research_followups(slug, feed):
    sentences = []
    for paper in feed['publications']:
        if slug in paper['problem_ids']:
            label = 'arXiv' if urlsplit(paper['url']).hostname in ('arxiv.org', 'www.arxiv.org') else 'Paper'
            sentences.append(f'<p>Further research on {esc(paper["topic"])} — '
                             f'see more details here: <a href="{esc(paper["url"])}">{label}</a>.</p>')
    for project in feed['collaborations']:
        if slug in project['problem_ids']:
            people = '; '.join(f'{esc(p["name"])} from {esc(p["institution"])}' for p in project['people'])
            sentences.append(f'<p>In collaboration with {people} to further investigate '
                             f'<a href="{esc(project["evidence_url"])}">{esc(project["topic"])}</a>.</p>')
    return '<div class="research-followups">' + ''.join(sentences) + '</div>' if sentences else ''


def render_research_groups(document, snapshot, records):
    """Research is a publication shelf. Conjectures owns the result catalogue."""
    parsed = Fragments(document)
    papers = parsed.select(id='publications')
    body = ('<main class="site-main research-news research-publications"><header class="news-heading">'
            '<div class="research-intro"><p class="eyebrow">THE OMEGA INSTITUTE / RESEARCH</p>'
            '<h1>Research</h1><p class="news-lede">Papers that take the work further.</p>'
            '<p class="research-intro-note">Publications and preprints from our research and collaborations.</p>'
            '<nav class="news-links" aria-label="Research destinations">'
            '<a href="conjectures.html#results">Explore problems &amp; contributions ↗</a></nav></div></header>'
            + (parsed.raw(papers[0]) if papers else '<section id="publications"><h2>Publications</h2></section>')
            + '</main>')
    result = common_shell(replace_main(document, body))
    # Bare historical result anchors are known from this exact catalogue. Other
    # fragments (including paper anchors) stay on Research.
    aliases = json.dumps([r['id'] for r in records]).replace('<', '\\u003c')
    result = result.replace('</head>', '<link rel="stylesheet" href="assets/research-index.css">'
                            '<script type="application/json" id="legacy-result-ids">' + aliases + '</script>'
                            '<script src="assets/research-route.js"></script></head>', 1)
    return result


def millennium_entry(output):
    from lib.conjecture_collection import render_horizons
    path = output / 'assets/millennium-data.json'
    if not path.exists():
        path = ROOT / 'site/assets/millennium-data.json'
    return render_horizons(json.loads(path.read_text()))


def render_conjecture_groups(document, snapshot, output, result_document=None, records=None, feed=None):
    from lib.conjecture_collection import render_collection
    catalog = json.loads((ROOT / 'site/assets/research-directions.json').read_text())
    sources = json.loads((ROOT / 'site/assets/conjecture-sources.json').read_text())
    records = records or []
    from lib.contributions import build_index
    ranking = build_index(snapshot, records, output / 'assets/contribution-index.json')
    body = ('<main class="site-main research-home research-news" data-curated-home>'
        '<header class="page-heading curated-heading"><div><p class="eyebrow">PROBLEMS &amp; CONTRIBUTIONS</p>'
        '<h1>Conjectures</h1><p class="lede">The questions we resolve. The ideas we contribute. What comes next.</p>'
        '</div><a class="console-link" href="research.html">Papers &amp; preprints ↗</a></header>'
        '<nav class="news-index" aria-label="Conjecture sections"><a href="#results">Contributions</a>'
        '<a href="#source-questions">Open questions</a><a href="#millennium-entry">Future pursuits</a></nav>'
        + render_result_index(result_document or document, snapshot, records, ranking, feed)
        + render_collection(catalog, snapshot, sources['questions']) + millennium_entry(output) + '</main>')
    result = common_shell(replace_main(document, body))
    return result.replace('</head>', '<link rel="stylesheet" href="assets/conjecture-collection.css">'
        '<link rel="stylesheet" href="assets/research-index.css">'
        '<script type="module" src="assets/research-index.mjs"></script>'
        '<script type="module" src="assets/conjecture-collection.mjs"></script></head>', 1)


def apply_reading_views(output: Path, snapshot: dict, records: list, feed=None):
    output = Path(output)
    from lib.living_library import page_shell
    source = (output / 'research.html').read_text() if (output / 'research.html').exists() else ''
    if source and not (output / 'conjectures.html').exists():
        (output / 'conjectures.html').write_text(page_shell('Conjectures', '', '<main></main>', active='Conjectures', appearance='editorial').replace(
            '</head>', '<link rel="stylesheet" href="assets/research-news.css"></head>'))
    for name, render in [('research.html', lambda d: render_research_groups(d, snapshot, records)),
                         ('conjectures.html', lambda d: render_conjecture_groups(d, snapshot, output, source, records, feed))]:
        path = output / name
        if path.exists():
            path.write_text(render(path.read_text()), encoding='utf-8')
    from lib.contributions import DIMENSIONS
    weights = ''.join(f'<li>{esc(label)}: {weight}%</li>' for label, weight in DIMENSIONS.values())
    body = ('<main class="site-main research-news ranking-method"><header class="page-heading">'
            '<h1>How the ranking works</h1></header>'
            '<p>We rank the significance of a question together with the contribution of its resolution. '
            'Useful new definitions and reusable methods carry more weight than an isolated theorem or counterexample.</p>'
            '<ul>' + weights + '</ul>'
            '<p>Each dimension has a level from 0 to 4, a written reason and linked evidence. '
            'Scholarly context considers the proposer’s documented work, standing and relevance to the field, '
            'including verified affiliations. An institution name alone does not establish mathematical importance.</p>'
            '<p>Problem age is measured from the documented year the question was posed to the year of resolution. '
            'The levels are 0–1, 2–4, 5–14, 15–39 and 40+ years. '
            'The age of a source is not evidence of sustained unsuccessful attempts.</p>'
            '<p>The score is the weighted sum of the selected levels, scaled to 100. '
            'Complete assessments come first, followed by partial assessments and then unassessed results. '
            'Within partial assessments we order by evidenced points without filling in missing dimensions. '
            'Ties use title and stable ID. Selecting several dimensions changes the ranking locally.</p>'
            '<p>Assessments come from the source release; scores are calculated automatically on each build. '
            'Missing evidence stays unscored. Publication and collaboration updates do not add ranking points.</p>'
            '<a href="conjectures.html#results">Back to contributions</a></main>')
    (output / 'ranking.html').write_text(common_shell(page_shell('How the ranking works', '', body, appearance='editorial')))
    for pattern in ('research/*/index.html', 'results/*/index.html', 'oeis/*/index.html'):
        for path in output.glob(pattern):
            path.write_text(common_shell(path.read_text(), '../../'), encoding='utf-8')
    for path in output.glob('*.html'):
        # Maps retain their original theme/layout. Only navigation is normalized.
        path.write_text(add_spaces_navigation(path.read_text()), encoding='utf-8')
