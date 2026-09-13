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
    """Compatibility name. Restore the five original primary destinations.

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
    parsed = Fragments(document)
    articles = {e.attrs.get('id'): parsed.raw(e) for e in parsed.select(cls='news-result')}
    papers = parsed.select(id='publications')
    evidence = parsed.select(id='resolved-questions')
    groups = defaultdict(list)
    for r in records:
        if r['id'] not in articles:
            raise ValueError('Result card is absent: ' + r['id'])
        key, _, _ = series(r['source_url'])
        search = ' '.join(str(r.get(k) or '') for k in ('title', 'module', 'source_url', 'field'))
        groups[key].append(f'<details class="reading-item result-item" data-search="{esc(search.lower())}">'
            f'<summary><strong>{esc(r["title"])}</strong><span>{esc(r["kind"].capitalize())}</span></summary>'
            f'<div class="reading-item-body">{articles[r["id"]]}</div></details>')
    sections = ''.join(group_html(k, t, d, groups[k], prefix='results', noun='results')
        for k, t, d in [series('https://oeis.org'), series('https://erdosproblems.com'), series('https://other.example')] if groups[k])
    # Preserve the academic news layout; results lead and detailed gaps stay in Conjectures.
    # Only the previously flat result collection receives disclosure controls.
    body = ('<main class="site-main research-news"><header class="news-heading">'
        '<p class="eyebrow">THE OMEGA INSTITUTE / CURRENT RESEARCH</p><h1>Research</h1>'
        '<p class="news-lede">Theories, concepts, evidence and research directions in a connected knowledge system.</p>'
        '<nav id="knowledge-spaces" class="news-links" aria-label="Research destinations"><a href="discover.html">Explore source connections</a>'
        '<a href="atlas.html#mode=frontier">Open Atlas frontier</a></nav></header>'
        '<nav class="news-index" aria-label="Research sections"><a href="#results">Results by collection</a>'
        '<a href="#publications">Publications</a><a href="#frontier">Next questions</a></nav>'
        '<section id="results" class="news-section" data-reading-catalog><div class="news-section-heading"><div>'
        '<p class="eyebrow">FROM QUESTION TO RESULT</p><h2>Results by collection</h2></div>'
        f'<span>{len(records)} recorded results</span></div>' + search_box('results')
        + '<div id="result-archive">' + sections + '</div></section>'
        + '<details id="resolved-questions-archive" class="reading-group"><summary>All resolved question records and evidence links</summary>'
        + (parsed.raw(evidence[0]) if evidence else '') + '</details>'
        + (parsed.raw(papers[0]) if papers else '<section id="publications"><h2>Publications</h2></section>')
        + '<section id="frontier" class="news-onward"><h2>Next questions</h2><p>Follow the open questions and proposed routes that build on this work.</p><a href="conjectures.html#open-problems">Open conjectures</a>'
        '<a href="knowledge/">Browse the Library</a></section></main>')
    result = common_shell(replace_main(document, body))
    if 'assets/research-route.js' not in result:
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
                raise ValueError('Invalid map identity')
            cards.append(f'<a href="millennium.html?problem={identity}">{esc(p["title"])}</a>')
    return ('<section id="millennium-entry" class="research-frontier"><div class="news-section-heading">'
        '<h2>Long-horizon research maps</h2></div><nav class="reading-map-links" aria-label="Millennium problem maps">'
        + ''.join(cards) + '</nav></section>')


def render_conjecture_groups(document, snapshot, output):
    from lib.problem_resolutions import is_kernel_verified
    parsed = Fragments(document)
    rows = {urlsplit(e.attrs['href']).path.strip('/').split('/')[-1]: parsed.raw(e)
            for e in parsed.select(cls='problem-row')}
    groups = defaultdict(list)
    active = [p for p in snapshot['problems'] if not is_kernel_verified(p.get('resolution'))]
    completed = [p for p in snapshot['problems'] if is_kernel_verified(p.get('resolution'))]
    for p in active:
        if p['slug'] not in rows:
            raise ValueError('Missing source dossier row')
        key, _, _ = series(source_url(p))
        search = p['title'] + ' ' + source_url(p) + ' ' + ' '.join(p.get('motivation_gids', []))
        groups[key].append(f'<div class="reading-item question-item" data-triage="{esc(p.get("triage", ""))}" '
            f'data-gids="{esc(json.dumps(p.get("motivation_gids", [])))}" data-search="{esc(search.lower())}">{rows[p["slug"]]}</div>')
    sections = ''.join(group_html(k, t, d, groups[k], prefix='questions', noun='questions')
        for k, t, d in [series('https://oeis.org'), series('https://erdosproblems.com'), series('https://other.example')])
    lists = parsed.select(cls='problem-list')
    if lists:
        section = lists[0]
        # The original heading, statistics, sidebar and follow-up layout survive.
        document = document[:section.inner] + sections + '<p id="research-empty" hidden>No questions match these filters.</p></section>' + document[section.end:]
        document = document.replace('id="open-problems" class="research-browser"', 'id="open-problems" class="research-browser" data-reading-catalog', 1)
        document = document.replace('id="research-search"', 'id="research-search" data-reading-search', 1)
        document = document.replace('id="research-triage"', 'id="research-triage" data-reading-triage', 1)
        document = document.replace('id="research-count"', 'id="research-count" data-search-count', 1)
    else:
        # Minimal renderer fixtures still keep their existing main/header markup.
        for row in rows.values():
            document = document.replace(row, '', 1)
        document = document.replace('</main>', '<section id="open-problems" data-reading-catalog>' + search_box('questions') + sections + '</section></main>', 1)
    document = document.replace('class="site-main research-home"', 'class="site-main research-home" data-reading-home', 1)
    # Keep the notebook out of the initial layout, but preserve its old URLs/data.
    extras = ('<details class="reading-group" id="research-directions" data-notebook-shell><summary>Proposed routes &amp; personal notebook</summary>'
        '<div id="research-workbench-slot" class="reading-group-body"><p role="status">Open to load the research notebook.</p></div></details>'
        + millennium_entry(output))
    links = ''.join(f'<p class="resolved-question" id="resolved-{esc(p["slug"])}" data-problem-slug="{esc(p["slug"])}" '
        f'data-resolution-kind="{esc(p["resolution"]["kind"])}"><a href="research/{esc(p["slug"])}/">{esc(p["title"])}</a></p>' for p in completed)
    extras += ('<details id="completed-dossiers" class="reading-group"><summary>Completed dossiers and source archive</summary>'
        '<div class="reading-group-body">' + links + '<a href="research.html#results">Browse completed results by collection</a>'
        '<p><a href="https://the-omega-institute.github.io/trureturing-mdbook/open-problems.html">Read source dossiers in mdBook</a></p></div></details>')
    result = common_shell(conjecture_journey(document.replace('</main>', extras + '</main>', 1), snapshot))
    if 'assets/research-workbench.css' not in result:
        result = result.replace('</head>', '<link rel="stylesheet" href="assets/research-workbench.css"></head>', 1)
    return result



def conjecture_journey(document, snapshot):
    """An editorial shortlist with explicit existing-result links; never a truth gate."""
    from lib.research_results import followup_families
    stories = json.loads((ROOT / 'site/assets/result-stories.json').read_text())
    catalog = json.loads((ROOT / 'site/assets/research-directions.json').read_text())
    from lib.problem_resolutions import is_kernel_verified
    resolved = {p['slug'] for p in snapshot['problems'] if is_kernel_verified(p.get('resolution'))}
    families = [f for f in followup_families() if f['id'] not in resolved]
    from lib.research_journey import render_guided_journey
    overview = render_guided_journey(families, stories)
    document = document.replace('</head>', '<link rel="stylesheet" href="assets/research-journey.css">'
        '<script defer src="assets/vendor/gsap.min.js"></script>'
        '<script defer src="assets/vendor/ScrollTrigger.min.js"></script>'
        '<script type="module" src="assets/research-journey.mjs"></script>'
        '<noscript><style>.story-scroll{display:none}.story-directory{padding-top:20px}</style></noscript></head>', 1)
    parsed = Fragments(document)
    for element in sorted(parsed.select(cls='result-followups') + parsed.select(cls='research-activity'), key=lambda e:e.start, reverse=True):
        document = document[:element.start]+document[element.end:]
    # Put purpose and mathematical areas ahead of provenance totals and source search.
    document = document.replace('Open questions. Missing bridges. The next proof.', 'Choose a question. Build on a proof. Connect the next idea.')
    parsed = Fragments(document)
    heading = parsed.select(cls='page-heading')[0]
    introduction = ('<header class="page-heading"><div><h1>Conjectures</h1>'
        '<p class="lede">A collection of conjectures and open problems connected to our research.</p></div>'
        '<a class="console-link" href="research.html">Research news ↗</a></header>')
    document = document[:heading.start]+introduction+overview+document[heading.end:]
    parsed = Fragments(document)
    stats = parsed.select(cls='research-stats')
    browser = parsed.select(cls='research-browser')
    if stats and browser:
        start,end = stats[0].start,browser[0].end
        document = document[:start] + '<details id="source-questions" class="reading-group"><summary>Browse all source questions · OEIS, Erdős &amp; papers</summary><div class="reading-group-body">' + document[start:end] + '</div></details>' + document[end:]
    by_area = defaultdict(list)
    for family in catalog['families']:
        if family['id'] not in resolved: by_area[family['area']].append(family)
    areas = ''.join('<details><summary>'+esc(area)+'</summary><div>'+''.join(f'<a href="#rp={esc(f["id"])}">{esc(f["title"])}</a>' for f in families)+'</div></details>' for area,families in by_area.items())
    document = document.replace('<details class="reading-group" id="research-directions"', '<nav class="journey-areas" aria-label="More research areas"><span>Explore further directions</span>'+areas+'</nav><details class="reading-group" id="research-directions"',1)
    document = document.replace('<h2>Long-horizon research maps</h2>', '<p class="eyebrow">02 / THE WIDER HORIZON</p><h2>Long-horizon research maps</h2><p>Explore the objects, equivalent formulations and missing bridges behind the Millennium Problems. These maps are research context; the routes above do not imply a solution.</p>')
    # Keep every resolved permalink, with compact source collections and pagination.
    parsed = Fragments(document)
    archive = parsed.select(id='completed-dossiers')[0]
    items = defaultdict(list)
    for problem in snapshot['problems']:
        if not is_kernel_verified(problem.get('resolution')): continue
        matches = parsed.select(id='resolved-'+problem['slug'])
        if not matches: continue
        item = matches[0]
        key,_,_ = series(source_url(problem))
        raw = parsed.raw(item).replace('class="resolved-question"', 'class="resolved-question reading-item" data-search="'+esc(problem['title'].lower())+'"')
        items[key].append(raw)
    collections = ''.join(group_html(k,t,d,items[k],prefix='completed',noun='results') for k,t,d in [series('https://oeis.org'),series('https://erdosproblems.com'),series('https://other.example')])
    replacement = '<details id="completed-dossiers" class="reading-group"><summary>Results along the way · completed dossiers</summary><div class="reading-group-body"><section id="completed-catalog" data-reading-catalog>'+search_box('archive')+collections+'</section><a href="research.html#results">Research results &amp; publications ↗</a></div></details>'
    return document[:archive.start]+replacement+document[archive.end:]

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
