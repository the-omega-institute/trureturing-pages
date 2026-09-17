"""Editorial research questions and ambitions, independent of release inventories."""
from collections import Counter
from urllib.parse import quote

from lib.knowledge_pages import esc, stable_file_name
from lib.problem_resolutions import is_kernel_verified

FIELDS = {
    'numbers': ('Number theory', {'Arithmetic', 'Golden numeration'}),
    'analysis': ('Analysis', {'Real-rooted polynomials', 'Weil spectra'}),
    'discrete': ('Combinatorics', {'Sequence complexity', 'Additive combinatorics', 'Rewriting games', 'Fourier and optimization'}),
    'probability': ('Probability & information', {'Probability', 'Phase retrieval'}),
    'computation': ('Logic & computation', {'Automata'}),
    'physics': ('Mathematical physics', {'Quantum geometry'}),
}
COLLECTIONS = {'oeis': 'OEIS', 'erdos': 'Erdős Problems', 'papers': 'Papers'}
HORIZON_FIELDS = {
    'rh': 'Number theory', 'pnp': 'Logic & computation', 'hodge': 'Algebraic geometry',
    'navier-stokes': 'Analysis', 'yang-mills': 'Mathematical physics',
    'bsd': 'Number theory', 'poincare': 'Geometry & topology',
}


def field_for(area):
    return next(((key, title) for key, (title, areas) in FIELDS.items() if area in areas), ('other', 'Other questions'))


def family_source_url(family):
    if family.get('source_url'):
        return family['source_url']
    source = family.get('source')
    return f'https://arxiv.org/abs/{source["arxiv_id"]}{source["version"]}' if source else 'https://doi.org/' + family['doi']


def render_collection(catalog, snapshot, source_questions=()):
    problems = {p['slug']: p for p in snapshot['problems']}
    resolved = {slug for slug, p in problems.items() if is_kernel_verified(p.get('resolution'))}
    # Curation does not disappear when a release gains an outcome. Show the
    # attributed result on the relevant question instead.
    families = [*catalog['families'], *source_questions]
    nodes = {n['id']: n for n in snapshot.get('graph', {}).get('nodes', [])}
    counts = Counter(field_for(f['area'])[0] for f in families)
    fields = '<button type="button" data-curated-field="" aria-pressed="true">All fields</button>'
    for key, (title, _) in FIELDS.items():
        if counts[key]:
            fields += f'<button type="button" data-curated-field="{key}" aria-pressed="false">{esc(title)}</button>'
    if counts['other']:
        fields += '<button type="button" data-curated-field="other" aria-pressed="false">Other questions</button>'
    collections = '<button type="button" data-curated-source="" aria-pressed="true">All sources</button>'
    collections += ''.join(f'<button type="button" data-curated-source="{key}" aria-pressed="false">{title}</button>' for key, title in COLLECTIONS.items())
    cards = []
    for f in families:
        field, field_title = field_for(f['area'])
        collection = f.get('collection', 'papers')
        source = f.get('source')
        source_url = family_source_url(f)
        source_label = f.get('source_label', 'Paper')
        copy = f.get('display', {})
        connections = []
        if f.get('builds_on'):
            connections.append(f'<a href="results/{esc(f["builds_on"])}/">Related result ↗</a>')
        progress = []
        for update in f.get('release_updates', []):
            if update['problem'] in resolved:
                progress.append(f'<p class="curated-progress" data-related-result="{esc(update["problem"])}">'
                    f'<a href="research/{esc(update["problem"])}/">{esc(update["label"])} ↗</a>'
                    f'<span>{esc(update["scope"])}</span></p>')
        if f['id'] in problems:
            connections.append(f'<a href="research/{esc(f["id"])}/">Current dossier ↗</a>')
        if f['id'] in resolved:
            progress.append(f'<p class="curated-progress"><a href="research/{esc(f["id"])}/">Released result ↗</a></p>')
        if milestone := f.get('milestone'):
            progress.append(f'<p class="curated-progress" data-external-outcome="{esc(milestone["kind"])}">'
                f'<a href="{esc(milestone["url"])}">{esc(milestone["label"])}</a>'
                f'<span>{esc(milestone["by"])}</span></p>')
        anchors = []
        for gid in f.get('anchors', []):
            if gid in nodes:
                title = nodes[gid].get('human_title') or nodes[gid].get('title') or gid
                url = f'knowledge/node/{stable_file_name(gid)}/'
            else:
                title = gid.rsplit('/', 1)[-1]
                pin = f.get('source_commit', catalog['source_commit'])
                url = f'https://github.com/{catalog["source_repo"]}/blob/{pin}/{quote(gid, safe="/")}.lean'
            anchors.append(f'<a href="{esc(url)}">{esc(title)}</a>')
        targets = []
        for target in f.get('targets', []):
            paragraphs = ''.join(f'<h4>{label}</h4><p>{esc(target[key])}</p>' for key, label in
                [('question', 'The question'), ('gap', 'What remains'), ('next_step', 'A possible next step'), ('success', 'What would count as progress')]
                if target.get(key))
            targets.append(f'<details class="curated-target" id="question-{esc(target["id"])}"><summary>{esc(target["title"])}</summary><div>{paragraphs}</div></details>')
        search = ' '.join([f['title'], f['area'], field_title, collection, source_label, f['question'], f.get('foothold', ''), f['gap'], f.get('doi', ''), source_url, *f['keywords'], *f.get('anchors', [])]).lower()
        next_step = f'<h4>A possible next step</h4><p>{esc(f["next_step"])}</p>' if f.get('next_step') else ''
        success = f'<h4>What would count as progress</h4><p>{esc(f["success"])}</p>' if f.get('success') else ''
        anchor_links = '<h4>Related mathematics in the Library</h4><div class="curated-anchors">' + ''.join(anchors) + '</div>' if anchors else ''
        cards.append(f'''<article class="curated-question" id="direction-{esc(f['id'])}" data-curated-question="{esc(f['id'])}" data-field="{field}" data-collection="{collection}" data-search="{esc(search)}">
<div class="curated-card-meta"><p class="curated-topic">{esc(f['area'])}</p><a href="{esc(source_url)}">{esc(source_label)}</a></div><h3>{esc(f['title'])}</h3>
<div class="curated-context"><div><h4>Why it connects</h4><p>{esc(copy.get('connection', f.get('connection', f.get('foothold', ''))))}</p></div>
<div><h4>What remains</h4><p>{esc(copy.get('gap', f['gap']))}</p></div></div>
{''.join(progress)}
<details class="curated-detail"><summary>Question &amp; possible approaches</summary><div class="curated-detail-body">
<h4>The question</h4><p>{esc(f['question'])}</p>{next_step}
<div class="curated-targets">{''.join(targets)}</div>{success}{anchor_links}
{f'<p class="curated-source-note">{esc(source["note"])}</p>' if source else ''}
</div></details>
<footer><a href="{esc(source_url)}">Original source ↗</a>{''.join(connections)}</footer></article>''')
    return f'''<section id="source-questions" class="curated-collection" aria-labelledby="curated-heading">
<span id="next-questions"></span><span id="open-problems"></span>
<div class="curated-section-heading"><h2 id="curated-heading">Curated problem collections</h2><nav aria-label="Source collections"><a href="https://oeis.org/">OEIS ↗</a><a href="https://www.erdosproblems.com/">Erdős Problems ↗</a></nav></div>
<div class="curated-tools" hidden><label class="curated-search-label" for="curated-search">Find a question<input id="curated-search" type="search" placeholder="Question, topic, or source"></label>
<div class="curated-filter-row"><span>Source</span><div class="curated-sources" role="group" aria-label="Source">{collections}</div></div>
<div class="curated-filter-row"><span>Mathematical field</span><div class="curated-fields" role="group" aria-label="Mathematical field">{fields}</div></div></div>
<div class="curated-count-row"><p class="curated-count" id="curated-count" role="status" aria-live="polite">{len(families)} selected questions</p><button type="button" id="curated-reset" hidden>Reset filters</button></div>
<div class="curated-grid">{''.join(cards)}</div><p id="curated-empty" hidden>No questions match.</p>
<button type="button" id="curated-more" hidden>Show more questions</button></section>'''


def render_horizons(data):
    cards = []
    for problem in data['problems']:
        identity = problem['id']
        state = problem['scientific_state']
        source = data['sources'][problem['catalogue_source']]['url'] if identity != 'rh' else data['sources']['clay-rh']['url']
        milestone = problem.get('public_milestone')
        status = 'Solved' if state == 'solved' else 'Open'
        attribution = ''
        if milestone:
            attribution = f'<p class="horizon-attribution"><a href="{esc(milestone["url"])}">{esc(milestone["by"])} · {esc(milestone["date"])}</a></p>'
            source = milestone['url']
        cards.append(f'<article class="horizon-card{ " horizon-featured" if identity == "rh" else ""}" data-horizon="{esc(identity)}" data-scientific-state="{esc(state)}">'
            f'<div class="horizon-meta"><span>{esc(HORIZON_FIELDS[identity])}</span><span class="horizon-status {esc(state)}">{status}</span></div>'
            f'<h3><a href="millennium.html?problem={esc(identity)}">{esc(problem["title"])}</a></h3>'
            f'<p class="horizon-question">{esc(problem["question"])}</p>{attribution}'
            f'<footer><a href="millennium.html?problem={esc(identity)}">Explore the research map ↗</a><a href="{esc(source)}">Source ↗</a></footer></article>')
    return ('<section id="millennium-entry" class="curated-horizons" aria-labelledby="horizons-heading">'
        '<div class="curated-section-heading"><h2 id="horizons-heading">Future pursuits</h2></div>'
        '<div class="horizon-grid">' + ''.join(cards) + '</div></section>')
