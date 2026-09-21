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


def render_research_groups(document, snapshot, records):
    """A browsable result index; exact statements and evidence stay in each card."""
    parsed = Fragments(document)
    articles = {e.attrs.get('id'): parsed.raw(e) for e in parsed.select(cls='news-result')}
    papers = parsed.select(id='publications')
    collections = [series('https://oeis.org'), series('https://erdosproblems.com'), series('https://other.example')]
    counts = defaultdict(int)
    rows = []
    for r in sorted(records, key=lambda r: (r['title'].casefold(), r['id'])):
        if r['id'] not in articles:
            raise ValueError('Result card is absent: ' + r['id'])
        key, label, _ = series(r['source_url'])
        counts[key] += 1
        path = urlsplit(r['source_url']).path.strip('/')
        reference = path.split('/')[0] if key in ('oeis', 'erdos') else ''
        source_label = label + (' / ' + reference if reference else '')
        search = ' '.join(str(r.get(k) or '') for k in ('title', 'module', 'source_url', 'field', 'summary', 'declaration'))
        excerpt = str(r.get('summary') or '').strip()
        # Provenance introductions belong in the expanded source record, not the
        # index's one-line preview. Do not invent a mathematical paraphrase.
        if re.match(r'^(?:(?:The )?OEIS\b|Quoted directly\b|From \[)', excerpt, re.I):
            excerpt = ''
        preview = f'<span class="result-excerpt">{esc(excerpt)}</span>' if excerpt else ''
        rows.append(f'<details id="resolved-{esc(r["id"])}" class="reading-item result-item" data-result-row data-collection="{key}" '
            f'data-kind="{esc(r["kind"])}" data-search="{esc(search.lower())}">'
            f'<summary><span class="result-summary"><span class="result-source">{esc(source_label)}</span>'
            f'<strong>{esc(r["title"])}</strong>{preview}</span>'
            f'<span class="result-outcome {esc(r["kind"])}">{esc(r["kind"].capitalize())}</span>'
            '<span class="result-disclosure" aria-hidden="true">+</span></summary>'
            f'<div class="reading-item-body">{articles[r["id"]]}</div></details>')
    filters = (f'<button type="button" data-result-collection="all" aria-pressed="true">All results <span>{len(records)}</span></button>'
        + ''.join(f'<button type="button" id="results-{key}" data-result-collection="{key}" aria-pressed="false">'
                  f'{esc(title)} <span>{counts[key]}</span></button>' for key, title, _ in collections if counts[key]))
    proved = sum(r['kind'] == 'proved' for r in records)
    refuted = sum(r['kind'] == 'refuted' for r in records)
    body = ('<main class="site-main research-news"><header class="news-heading">'
        '<div class="research-intro"><p class="eyebrow">THE OMEGA INSTITUTE / RESEARCH</p><h1>Research</h1>'
        '<p class="news-lede">From open questions to formal results.</p>'
        '<p class="research-intro-note">Explore the results, counterexamples and papers. Follow each claim back to its question and proof.</p>'
        '<nav id="knowledge-spaces" class="news-links" aria-label="Research destinations">'
        '<a href="discover.html">Explore connections <span aria-hidden="true">↗</span></a>'
        '<a href="conjectures.html">Find an open question <span aria-hidden="true">↗</span></a></nav></div>'
        '<dl class="research-overview"><div class="research-total"><dt>Recorded results</dt>'
        f'<dd>{len(records)}</dd></div><div><dt>Proved</dt><dd>{proved}</dd></div>'
        f'<div><dt>Refuted</dt><dd>{refuted}</dd></div></dl></header>'
        '<nav class="news-index" aria-label="Research sections"><a href="#results"><span>01</span> Results</a>'
        '<a href="#publications"><span>02</span> Publications</a><a href="#frontier"><span>03</span> Next questions</a></nav>'
        '<section id="results" class="news-section" data-research-index><div class="news-section-heading"><div>'
        '<p class="eyebrow">THE COLLECTION</p><h2>Explore the results</h2></div>'
        '<p>Original questions. Precise scope. Inspectable proofs.</p></div>'
        '<div class="research-index-controls" data-index-controls hidden>'
        '<div class="research-collections" role="group" aria-label="Result collection">' + filters + '</div>'
        '<div class="research-toolbar"><label class="research-search" for="results-query">'
        '<span>Search results</span><input id="results-query" type="search" placeholder="Search by title, sequence or theorem" autocomplete="off"></label>'
        '<label class="research-outcome-filter" for="results-outcome"><span>Outcome</span>'
        '<select id="results-outcome"><option value="all">All outcomes</option><option value="proved">Proved</option>'
        '<option value="refuted">Refuted</option></select></label>'
        '<button type="button" class="research-reset" data-clear-search>Reset filters</button></div></div>'
        '<div class="research-index-meta"><p role="status" aria-live="polite" data-result-count>'
        f'{len(records)} results</p><span>Ordered by title</span></div>'
        '<div id="result-archive">' + ''.join(rows) + '</div>'
        '<div class="research-no-results" data-result-empty hidden><h3>No matching results</h3>'
        '<p>Try a different title, sequence number or collection.</p></div>'
        '<div class="research-pagination"><button type="button" data-result-more hidden>Show more results</button></div></section>'
        + (parsed.raw(papers[0]) if papers else '<section id="publications"><h2>Publications</h2></section>')
        + '<section id="frontier" class="news-onward"><div><p class="eyebrow">CONTINUE THE INQUIRY</p>'
        '<h2>Every result opens a new question.</h2><p>Explore what comes next, or build on a proof already in the Library.</p></div>'
        '<div class="research-next-links"><a href="conjectures.html#open-problems">Open conjectures <span aria-hidden="true">↗</span></a>'
        '<a href="knowledge/">Browse the Library <span aria-hidden="true">↗</span></a></div></section></main>')
    result = common_shell(replace_main(document, body))
    result = result.replace('</head>', '<link rel="stylesheet" href="assets/research-index.css">'
                            '<script type="module" src="assets/research-index.mjs"></script></head>', 1)
    if 'assets/research-route.js' not in result:
        result = result.replace('<head>', '<head><script src="assets/research-route.js"></script>', 1)
    return result


def millennium_entry(output):
    from lib.conjecture_collection import render_horizons
    path = output / 'assets/millennium-data.json'
    if not path.exists():
        path = ROOT / 'site/assets/millennium-data.json'
    return render_horizons(json.loads(path.read_text()))


def render_conjecture_groups(document, snapshot, output):
    from lib.conjecture_collection import render_collection
    catalog = json.loads((ROOT / 'site/assets/research-directions.json').read_text())
    sources = json.loads((ROOT / 'site/assets/conjecture-sources.json').read_text())
    body = ('<main class="site-main research-home" data-curated-home>'
        '<header class="page-heading curated-heading"><div><p class="eyebrow">SELECTED QUESTIONS</p>'
        '<h1>Conjectures</h1><p class="lede">A curated collection of conjectures and open problems connected to our research.</p>'
        '</div><a class="console-link" href="research.html#results">Research results ↗</a></header>'
        + render_collection(catalog, snapshot, sources['questions']) + millennium_entry(output) + '</main>')
    result = common_shell(replace_main(document, body))
    return result.replace('</head>', '<link rel="stylesheet" href="assets/conjecture-collection.css">'
        '<script type="module" src="assets/conjecture-collection.mjs"></script></head>', 1)


def apply_reading_views(output: Path, snapshot: dict, records: list):
    output = Path(output)
    for name, render in [('research.html', lambda d: render_research_groups(d, snapshot, records)),
                         ('conjectures.html', lambda d: render_conjecture_groups(d, snapshot, output))]:
        path = output / name
        if path.exists():
            path.write_text(render(path.read_text()), encoding='utf-8')
    for pattern in ('research/*/index.html', 'results/*/index.html', 'oeis/*/index.html'):
        for path in output.glob(pattern):
            path.write_text(common_shell(path.read_text(), '../../'), encoding='utf-8')
    for path in output.glob('*.html'):
        # Maps retain their original theme/layout. Only navigation is normalized.
        path.write_text(add_spaces_navigation(path.read_text()), encoding='utf-8')
