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
    """A browsable result index; exact statements and evidence stay in each card."""
    parsed = Fragments(document)
    articles = {e.attrs.get('id'): parsed.raw(e) for e in parsed.select(cls='news-result')}
    papers = parsed.select(id='publications')
    evidence = parsed.select(id='resolved-questions')
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
        if re.match(r'^(?:OEIS\b|Quoted directly\b|From \[)', excerpt, re.I):
            excerpt = ''
        preview = f'<span class="result-excerpt">{esc(excerpt)}</span>' if excerpt else ''
        rows.append(f'<details class="reading-item result-item" data-result-row data-collection="{key}" '
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
        '<details id="resolved-questions-archive" class="reading-group"><summary>Question dossiers &amp; evidence archive</summary>'
        + (parsed.raw(evidence[0]) if evidence else '') + '</details>'
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
    cards = []
    for f in families:
        targets = ''.join(f'<a href="#rp={esc(t["id"])}">{esc(t["title"])} ↗</a>' for t in f['targets'])
        cards.append(f'''<article class="journey-direction" id="direction-{esc(f['id'])}">
<h3>{esc(f['area'])}</h3><p class="journey-question"><a href="#rp={esc(f['id'])}">{esc(f['title'])}</a></p>
<ol class="journey-steps"><li><span>Established result</span><p>{esc(stories[f['builds_on']]['finding'])}</p><a href="results/{esc(f['builds_on'])}/">Read the proof &amp; exact scope ↗</a></li>
<li><span>Next contribution</span><p>{esc(f['next_step'])}</p><div class="journey-targets">{targets}</div></li>
<li><span>Longer-term question</span><p>{esc(f['question'])}</p></li></ol></article>''')
    overview = ('<section class="research-journey result-followups" id="next-questions" aria-labelledby="next-questions-title">'
        '<p class="eyebrow">01 / OUR PRIORITY DIRECTIONS</p><h2 id="next-questions-title">Where we can contribute next</h2>'
        '<p class="journey-intro">A curated shortlist for researchers and formalizers: questions with an existing proof to build on, a concrete missing step, and a wider mathematical goal. These are our proposed priorities, not a ranking of all open mathematics.</p>'
        '<nav class="journey-priorities" aria-label="Priority research areas">' + ''.join(f'<a href="#direction-{esc(f["id"])}">{esc(f["area"])}</a>' for f in families) + '</nav><div class="journey-grid">' + ''.join(cards) + '</div></section>')
    parsed = Fragments(document)
    for element in sorted(parsed.select(cls='result-followups') + parsed.select(cls='research-activity'), key=lambda e:e.start, reverse=True):
        document = document[:element.start]+document[element.end:]
    # Put purpose and mathematical areas ahead of provenance totals and source search.
    document = document.replace('Open questions. Missing bridges. The next proof.', 'Choose a question. Build on a proof. Connect the next idea.')
    parsed = Fragments(document)
    heading = parsed.select(cls='page-heading')[0]
    document = document[:heading.end]+overview+document[heading.end:]
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
