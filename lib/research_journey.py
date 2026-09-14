"""Whole-catalog orientation and an explicitly aspirational research strategy."""
import json
import re
from collections import Counter
from urllib.parse import urlsplit
from lib.knowledge_pages import esc

SCENES = [
    ('questions', '01 / WHAT WE TARGET', 'A landscape of questions', 'Current focus: OEIS and Erdős problems, alongside related conjectures from the literature. Every catalogued research field appears below.'),
    ('proofs', '02 / START WITH PRECISE PROBLEMS', 'From a concrete question to a general theorem', 'Start with well-specified problems. Prove what explains a family of cases, with its assumptions and scope made explicit.'),
    ('bridges', '03 / BUILD VERIFIED BRIDGES', 'Connect the representations', 'Our goal is to prove the transformations between representations, so an idea developed for one problem can be used in another.'),
    ('horizons', '04 / THE LONG-TERM GOAL', 'Transfer the proof. Deepen the understanding.', 'Test whether verified bridges improve work on new problems — and help people independently understand why the mathematics works.'),
]
PROCESS = [
    ('precise', 'Precise problems', 'Choose a public question', 'Fix the original statement, definitions and assumptions. A foundational starting point need not be an easy problem.'),
    ('general', 'General theorems', 'Explain a family of phenomena', 'Seek a theorem that explains a family of cases. Its proved scope must distinguish it from finite checks or a special instance.'),
    ('representations', 'Verified representations', 'Prove the bridge', 'Prove the precise relationship between representations. Shared terminology, imports or an attractive diagram are not a verified mathematical bridge.'),
    ('transfer', 'New-problem transfer', 'Test reuse on new problems', 'Evaluate whether a verified representation bridge actually improves the solution of a new problem. This is an objective, not a result claimed by this diagram.'),
    ('understanding', 'Independent understanding', 'Make the reasoning understandable', 'Provide explanations and evidence that let a person independently follow, check and reuse the reasoning.'),
]


def field_id(area):
    return 'field-' + re.sub(r'[^a-z0-9]+', '-', area.lower()).strip('-')


def render_guided_journey(catalog, snapshot):
    families = catalog['families']
    by_area = {}
    for family in families:
        by_area.setdefault(family['area'], []).append(family)
    counts = Counter()
    for p in snapshot['problems']:
        host = (urlsplit(p.get('url', '')).hostname or '').lower()
        key = 'oeis' if host in ('oeis.org','www.oeis.org') else 'erdos' if host in ('erdosproblems.com','www.erdosproblems.com') else 'other'
        counts[key] += 1
    nodes, edges, directory = [], [], []
    for i, (identity, label) in enumerate([('oeis','OEIS'),('erdos','Erdős'),('other','Papers & literature')]):
        count = counts[identity]
        nodes.append({'id':'source-'+identity,'kind':'source','order':i,'label':label,'status':'Current focus' if i<2 else 'Related literature',
            'body': 'A current priority for collecting and investigating public problems.' if i<2 else 'Questions from papers, source dossiers and our authored research directions.',
            'scope':f'{count} source dossiers in the current snapshot. This count includes recorded outcomes; it is not a count of open or newly solved problems.',
            'links':[{'href':'#questions-'+identity,'label':'Browse source questions'},{'href':'#completed-'+identity,'label':'Browse recorded outcomes'}]})
        edges.append({'source':'source-'+identity,'target':'precise'})
    for i, (area, fs) in enumerate(by_area.items()):
        identity=field_id(area)
        nodes.append({'id':identity,'kind':'field','order':i,'label':area,'status':'Catalogued research field',
            'body':f'{len(fs)} question families in the authored research catalogue.',
            'scope':'A topic grouping, not a claim that the questions are mathematically equivalent or have a verified bridge.',
            'links':[{'href':'#direction-'+f['id'],'label':f['title']} for f in fs]})
        entries=[]
        for f in fs:
            targets=''.join(f'<a href="#rp={esc(t["id"])}">{esc(t["title"])} ↗</a>' for t in f.get('targets',[]))
            proof=f'<a href="results/{esc(f["builds_on"])}/">Existing proof · exact scope ↗</a>' if f.get('builds_on') else ''
            entries.append(f'<article class="journey-direction" id="direction-{esc(f["id"])}"><h3><a href="#rp={esc(f["id"])}">{esc(f["title"])}</a></h3><p>{esc(f.get("next_step", f["question"]))}</p><div class="story-directory-links">{proof}{targets}</div></article>')
        directory.append(f'<section class="catalog-field" id="catalog-{identity}"><h2>{esc(area)}</h2>{"".join(entries)}</section>')
    for i,(identity,label,body,scope) in enumerate(PROCESS):
        nodes.append({'id':identity,'kind':'process','order':i,'label':label,'status':'Research objective','body':body,'scope':scope,
            'links':[{'href':'#research-paths','label':'Explore the full research catalogue'}]})
        if i: edges.append({'source':PROCESS[i-1][0],'target':identity})
    # Grouping and strategy only: no mathematical dependency is inferred here.
    buttons=''.join(f'<a href="{esc(n["links"][0]["href"])}" class="story-node" data-node="{esc(n["id"])}" data-kind="{n["kind"]}" aria-label="{esc(n["status"]+": "+n["label"])}"><span class="story-dot" aria-hidden="true"></span><span class="story-node-label">{esc(n["label"])}</span></a>' for n in nodes)
    copies=''.join(f'<div class="story-copy" data-scene-copy="{i}"{ " hidden" if i else ""}><p class="story-eyebrow">{eyebrow}</p><h2{ " id=next-questions-title" if i==0 else ""}>{esc(title)}</h2><p class="story-deck">{esc(text)}</p></div>' for i,(_,eyebrow,title,text) in enumerate(SCENES))
    nav=''.join(f'<a href="#story-{key}" data-scene-link="{i}"{ " aria-current=step" if i==0 else ""}><span>0{i+1}</span> {label}</a>' for i,(key,label) in enumerate([('questions','Overview'),('proofs','Foundations'),('bridges','Bridges'),('horizons','Transfer')]))
    stops=''.join(f'<span class="story-stop" id="story-{key}" style="top:{i*25}%" aria-hidden="true"></span>' for i,(key,*_) in enumerate(SCENES))
    data=json.dumps({'nodes':nodes,'edges':edges,'field_count':len(by_area),'family_count':len(families),'source_counts':dict(counts)},ensure_ascii=False).replace('<','\\u003c')
    return f'''<section class="research-journey result-followups" id="next-questions" aria-labelledby="next-questions-title">
<div class="story-scroll">{stops}<div class="story-stage" data-scene="0"><div class="story-atmosphere" aria-hidden="true"></div><header class="story-heading">{copies}<nav class="story-shortcuts" aria-label="Collection navigation"><a href="#research-paths">Browse the full collection ↓</a><a href="#millennium-entry">Millennium research maps ↗</a></nav></header>
<div class="story-map" role="group" aria-label="All catalogued research fields and our proposed research strategy"><svg class="story-edges" aria-hidden="true"></svg><span class="story-map-label" data-map-label="sources">Problem sources · current focus</span><span class="story-map-label" data-map-label="fields">All catalogued research fields</span>{buttons}</div>
<footer class="story-footer"><nav aria-label="Research story chapters">{nav}</nav><p class="story-legend">Research strategy · connections show intended work, not proved dependencies</p><span class="story-scroll-cue">Scroll to the full collection ↓</span></footer></div></div>
<section class="story-directory" id="research-paths"><p class="story-eyebrow">THE FULL COLLECTION</p><h2>All our research directions</h2><p>Every question family in our authored catalogue. The source dossiers and long-horizon maps follow below.</p><nav class="catalog-index" aria-label="Research fields">{''.join(f'<a href="#catalog-{field_id(area)}">{esc(area)}</a>' for i,area in enumerate(by_area))}</nav><div class="story-directory-grid">{''.join(directory)}</div><a class="catalog-onward" href="#source-questions">Continue to all source dossiers ↓</a></section>
<dialog class="story-inspector" aria-labelledby="story-detail-title"><form method="dialog"><button class="story-close" aria-label="Close question details">×</button></form><p class="story-detail-status"></p><h2 id="story-detail-title"></h2><p class="story-detail-body"></p><p class="story-detail-scope"></p><div class="story-detail-links"></div></dialog>
<script type="application/json" id="research-story-data">{data}</script></section>'''
