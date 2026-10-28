"""Small, theme-preserving enhancements to the original research pages.

Scribe and release gates retain authority. This projection groups existing cards;
it does not replace the site's visual language or classify mathematical claims.
"""
from __future__ import annotations

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


# These are deliberately broad reading categories. They are derived from the
# released module path so a new upstream result appears in the map without an
# editorial handoff or a second taxonomy to maintain.
DISCIPLINE_RULES = (
    ('Quantum information', 'Quantum Information, Channels & Operator Theory',
     'channels · bounds · entanglement', ('Quantum', 'Entropy', 'Divergence', 'Estimation', 'Resource')),
    ('Discrete structures', 'Combinatorics, Sequences & Discrete Structures',
     'words · recurrences · extremal patterns', ('Combinatorics', 'Words', 'Recurrence', 'Certificates', 'PatternAvoidance')),
    ('Number theory', 'Arithmetic, Number Theory & Integer Sequences',
     'arithmetic · primes · factorization', ('Arith', 'Digit', 'Factorization', 'Prime', 'Constants')),
    ('Analysis & dynamics', 'Analysis, Dynamics & Statistical Mechanics',
     'asymptotics · flows · many-body structure', ('Analytic', 'FluidDynamics', 'StatisticalMechanics', 'ConceptDynamics', 'Scale')),
    ('Geometry & algebra', 'Geometry, Algebra & Topology',
     'spaces · symmetries · invariants', ('Geometry', 'QuadraticForms', 'FiniteGroups', 'HomologicalAlgebra', 'Topology', 'Algebra')),
)
DISCIPLINE_FALLBACK = ('Further frontiers', 'Further Mathematical Frontiers',
                        'zero distributions · automata · asymptotics')


def discipline_for(module):
    module = str(module or '')
    for label, _, _, needles in DISCIPLINE_RULES:
        if any(needle.casefold() in module.casefold() for needle in needles):
            return label
    return DISCIPLINE_FALLBACK[0]


def overview_data(records):
    from collections import Counter
    fields = Counter(discipline_for(record.get('module')) for record in records)
    ordered = [(label, fields.get(label, 0)) for label, _, _, _ in DISCIPLINE_RULES]
    ordered.append((DISCIPLINE_FALLBACK[0], fields.get(DISCIPLINE_FALLBACK[0], 0)))
    proved = sum(1 for record in records if str(record.get('kind', '')).casefold() == 'proved')
    refuted = sum(1 for record in records if str(record.get('kind', '')).casefold() == 'refuted')
    return {'total': len(records), 'proved': proved, 'refuted': refuted,
            'outcomes': Counter((discipline_for(r.get('module')), r.get('kind')) for r in records),
            'disciplines': [(label, count) for label, count in ordered if count]}


def render_conjecture_overview(records):
    """Show the release as a small, accessible map before the ranked catalogue."""
    data = overview_data(records)
    total, proved, refuted = data['total'], data['proved'], data['refuted']
    disciplines = data['disciplines']
    # The SVG is an orientation device, not a second data source. The list
    # below it remains the text fallback for screen readers and narrow screens.
    row_height = 44
    svg_height = max(246, 92 + row_height * len(disciplines))
    middle = []
    edges = []
    labels = []
    display = {label: (name, scope) for label, name, scope, _ in DISCIPLINE_RULES}
    display[DISCIPLINE_FALLBACK[0]] = (DISCIPLINE_FALLBACK[1], DISCIPLINE_FALLBACK[2])
    for index, (label, count) in enumerate(disciplines):
        y = 38 + index * row_height
        safe_label = esc(label)
        middle.append(f'<g class="overview-field"><rect x="302" y="{y}" width="238" height="32" rx="4"/> '
                      f'<text x="318" y="{y + 14}">{safe_label}</text><text class="overview-count" x="524" y="{y + 14}" text-anchor="end">{count}</text></g>')
        edges.append(f'<path class="overview-edge" d="M 218 143 C 260 143, 260 {y + 16}, 302 {y + 16}"/>')
        for kind, outcome_y in [('proved', 102), ('refuted', 172)]:
            amount = data['outcomes'][label, kind]
            if amount:
                edges.append(f'<path class="overview-edge {kind}" data-field="{safe_label}" data-outcome="{kind}" data-count="{amount}" '
                             f'd="M 540 {y + 16} C 604 {y + 16}, 628 {outcome_y}, 676 {outcome_y}">'
                             f'<title>{safe_label}: {amount} {kind}</title></path>')
        name, scope = display[label]
        labels.append(f'<li><span class="overview-dot"></span><span class="overview-legend-copy"><strong class="overview-legend-name">{esc(name)}</strong><small>{esc(scope)}</small></span><strong class="overview-legend-count">{count}</strong></li>')
    svg = (f'<svg class="overview-map" viewBox="0 0 900 {svg_height}" role="img" aria-labelledby="overview-map-title overview-map-desc">'
           f'<title id="overview-map-title">Resolved conjectures by mathematical area</title>'
           f'<desc id="overview-map-desc">{total} resolved results flow through {len(disciplines)} mathematical areas into proved and refuted outcomes.</desc>'
           '<defs><linearGradient id="overview-line" x1="0" x2="1"><stop offset="0" stop-color="#6e9d88"/><stop offset="1" stop-color="#b58a66"/></linearGradient></defs>'
           + ''.join(edges)
           + '<g class="overview-root"><rect x="30" y="111" width="188" height="64" rx="7"/><text x="48" y="137">Resolved release</text><text class="overview-root-number" x="48" y="160">' + str(total) + '</text></g>'
           + ''.join(middle)
           + '<g class="overview-outcome overview-proved"><rect x="676" y="78" width="180" height="48" rx="7"/><text x="696" y="98">Proved</text><text class="overview-outcome-number" x="836" y="108" text-anchor="end">' + str(proved) + '</text></g>'
           + '<g class="overview-outcome overview-refuted"><rect x="676" y="148" width="180" height="48" rx="7"/><text x="696" y="168">Refuted</text><text class="overview-outcome-number" x="836" y="178" text-anchor="end">' + str(refuted) + '</text></g>'
           + '</svg>')
    return ('<section id="conjecture-overview" class="conjecture-overview" aria-labelledby="conjecture-overview-title">'
            '<div class="overview-copy"><p class="eyebrow">THE OMEGA INSTITUTE / TRUTH RELEASE</p>'
            '<h2 id="conjecture-overview-title">What we have resolved</h2>'
            '<p class="overview-lede">One release, multiple areas of mathematics, two kinds of answer.</p>'
            '<p>Each entry below records the exact question, the contribution that settles its released scope, and the next boundary it leaves open.</p>'
            f'<div class="overview-metrics"><div><strong>{total:,}</strong><span>resolved results</span></div><div><strong>{proved:,}</strong><span>proved</span></div><div><strong>{refuted:,}</strong><span>refuted</span></div></div></div>'
            f'<div class="overview-visual">{svg}</div><ul class="overview-legend">{"".join(labels)}</ul></section>')


def _trim_text(value, limit=280):
    value = ' '.join(str(value or '').split())
    return value if len(value) <= limit else value[:limit - 1].rstrip() + '…'


def research_highlights(snapshot, records, ranking, limit=3):
    """Build short story cards from released assessments and current stories."""
    stories_path = ROOT / 'site/assets/result-stories.json'
    stories = json.loads(stories_path.read_text()) if stories_path.exists() else {}
    by_id = {record['id']: record for record in records}
    selected = []
    # A story with a current release record is the richest explanation. Fill
    # the remaining slots with the automatic reading order so the page keeps
    # changing as upstream releases add results.
    for item in ranking.get('results', []):
        if item['id'] in stories and item['id'] in by_id:
            selected.append(item)
    selected.extend(item for item in ranking.get('results', []) if item not in selected)
    cards = []
    for index, item in enumerate(selected[:limit], 1):
        record = by_id.get(item['id'], {})
        assessment = item.get('assessment', {})
        dimensions = assessment.get('dimensions', {})
        method = dimensions.get('methods', {}).get('excerpt') if isinstance(dimensions.get('methods'), dict) else ''
        story = stories.get(item['id'], {})
        question = story.get('question') or assessment.get('question_context') or record.get('summary') or record.get('scope')
        idea = (story.get('steps') or [{}])[0].get('body') if story.get('steps') else ''
        idea = idea or method or assessment.get('contribution') or record.get('summary')
        finding = story.get('finding') or ('The released statement is proved.' if record.get('kind') == 'proved' else 'The released statement is refuted.')
        boundary = story.get('boundary') or assessment.get('next_question') or 'The next boundary is recorded in the result dossier.'
        outcome = str(record.get('kind') or 'result').capitalize()
        cards.append(
            '<article class="highlight-card">'
            f'<div class="highlight-card-top"><span class="highlight-index">{index:02}</span><span class="highlight-outcome {esc(record.get("kind", ""))}">{esc(outcome)}</span></div>'
            f'<h3><a href="conjectures.html#resolved-{esc(item["id"])}">{esc(item.get("title") or record.get("title"))}</a></h3>'
            '<div class="highlight-story">'
            f'<p><span>The question</span>{esc(_trim_text(question))}</p>'
            f'<p><span>The idea</span>{esc(_trim_text(idea))}</p>'
            f'<p><span>The result</span>{esc(_trim_text(finding))}</p>'
            f'<p><span>What it opens</span>{esc(_trim_text(boundary))}</p>'
            '</div><a class="highlight-link" href="conjectures.html#resolved-' + esc(item['id']) + '">Read the result ↗</a></article>')
    return ''.join(cards)


def render_result_index(document, snapshot, records, ranking=None, feed=None):
    """Server-ranked contributions, with one small search field and no score controls."""
    from lib.contributions import build_index
    from lib.research_updates import EMPTY
    from lib.result_highlights import result_highlight
    ranking = ranking or build_index(snapshot, records)
    feed = feed or EMPTY
    assessments = {r['id']: r for r in ranking['results']}
    order = {r['id']: i for i, r in enumerate(ranking['results'])}
    parsed = Fragments(document)
    articles = {e.attrs.get('id'): parsed.raw(e) for e in parsed.select(cls='news-result')}
    problems = {p['slug']: p for p in snapshot.get('problems', [])}
    rows = []
    for r in sorted(records, key=lambda r: order[r['id']]):
        if r['id'] not in articles:
            raise ValueError('Result card is absent: ' + r['id'])
        assessed = assessments[r['id']]
        highlight = result_highlight(r, assessed, problems.get(r.get('problem_slug') or r['id']))
        search = ' '.join(str(r.get(k) or '') for k in ('title', 'module', 'source_url', 'field', 'summary', 'declaration'))
        search += ' ' + assessed['title'] + ' ' + highlight['headline'] + ' ' + discipline_for(r.get('module'))
        excerpt = str(assessed['assessment'].get('contribution') or r.get('summary') or '').strip()
        if re.match(r'^(?:(?:The )?OEIS\b|Quoted directly\b|From \[)', excerpt, re.I):
            excerpt = ''
        preview = f'<span class="result-excerpt">{esc(excerpt)}</span>' if excerpt else ''
        history = highlight['history']
        year = (f'<span class="result-impact-history"><span>{esc(history["label"])}</span> '
                f'<span class="result-impact-year">{esc(history["value"])}</span></span>') if history else ''
        person = f'<span class="result-impact-person">{esc(highlight["person"])}</span>' if highlight['person'] else ''
        impacts = (f'<span class="result-impact-list"><span class="result-impact-field">{esc(discipline_for(r.get("module")))}</span>'
                   f'<span class="result-impact-tag">{esc(highlight["headline"])}</span>{year}{person}</span>')
        evidence = ''.join(f'<li><span>{esc(fact["label"])}</span><p>{esc(fact["text"])}</p>'
                           + (f'<a href="{esc(fact["url"])}">Read source ↗</a>' if fact['url'] else '') + '</li>'
                           for fact in highlight['evidence'])
        context = ('<details class="highlight-evidence"><summary>About this highlight</summary>'
                   f'<ul>{evidence}</ul></details>') if evidence else ''
        rows.append(f'<details id="resolved-{esc(r["id"])}" class="reading-item result-item" data-result-row '
            f'data-kind="{esc(r["kind"])}" data-search="{esc(search.lower())}">'
            f'<summary>{impacts}<span class="result-summary"><strong>{esc(assessed["title"])}</strong>{preview}</span>'
            f'<span class="result-outcome {esc(r["kind"])}">{esc(r["kind"].capitalize())}</span>'
            '<span class="result-disclosure" aria-hidden="true">+</span></summary>'
            f'<div class="reading-item-body">{assessment_story(assessed)}'
            f'{research_followups(r.get("problem_slug") or r["id"], feed)}'
            f'{articles[r["id"]]}{context}{assessment_details(assessed)}</div></details>')
    return ('<section id="results" class="contribution-results" data-research-index aria-label="Contributions">'
        '<div class="contribution-toolbar" data-index-controls hidden><label for="results-query">'
        '<span class="visually-hidden">Search results</span>'
        '<input id="results-query" type="search" placeholder="Search results" autocomplete="off"></label>'
        f'<p role="status" aria-live="polite" data-result-count>{len(records)} results</p>'
        '<button type="button" data-clear-search hidden>Clear search</button></div>'
        '<div id="result-archive">' + ''.join(rows) + '</div>'
        '<div class="research-no-results" data-result-empty hidden><h3>No matching results</h3>'
        '<p>Try another title or mathematical topic.</p></div>'
        '<div class="research-pagination"><button type="button" data-result-more hidden>Show more results</button></div>'
        '<p class="ranking-note"><a href="ranking.html">About this order</a></p></section>')


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
        if not fact['level']:
            continue
        label, weight = DIMENSIONS[key]
        links = ' · '.join(f'<a href="{esc(url)}">Source {i + 1}</a>' for i, url in enumerate(fact['evidence']))
        rows.append(f'<li><strong>{esc(label)}</strong> · {fact["level"]}/4 · {weight}% weight'
                    f'<p>{esc(fact["rationale"])}</p>{links}</li>')
    return '<details class="assessment-evidence"><summary>Why this order</summary><ul>' + ''.join(rows) + '</ul></details>'


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
    """Research leads with readable result stories, then keeps the paper shelf."""
    from lib.contributions import build_index
    parsed = Fragments(document)
    papers = parsed.select(id='publications')
    ranking = build_index(snapshot, records)
    data = overview_data(records)
    publication_count = len(parsed.select(cls='news-paper'))
    body = ('<main class="site-main research-news research-story-page"><header class="news-heading">'
            '<div class="research-intro"><p class="eyebrow">THE OMEGA INSTITUTE / RESEARCH</p>'
            '<h1>Research highlights</h1><p class="news-lede">We turn named questions into proofs, counterexamples, and reusable ideas.</p>'
            '<p class="research-intro-note">Follow the idea first. Then open the paper, proof record, or collaboration that carries it further.</p>'
            '<nav class="news-links" aria-label="Research destinations">'
            '<a href="conjectures.html#results">See all conjectures ↗</a></nav></div>'
            f'<div class="research-hero-mark" aria-label="Research release overview"><strong>{data["total"]:,}</strong><span>resolved results</span><strong>{publication_count}</strong><span>publications &amp; preprints</span></div></header>'
            '<section id="highlights" class="research-highlights" aria-labelledby="research-highlights-title"><div class="research-section-heading"><div><p class="eyebrow">THE IDEAS BEHIND THE RESULTS</p><h2 id="research-highlights-title">Research highlights</h2></div><a href="conjectures.html#results">Browse the full result order ↗</a></div>'
            '<div class="highlight-grid">' + research_highlights(snapshot, records, ranking) + '</div></section>'
            '<section class="research-news-intro" aria-labelledby="research-news-title"><p class="eyebrow">RESEARCH NEWS</p><h2 id="research-news-title">Papers, preprints, and collaborations</h2><p>These public records show where a resolved question turns into a longer research program.</p></section>'
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
    overview = render_conjecture_overview(records)
    body = ('<main class="site-main research-home research-news contribution-home" data-curated-home>'
        '<header class="contribution-heading"><div><p class="eyebrow">THE OMEGA INSTITUTE / CONTRIBUTIONS</p><h1>Conjectures</h1>'
        '<p>What the release settles, why it matters, and what it opens next.</p></div>'
        '<a href="research.html">Research highlights ↗</a></header>'
        + overview
        + '<section class="resolved-results-heading" aria-labelledby="resolved-results-title"><div><p class="eyebrow">PROBLEMS &amp; CONTRIBUTIONS</p><h2 id="resolved-results-title">Resolved conjectures</h2></div><p>The question, its history, and the idea that resolves it.</p></section>'
        + render_result_index(result_document or document, snapshot, records, ranking, feed)
        + '<details id="more-questions" class="more-questions"><summary>Open questions &amp; future pursuits</summary>'
        + render_collection(catalog, snapshot, sources['questions'], show_source_filters=False)
        + millennium_entry(output) + '</details></main>')
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
    body = ('<main class="site-main research-news ranking-method"><header class="page-heading">'
            '<h1>About this order</h1></header>'
            '<p>Pages automatically orders results using the released problem dossiers and proof explanations. '
            'The order combines the importance of the question with the contribution of its resolution: '
            'conceptual structure, proof methods, mathematical scope, historical context, '
            'documented scholarly background and earlier research.</p>'
            '<p>Problem importance is weighted by the strength of the contribution. A famous proposer '
            'or an old source alone cannot put a small counterexample above a substantial new method. '
            'Source labels such as OEIS do not add or subtract points.</p>'
            '<p>This is an automatic reading priority based on available evidence. '
            'A source date does not establish years of unsuccessful work, and an unmatched author '
            'does not acquire an invented affiliation or reputation. Reasons and sources are available '
            'inside each result. Mathematical claims retain their original verified scope.</p>'
            '<p>New releases recalculate this order automatically. '
            'Publications and collaboration updates add follow-up information independently.</p>'
            '<a href="conjectures.html#results">Back to contributions</a></main>')
    (output / 'ranking.html').write_text(common_shell(page_shell('About this order', '', body, appearance='editorial')))
    for pattern in ('research/*/index.html', 'results/*/index.html', 'oeis/*/index.html'):
        for path in output.glob(pattern):
            path.write_text(common_shell(path.read_text(), '../../'), encoding='utf-8')
    for path in output.glob('*.html'):
        # Maps retain their original theme/layout. Only navigation is normalized.
        path.write_text(add_spaces_navigation(path.read_text()), encoding='utf-8')
