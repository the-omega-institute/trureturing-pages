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


def discovery_diagram(kind):
    """Small explanatory schematics; never a claim graph or measured data."""
    if kind == 'qubit-cuts':
        content = ''.join(f'<rect x="{x}" y="38" width="94" height="48" rx="5"/>'
                          f'<text x="{x+47}" y="67" text-anchor="middle">{label}</text>'
                          for x, label in [(12, 'AB | CD'), (123, 'AC | BD'), (234, 'AD | BC')])
        content += '<path d="M59 92 L170 130 M170 92 V130 M281 92 L170 130"/><text x="170" y="160" text-anchor="middle">Average ≤ 1 + ½ log₂ 3 bits</text>'
        caption = 'Three ways to split four qubits. One exact bound on their average entropy.'
    elif kind == 'channel-contraction':
        content = '<circle cx="46" cy="67" r="29"/><text x="46" y="72" text-anchor="middle">ρ</text><path d="M80 67 H121 M222 67 H263"/><rect x="124" y="42" width="94" height="50" rx="5"/><text x="171" y="72" text-anchor="middle">Φ</text><circle cx="298" cy="67" r="29"/><text x="298" y="72" text-anchor="middle">Φ(ρ)</text><text x="170" y="145" text-anchor="middle">Three metrics · exact contraction</text>'
        caption = 'The same quantum channel, measured through three information geometries.'
    elif kind == 'matrix-geometry':
        content = '<rect x="18" y="28" width="108" height="86" rx="4"/><path d="M72 28 V114 M18 71 H126 M143 71 H192 M213 114 L319 31"/><text x="45" y="58" text-anchor="middle">A</text><text x="99" y="58" text-anchor="middle">X</text><text x="45" y="98" text-anchor="middle">X*</text><text x="99" y="98" text-anchor="middle">B</text><circle cx="231" cy="100" r="5"/><circle cx="265" cy="73" r="5"/><circle cx="302" cy="44" r="5"/><text x="170" y="159" text-anchor="middle">A norm bound forces spectral structure</text>'
        caption = 'A bound on every positive completion forces an affine Hermitian structure.'
    else:
        return ''
    return ('<figure class="discovery-diagram"><svg viewBox="0 0 340 184" role="img" aria-label="' + esc(caption) + '">' + content + '</svg><figcaption>' + esc(caption) + '</figcaption></figure>')


def story_paragraphs(story, *, compact=False):
    fields = [('question', 'The question'), ('context', 'Why it matters'),
              ('idea', 'The idea'), ('finding', 'Our contribution'), ('boundary', 'Scope & next question')]
    if compact:
        fields = [('context', 'Why it matters'), ('idea', 'The idea'), ('boundary', 'Scope & next question')]
    return ''.join(f'<p><span>{esc(label)}</span>{esc(story[key])}</p>'
                   for key, label in fields if story.get(key))


def editorial_question(pin):
    """Translated quotations are labeled; a paraphrase never gains quotation marks."""
    direct = pin.get('quote_kind') == 'verbatim'
    label = 'Source excerpt' if direct else 'The question · paraphrased'
    text = '“' + pin['quote'] + '”' if direct else pin['quote']
    return (f'<div class="discovery-quote"><p class="quote-label">{label}</p>'
            f'<blockquote><p>{esc(text)}</p><cite>{esc(pin["quote_by"])}</cite></blockquote></div>')


def research_highlights(snapshot, records, ranking, limit=None, feed=None, milestones=None):
    """Reviewed selections and threshold-qualified results share one news feed."""
    from lib.contribution_stories import build_milestones
    from lib.result_highlights import result_highlight
    from lib.research_updates import EMPTY
    milestones = milestones or build_milestones(snapshot, records, ranking)
    feed = feed or EMPTY
    by_id = {record['id']: record for record in records}
    assessments = {item['id']: item for item in ranking['results']}
    problems = {p['slug']: p for p in snapshot.get('problems', [])}
    cards = []
    for index, news in enumerate(milestones['results'], 1):
        record = by_id[news['id']]
        highlight = result_highlight(record, assessments[news['id']], problems.get(news['problem_id']))
        story = news['story']
        history = highlight['history']
        date = (f'<p class="discovery-history"><span>{esc(history["label"])}</span><strong>{esc(history["value"])}</strong></p>') if history else ''
        person = f'<p class="discovery-person">{esc(highlight["person"])}</p>' if highlight['person'] else ''
        source = record.get('source_url', '')
        pin = news.get('pin') or {}
        if pin:
            cards.append(f'<article class="highlight-card editorial-card" id="news-{esc(news["id"])}" data-milestone-id="{esc(news["id"])}">'
                f'<div class="editorial-card-top"><span class="eyebrow">{esc(pin["venue"])}</span><span class="editorial-choice">Editorial selection</span></div>'
                + editorial_question(pin)
                + f'<p class="discovery-answer"><span>Our answer</span><strong>{esc(pin["answer"])}</strong></p>'
                + f'<h3><a href="{esc(news["url"])}">{esc(pin["headline"])}</a></h3>'
                + f'<p class="editorial-scope">{esc(pin["scope"])}</p>'
                + f'<div class="news-links"><a class="verification-link" href="{esc(news["url"])}">✓ Lean 4 kernel-checked</a>'
                + f'<a href="{esc(pin["source_url"])}">Original question ↗</a></div>'
                + '<details class="editorial-details"><summary>Mathematical idea &amp; verification details</summary>'
                + f'<p>{esc(pin["locator"])}</p>' + story_paragraphs(story)
                + f'<a href="{esc(news["url"])}">Explore the result ↗</a></details>'
                + research_followups(news['problem_id'], feed) + '</article>')
            continue
        venue = quote = answer = ''
        headline = story['headline']
        cards.append(f'<article class="highlight-card" id="news-{esc(news["id"])}" data-milestone-id="{esc(news["id"])}">'
            '<aside class="discovery-context">'
            f'<p class="eyebrow">{esc(discipline_for(record.get("module")))}</p>{venue}'
            f'<strong class="discovery-contribution">{esc(highlight["headline"])}</strong>{date}{person}'
            f'<span class="highlight-outcome {esc(record["kind"])}">{esc(record["kind"].capitalize())}</span>'
            + discovery_diagram(story.get('diagram')) + '</aside><div class="discovery-story">'
            + quote + answer
            + f'<h3><a href="{esc(news["url"])}">{esc(headline)}</a></h3>'
            + ('' if quote else f'<p class="discovery-question">{esc(story.get("question") or news["title"])}</p>')
            + (f'<p class="discovery-finding">{esc(story["finding"])}</p>' if story.get('finding') else '')
            + '<div class="highlight-story">' + story_paragraphs(story, compact=True) + '</div>'
            + research_followups(news['problem_id'], feed)
            + f'<div class="news-links"><a href="{esc(news["url"])}">Explore the result ↗</a>'
            + (f'<a href="{esc(source)}">Original question ↗</a>' if source else '')
            + '</div></div></article>')
    if not cards:
        return '<p class="discovery-empty">Research milestones will appear here as results meet the selection criteria. Explore all resolved questions below.</p>'
    featured = ranking['research_news_policy']['featured_count']
    return '<div class="featured-discoveries">' + ''.join(cards[:featured]) + '</div>' + ('<details class="more-milestones"><summary>More research highlights</summary>' + ''.join(cards[featured:]) + '</details>' if len(cards) > featured else '')


def render_result_index(document, snapshot, records, ranking=None, feed=None):
    """Server-ranked contributions, with one small search field and no score controls."""
    from lib.contributions import build_index
    from lib.research_updates import EMPTY
    from lib.result_highlights import result_highlight
    from lib.contribution_stories import load_stories, result_story
    ranking = ranking or build_index(snapshot, records)
    feed = feed or EMPTY
    assessments = {r['id']: r for r in ranking['results']}
    order = {r['id']: i for i, r in enumerate(ranking['results'])}
    parsed = Fragments(document)
    articles = {e.attrs.get('id'): parsed.raw(e) for e in parsed.select(cls='news-result')}
    problems = {p['slug']: p for p in snapshot.get('problems', [])}
    stories = load_stories()
    rows = []
    for r in sorted(records, key=lambda r: order[r['id']]):
        if r['id'] not in articles:
            raise ValueError('Result card is absent: ' + r['id'])
        assessed = assessments[r['id']]
        problem = problems.get(r.get('problem_slug') or r['id'], {})
        highlight = result_highlight(r, assessed, problem)
        story = result_story(problem, r, assessed, stories)
        pin = assessed.get('editorial_pin') or {}
        if pin:
            story = {**story, 'headline': pin['headline'], 'finding': pin['scope']}
        search = ' '.join(str(r.get(k) or '') for k in ('title', 'module', 'source_url', 'field', 'summary', 'declaration'))
        search += ' ' + assessed['title'] + ' ' + highlight['headline'] + ' ' + discipline_for(r.get('module'))
        search += ' ' + ' '.join(str(v) for v in story.values())
        if story['origin'] == 'source-bound-editorial':
            search += ' ' + ' '.join(stories[r['id']].get('zh-CN', {}).values())
        search += ' ' + ' '.join(str(v) for v in pin.values())
        excerpt = story.get('finding', '')
        if re.match(r'^(?:(?:The )?OEIS\b|Quoted directly\b|From \[)', excerpt, re.I):
            excerpt = ''
        preview = f'<span class="result-excerpt">{esc(excerpt)}</span>' if excerpt else ''
        history = highlight['history']
        year = (f'<span class="result-impact-history"><span>{esc(history["label"])}</span> '
                f'<span class="result-impact-year">{esc(history["value"])}</span></span>') if history else ''
        person = f'<span class="result-impact-person">{esc(highlight["person"])}</span>' if highlight['person'] else ''
        impacts = (f'<span class="result-impact-list"><span class="result-impact-field">{esc(discipline_for(r.get("module")))}</span>'
                   f'<span class="result-impact-tag">{esc(highlight["headline"])}</span>{year}{person}'
                   + ('<span class="result-news-label">Research highlight</span>' if assessed.get('research_news', {}).get('eligible') else '') + '</span>')
        if pin:
            impacts = (f'<span class="result-impact-list"><span class="result-impact-field">{esc(pin["venue"])}</span>'
                       f'<span class="result-impact-tag">{esc(pin["answer"])}</span>'
                       '<span class="result-news-label">Editorial selection</span></span>')
        evidence = ''.join(f'<li><span>{esc(fact["label"])}</span><p>{esc(fact["text"])}</p>'
                           + (f'<a href="{esc(fact["url"])}">Read source ↗</a>' if fact['url'] else '') + '</li>'
                           for fact in highlight['evidence'])
        context = ('<details class="highlight-evidence"><summary>About this highlight</summary>'
                   f'<ul>{evidence}</ul></details>') if evidence else ''
        formal = (f'<span class="result-formal-title">{esc(assessed["title"])}</span>') if not pin and story['headline'] != assessed['title'] else ''
        rows.append(f'<details id="resolved-{esc(r["id"])}" class="reading-item result-item" data-result-row '
            f'data-kind="{esc(r["kind"])}" data-search="{esc(search.lower())}">'
            f'<summary>{impacts}<span class="result-summary"><strong>{esc(story["headline"])}</strong>{preview}{formal}</span>'
            f'<span class="result-outcome {esc(r["kind"])}">{esc(r["kind"].capitalize())}</span>'
            '<span class="result-disclosure" aria-hidden="true">+</span></summary>'
            f'<div class="reading-item-body">' + (editorial_question(pin) if pin else '')
            + f'<div class="result-story-expanded">{story_paragraphs(story)}</div>'
            f'{research_followups(r.get("problem_slug") or r["id"], feed)}'
            f'<details class="verification-details"><summary>Verification details</summary>{articles[r["id"]]}</details>{context}{assessment_details(assessed)}</div></details>')
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
    if pin := item.get('editorial_pin'):
        rows.append(f'<li><strong>Editorial pin</strong> · position {pin["position"]}<p>{esc(pin["reason"])}</p></li>')
    if exclusion := item.get('editorial_exclusion'):
        rows.append(f'<li><strong>Not headlined</strong><p>{esc(exclusion["reason"])}</p></li>')
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


def render_research_groups(document, snapshot, records, feed=None, ranking=None, milestones=None):
    """Research leads with readable result stories, then keeps the paper shelf."""
    from lib.contributions import build_index
    parsed = Fragments(document)
    papers = parsed.select(id='publications')
    ranking = ranking or build_index(snapshot, records)
    data = overview_data(records)
    from lib.research_updates import EMPTY
    feed = feed or EMPTY
    projects = ''.join('<article class="collaboration-news"><p class="eyebrow">Research in progress</p>'
                      f'<h3>{esc(project["topic"])}</h3>'
                      '<p>In collaboration with ' + '; '.join(f'{esc(person["name"])} from {esc(person["institution"])}' for person in project['people'])
                      + f' to further investigate {esc(project["topic"])}.</p>'
                      f'<a href="{esc(project["evidence_url"])}">Follow the collaboration ↗</a></article>'
                      for project in feed['collaborations'])
    body = ('<main class="site-main research-news research-story-page"><header class="news-heading">'
            '<div class="research-intro"><p class="eyebrow">THE OMEGA INSTITUTE / RESEARCH</p>'
            '<h1>Research highlights</h1><p class="news-lede">The questions we resolve. The ideas they make possible.</p>'
            f'<p class="research-intro-note"><strong>{data["proved"]:,} <span>proofs</span> · {data["refuted"]:,} <span>refutations</span></strong> Each result links a question from the literature to its precise formal statement and released Lean evidence.</p>'
            '<nav class="news-links" aria-label="Research destinations">'
            '<a href="conjectures.html#results">See all conjectures ↗</a></nav></div>'
            f'<div class="research-hero-mark" aria-label="Research release overview"><strong>{data["total"]:,}</strong><span>resolved results</span><p>Questions from the literature.<br>Answers checked by Lean.</p><a href="evolution.html">Explore the release history ↗</a></div></header>'
            '<section id="highlights" class="research-highlights" aria-labelledby="research-highlights-title"><div class="research-section-heading"><h2 id="research-highlights-title">Selected results</h2><a href="conjectures.html#results">Browse the full result order ↗</a></div>'
            '<div class="highlight-grid">' + research_highlights(snapshot, records, ranking, feed=feed, milestones=milestones) + '</div>'
            '</section>'
            + (parsed.raw(papers[0]) if papers else '<section id="publications"><h2>Publications</h2></section>')
            + ('<section class="collaboration-news-list"><h2>Ongoing collaborations</h2>' + projects + '</section>' if projects else '')
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


def render_conjecture_groups(document, snapshot, output, result_document=None, records=None, feed=None, ranking=None):
    from lib.conjecture_collection import render_collection
    catalog = json.loads((ROOT / 'site/assets/research-directions.json').read_text())
    sources = json.loads((ROOT / 'site/assets/conjecture-sources.json').read_text())
    records = records or []
    from lib.contributions import build_index
    ranking = ranking or build_index(snapshot, records, output / 'assets/contribution-index.json')
    overview = render_conjecture_overview(records)
    body = ('<main class="site-main research-home research-news contribution-home" data-curated-home>'
        '<header class="contribution-heading"><div><p class="eyebrow">THE OMEGA INSTITUTE / CONTRIBUTIONS</p><h1>Conjectures</h1>'
        '<p>What the release settles, why it matters, and what it opens next.</p></div>'
        '<a href="research.html">Research highlights ↗</a></header>'
        + overview
        + '<section class="resolved-results-heading" aria-labelledby="resolved-results-title"><div><p class="eyebrow">PROBLEMS &amp; CONTRIBUTIONS</p><h2 id="resolved-results-title">Resolved conjectures</h2></div><p>The question, its history, and the idea that resolves it.</p></section>'
        + render_result_index(result_document or document, snapshot, records, ranking, feed)
        + '<details id="more-questions" class="more-questions"><summary>Open questions &amp; research directions</summary>'
        + render_collection(catalog, snapshot, sources['questions'], show_source_filters=False)
        + '</details></main>')
    result = common_shell(replace_main(document, body))
    return result.replace('</head>', '<link rel="stylesheet" href="assets/conjecture-collection.css">'
        '<link rel="stylesheet" href="assets/research-index.css">'
        '<script type="module" src="assets/research-index.mjs"></script>'
        '<script type="module" src="assets/conjecture-collection.mjs"></script></head>', 1)


def ranking_guide(ranking):
    """A short reading guide; numerical details follow the current build policy."""
    explanations = {
        'significance': 'The source question, its broader connections and use by other results.',
        'concepts': 'New concepts, structural explanations and useful correspondences.',
        'methods': 'The mathematical mechanism used in the released proof.',
        'advance': 'The exact statement settled and the scope of its proof or counterexample.',
        'standing': 'The proposer’s scholarly background, supported by cited sources.',
        'history': 'A documented conjecture date, or otherwise the source publication date.',
        'attention': 'Earlier results and partial cases documented in the source dossier.',
    }
    dimensions = ranking['dimensions']
    rows = ''.join(f'<tr><th scope="row">{esc(fact["label"])}</th>'
                   f'<td class="ranking-weight">{fact["weight"]}%</td><td>{esc(explanations[key])}</td></tr>'
                   for key, fact in dimensions.items())
    policy = ranking['research_news_policy']
    maximum = sum(dimensions[key]['weight'] for key in ('concepts', 'methods', 'advance'))
    return ('<main class="site-main ranking-method">'
            '<header class="ranking-heading"><a href="conjectures.html#results">← Back to results</a>'
            '<h1>About this order</h1>'
            '<p>Editorial selections come first. The rest of the collection is ordered automatically with each release.</p></header>'
            '<section aria-labelledby="reading-order-title"><h2 id="reading-order-title">Reading order</h2>'
            '<ol class="ranking-order"><li id="editorial-pins"><h3>Editorial selection</h3>'
            '<p>A small reviewed selection leads with a clear source question, answer and mathematical scope.</p></li>'
            '<li><h3>Automatic order</h3><p>All other results are ranked from their released dossiers and proof explanations. The score combines the importance of the question with the contribution of its resolution.</p></li></ol></section>'
            '<section aria-labelledby="score-factors-title"><h2 id="score-factors-title">What the score considers</h2>'
            '<table class="ranking-factors"><thead><tr><th scope="col">Dimension</th><th scope="col">Weight</th><th scope="col">Evidence used</th></tr></thead>'
            f'<tbody>{rows}</tbody></table>'
            '<p class="ranking-caveat">The score guides reading; it does not certify novelty or measure scholarly consensus. Each result retains its exact verified scope.</p></section>'
            '<details class="ranking-details"><summary>Calculation &amp; Research highlights</summary>'
            '<div class="ranking-details-body"><h3>Score calculation</h3>'
            '<p>Each dimension is rated from 0 to 4 using documented evidence. C is the weighted contribution from concepts, methods and mathematical advance; I is the weighted total of the other dimensions.</p>'
            f'<p class="ranking-formula"><code>C + I × (0.4 + 0.6 × C / {maximum})</code></p>'
            '<p>This adjustment gives a question’s background more influence when the released result makes a stronger mathematical contribution. Editorial selections change reading order without changing scores.</p>'
            '<p>Missing evidence earns no credit. Source collections such as OEIS do not affect the score. A source date records historical context, not years of unsuccessful research.</p>'
            '<section id="research-news-selection"><h3>Research highlights</h3>'
            '<p>Highlights include valid editorial selections and every result meeting all three automatic thresholds:</p>'
            '<dl class="ranking-thresholds"><div><dt>Total score</dt>'
            f'<dd>{policy["minimum_score"]} / 100</dd></div><div><dt>Problem significance</dt>'
            f'<dd>{policy["minimum_significance"]} / 4</dd></div><div><dt>Contribution points</dt>'
            f'<dd>{policy["minimum_contribution_points"]} / {maximum}</dd></div></dl>'
            '<p>Known prior answers are excluded from highlights. Public papers and confirmed collaborations are shown independently of these thresholds.</p></section>'
            '<h3>When a release changes</h3>'
            '<p>Every release refreshes the scores. Changed sources or result scopes disable the corresponding editorial selection until reviewed. Rebuilds update existing highlights without duplicate announcements.</p>'
            '<p>For an individual result, open “Why this order” to inspect its reasons and sources. Equal scores share a priority band; concept and method levels, then stable result IDs, break ties.</p>'
            '</div></details></main>')


def apply_reading_views(output: Path, snapshot: dict, records: list, feed=None):
    output = Path(output)
    from lib.living_library import page_shell
    from lib.contributions import build_index
    from lib.contribution_stories import build_milestones, load_stories
    ranking = build_index(snapshot, records, output / 'assets/contribution-index.json')
    milestones = build_milestones(snapshot, records, ranking, output / 'assets/research-milestones.json')
    locale_path = output / 'assets/locales/zh-CN.json'
    if locale_path.exists():
        translations = json.loads(locale_path.read_text())
        from lib.contributions import load_pins
        for pin in load_pins()['pins']:
            for key, translated in pin.get('zh-CN', {}).items():
                translations[pin[key]] = translated
                if key == 'quote':
                    translations['“' + pin[key] + '”'] = '“' + translated + '”'
        for story in load_stories().values():
            translations.update({text: story['zh-CN'][key] for key, text in story['en'].items()
                                 if key != 'diagram' and key in story.get('zh-CN', {})})
        locale_path.write_text(json.dumps(translations, ensure_ascii=False, indent=2) + '\n')
    source = (output / 'research.html').read_text() if (output / 'research.html').exists() else ''
    if source and not (output / 'conjectures.html').exists():
        (output / 'conjectures.html').write_text(page_shell('Conjectures', '', '<main></main>', active='Conjectures', appearance='editorial').replace(
            '</head>', '<link rel="stylesheet" href="assets/research-news.css"></head>'))
    for name, render in [('research.html', lambda d: render_research_groups(d, snapshot, records, feed, ranking, milestones)),
                         ('conjectures.html', lambda d: render_conjecture_groups(d, snapshot, output, source, records, feed, ranking))]:
        path = output / name
        if path.exists():
            path.write_text(render(path.read_text()), encoding='utf-8')
    guide = common_shell(page_shell('About this order', '', ranking_guide(ranking), appearance='editorial'))
    (output / 'ranking.html').write_text(guide.replace('</head>', '<link rel="stylesheet" href="assets/research-index.css"></head>', 1))
    for pattern in ('research/*/index.html', 'results/*/index.html', 'oeis/*/index.html'):
        for path in output.glob(pattern):
            path.write_text(common_shell(path.read_text(), '../../'), encoding='utf-8')
    for path in output.glob('*.html'):
        # Maps retain their original theme/layout. Only navigation is normalized.
        path.write_text(add_spaces_navigation(path.read_text()), encoding='utf-8')
