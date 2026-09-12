"""Reader-facing projections. Reuse source records and preserve all evidence links.

This module changes presentation only. It does not assign research or proof status.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from hashlib import sha256
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
    """Retain original HTML bytes rather than serializing mathematical markup."""
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source, self.items, self.stack = source, [], []
        self.lines = [0]
        self.lines.extend(m.end() for m in re.finditer('\n', source))
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
    """Classify only the recorded source URL. No keyword-based claim assignment."""
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
            f'<div class="reading-group-body">{"".join(items) or "<p class=reading-muted>No matching records in this release.</p>"}</div></details>')


def search_box(kind):
    return (f'<div class="reading-search"><label for="{kind}-query">Find a {"result" if kind == "results" else "question"}</label>'
            f'<input id="{kind}-query" type="search" data-reading-search placeholder="Title, source or module">'
            '<button type="button" data-clear-search>Clear search</button><p role="status" data-search-count></p></div>')


def replace_main(document: str, body: str):
    parsed = Fragments(document)
    mains = parsed.select(tag='main')
    if len(mains) != 1:
        raise ValueError('Expected one main reading surface')
    main = mains[0]
    return document[:main.start] + body + document[main.end:]


def common_shell(document: str, root=''):
    # Replace only the known reading-shell prepaint style; leave mathematical markup alone.
    document = document.replace('content="#f7f8fa"', 'content="#090c10"')
    document = document.replace(
        '<style>html,body{background:#f7f8fa;color:#232629}body{transition:background-color .24s ease,color .24s ease}</style>',
        '<style>html,body{background:#090c10;color:#e0eaec;color-scheme:dark}body{transition:none}</style>')
    # All styles are in the head before first paint, including lazy notebook styles.
    if 'assets/reading.css' not in document:
        document = document.replace('</head>', f'<link rel="stylesheet" href="{root}assets/reading.css">'
            f'<script type="module" src="{root}assets/reading.mjs"></script></head>', 1)
    document = re.sub(r'<body\b([^>]*)>',
                      lambda m: m[0] if 'data-reading-page' in m[1] else '<body' + m[1] + ' data-reading-page>', document, count=1)
    return add_spaces_navigation(document, root)



def render_research_groups(document, snapshot, records):
    parsed = Fragments(document)
    articles = {e.attrs.get('id'): parsed.raw(e) for e in parsed.select(cls='news-result')}
    evidence = parsed.select(id='resolved-questions')
    papers = parsed.select(id='publications')
    groups = defaultdict(list)
    for record in records:
        identity = record['id']
        if identity not in articles:
            raise ValueError(f'Result card is absent: {identity}')
        key, _, _ = series(record['source_url'])
        search = ' '.join(str(record.get(k) or '') for k in ('title', 'module', 'source_url', 'field'))
        groups[key].append(f'<details class="reading-item result-item" data-search="{esc(search.lower())}">'
            f'<summary><strong>{esc(record["title"])}</strong><span>{esc(record["kind"].capitalize())}</span></summary>'
            f'<div class="reading-item-body">{articles[identity]}</div></details>')
    sections = ''.join(group_html(key, title, desc, groups[key], prefix='results', noun='results')
        for key, title, desc in [series('https://oeis.org'), series('https://erdosproblems.com'), series('https://other.example')])
    body = ('<main class="site-main research-news">'
        '<header class="reading-heading"><p class="eyebrow">THE OMEGA INSTITUTE</p><h1>Research</h1>'
        '<p class="reading-lede">Our growing body of mathematics, its results and the questions it opens.</p>'
        '<nav class="reading-tabs" aria-label="Research sections"><a href="#results">Results by collection</a>'
        '<a href="spaces.html">Knowledge spaces</a><a href="#publications">Publications</a><a href="discover.html">Source connections</a></nav></header>'
        '<section class="reading-callout" id="knowledge-spaces"><div><h2>Follow the connections</h2>'
        '<p>Explore a theory or source, see its supporting modules, and compare two areas.</p></div>'
        '<a class="reading-button" href="spaces.html">Open knowledge spaces</a></section>'
        '<section id="results" class="reading-catalog" data-reading-catalog><div class="reading-section-title"><h2>Results by collection</h2>'
        f'<p>{len(records)} recorded results. Open a collection, then a result for its exact scope and proof.</p></div>'
        + search_box('results') + '<div id="result-archive">' + sections + '</div></section>'
        '<section id="frontier" class="reading-callout"><div><h2>Unresolved targets in this release</h2>'
        '<p>Read the original questions, our current footholds and the specific missing steps.</p></div>'
        '<a href="conjectures.html#open-problems">Browse conjectures</a></section>'
        + (parsed.raw(papers[0]) if papers else '<section id="publications"><h2>Publications</h2></section>')
        + '<details id="resolved-questions-archive" class="reading-group"><summary>All resolved question records and evidence links</summary>'
        + (parsed.raw(evidence[0]) if evidence else '') + '</details></main>')
    result = common_shell(replace_main(document, body))
    # Old research.html#rp links redirect before the document can be painted.
    result = result.replace('<head>', '<head><script src="assets/research-route.js"></script>', 1)
    return result


def millennium_entry(output):
    path = output / 'assets/millennium-data.json'
    if not path.exists():
        path = ROOT / 'site/assets/millennium-data.json'
    cards = []
    if path.exists():
        for p in json.loads(path.read_text())['problems']:
            identity = p.get('id', '')
            if not re.fullmatch(r'[a-z0-9-]+', identity):
                raise ValueError('Invalid problem map identity')
            state = 'Solved in the literature; formalization map' if p.get('scientific_state') == 'solved' else 'Research map and remaining steps'
            cards.append(f'<a href="millennium.html?problem={identity}"><strong>{esc(p["title"])}</strong><span>{state}</span></a>')
    return ('<details class="reading-group" id="long-horizon"><summary><span><strong>Long-horizon research maps</strong>'
        '<small>Major questions, existing foundations and the bridges still to build.</small></span></summary>'
        '<section id="millennium-entry" class="reading-group-body"><p>Each map separates the original question, recorded objects and proposed routes. '
        'The maps are authored research guides; their nodes are not a percentage of a problem solved.</p>'
        '<nav class="reading-map-cards" aria-label="Millennium problem maps">' + ''.join(cards) + '</nav>'
        '<a href="millennium.html?problem=rh">Open the RH research DAG</a></section></details>')


def render_conjecture_groups(document, snapshot, output):
    parsed = Fragments(document)
    row_by_slug = {}
    for e in parsed.select(cls='problem-row'):
        slug = urlsplit(e.attrs['href']).path.strip('/').split('/')[-1]
        row_by_slug[slug] = parsed.raw(e)
    groups = defaultdict(list)
    active = [p for p in snapshot['problems'] if not p.get('resolution')]
    for p in active:
        if p['slug'] not in row_by_slug:
            raise ValueError('Missing source dossier row')
        key, _, _ = series(source_url(p))
        search = p['title'] + ' ' + source_url(p) + ' ' + ' '.join(p.get('motivation_gids', []))
        groups[key].append(f'<div class="reading-item question-item" data-search="{esc(search.lower())}">'
                           + row_by_slug[p['slug']] + '</div>')
    completed = [p for p in snapshot['problems'] if p.get('resolution')]
    completed_links = ''.join(
        f'<p><a href="research/{esc(p["slug"])}/">{esc(p["title"])}</a> '
        f'<small>{esc(p["resolution"]["kind"])}, source record</small></p>' for p in completed)
    completed_archive = ('<details class="reading-group" id="completed-dossiers"><summary>'
        '<span><strong>Completed dossiers and source archive</strong>'
        '<small>Retained question records, outside the unresolved collection above.</small></span></summary>'
        '<div class="reading-group-body">' + completed_links
        + '<p><a href="research.html#results">Browse completed results by collection</a></p>'
        '<p><a href="https://the-omega-institute.github.io/trureturing-mdbook/open-problems.html">Read source dossiers in mdBook</a></p></div></details>')
    sections = ''.join(group_html(key, title, desc, groups[key], prefix='questions', noun='questions')
        for key, title, desc in [series('https://oeis.org'), series('https://erdosproblems.com'), series('https://other.example')])
    # Preserve authored follow-up records and their links, without duplicating them in the first viewport.
    followups = ''.join(parsed.raw(e) for e in parsed.select(cls='result-followup'))
    body = ('<main class="site-main research-home" data-reading-home>'
        '<header class="reading-heading"><p class="eyebrow">THE OMEGA INSTITUTE / RESEARCH FRONTIER</p><h1>Conjectures</h1>'
        '<p class="reading-lede">Questions, proposed routes and the foundations we can build on.</p>'
        '<p>Read the source question, see what is already available, and identify the next missing step. '
        'We retain the original authors and source links with each dossier.</p>'
        '<nav class="reading-tabs" aria-label="Open question views"><a href="#open-problems">Source questions</a>'
        '<a href="#research-directions">Proposed routes &amp; notebook</a><a href="#long-horizon">Long-horizon maps</a>'
        '<a href="spaces.html">Explore dependencies</a></nav></header>'
        '<section id="open-problems" class="research-browser reading-catalog" data-reading-catalog>'
        f'<div class="reading-section-title"><h2>Source questions</h2><p>{len(active)} dossiers without a resolution in this release. '
        'External literature status is shown in each dossier.</p></div>' + search_box('questions') + sections + '</section>'
        '<details class="reading-group" id="research-directions" data-notebook-shell><summary><span><strong>Proposed routes &amp; personal notebook</strong>'
        '<small>Explore authored research directions, subgoals and your own saved notes.</small></span></summary>'
        '<div id="research-workbench-slot" class="reading-group-body"><p role="status">Open this section to load the research notebook.</p></div></details>'
        + millennium_entry(output)
        + (f'<details class="reading-group"><summary>Follow-up questions from completed work</summary><div class="reading-group-body">{followups}</div></details>' if followups else '')
        + completed_archive + '</main>')
    result = common_shell(replace_main(document, body))
    result = result.replace('</head>', '<link rel="stylesheet" href="assets/research-workbench.css">'
                           '<link rel="stylesheet" href="assets/reading.css"></head>', 1)
    return result


def apply_reading_views(output: Path, snapshot: dict, records: list):
    output = Path(output)
    research, conjectures = output/'research.html', output/'conjectures.html'
    if research.exists():
        research.write_text(render_research_groups(research.read_text(), snapshot, records), encoding='utf-8')
    if conjectures.exists():
        conjectures.write_text(render_conjecture_groups(conjectures.read_text(), snapshot, output), encoding='utf-8')
    for path in output.glob('*.html'):
        path.write_text(add_spaces_navigation(path.read_text()), encoding='utf-8')


def add_spaces_navigation(document: str, root=''):
    def nav(match):
        content = match[1]
        if re.search(r'href="[^\"]*spaces\.html(?:\?|\")', content):
            return match[0]
        # Preserve each page's own relative root, including generated dossier routes.
        found = re.search(r'href="([^\"]*)evolution\.html', content)
        prefix = found[1] if found else root
        content += f'<a href="{prefix}spaces.html">Spaces</a>'
        return f'<nav aria-label="Primary navigation">{content}</nav>'
    return re.sub(r'<nav aria-label="Primary navigation">(.*?)</nav>', nav, document, flags=re.S)
