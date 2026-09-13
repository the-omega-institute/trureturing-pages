"""Page-wide research story. Proof outlines and proposed routes stay distinct."""
import json
from lib.knowledge_pages import esc

LABELS = {
    'thue-morse-reduced-abelian-even': ('Odd-length recurrence', 'The full complexity sequence'),
    'pochhammer-higher-even-intervals': ('Exact quadratic classification', 'Intervals in higher degrees'),
    'greedy-three-sumfree-third-seed-one': ('Conjecture 17 proved', 'The separate g + 1 family'),
}
TARGETS = {
    'thue-morse-even-difference': 'Even-length relations',
    'thue-morse-nonautomaticity': 'Beyond finite automata',
    'pochhammer-quartic-interval': 'Classify degree four',
    'pochhammer-degree-monotonicity': 'Compare endpoint radii',
    'greedy-g-plus-one-blocks': 'Accepted & forbidden blocks',
    'greedy-g-plus-one-literal': 'The literal greedy process',
}
SCENES = [
    ('questions', '01 / THE QUESTIONS', 'Good questions.', 'Open new worlds.', 'We choose questions with a proof to build on — and somewhere meaningful to go.'),
    ('proofs', '02 / WHAT WE HAVE BUILT', 'Every result has', 'a structure beneath it.', 'Look inside our existing proofs: the objects, constructions and arguments that make a result possible.'),
    ('bridges', '03 / WHERE TO CONTRIBUTE', 'Now look', 'at what is missing.', 'The next contribution lives in the gap between what we can prove and what we want to understand.'),
    ('horizons', '04 / THE WIDER HORIZON', 'A finished proof.', 'An unfinished landscape.', 'Follow the proposed routes outward. A precise result can give us a starting point for a much wider question.'),
]


def render_guided_journey(families, stories):
    nodes, edges, areas, archive = [], [], [], []
    for group, f in enumerate(families):
        story = stories[f['builds_on']]
        result, horizon = LABELS.get(f['id'], ('Existing result', f['title']))
        prefix = f['id']
        proof_url = f"results/{f['builds_on']}/"
        areas.append({'id': prefix, 'label': f['area']})
        previous = None
        for i, step in enumerate(story['steps']):
            key = f'{prefix}-step-{i}'
            nodes.append({'id':key, 'group':group, 'kind':'step', 'order':i, 'label':step['title'], 'status':'Proof outline', 'body':step['body'], 'scope':story['boundary'], 'href':proof_url, 'link':'Read the proof & exact scope ↗'})
            if previous:
                edges.append({'source':previous, 'target':key, 'kind':'outline'})
            previous = key
        result_id = prefix+'-result'
        nodes.append({'id':result_id,'group':group,'kind':'result','label':result,'status':'Existing proof','body':story['finding'],'scope':story['boundary'],'href':proof_url,'link':'Read the proof & exact scope ↗'})
        if previous:
            edges.append({'source':previous,'target':result_id,'kind':'outline'})
        for i, t in enumerate(f['targets']):
            nodes.append({'id':t['id'],'group':group,'kind':'target','order':i,'label':TARGETS.get(t['id'],t['title']),'status':'Open target','body':t['question'],'scope':t['success'],'href':'#rp='+t['id'],'link':'Explore this question ↗'})
            edges.extend([{'source':result_id,'target':t['id'],'kind':'proposed'},{'source':t['id'],'target':prefix+'-horizon','kind':'proposed'}])
        nodes.append({'id':prefix+'-horizon','group':group,'kind':'horizon','label':horizon,'status':'Research horizon','body':f['question'],'scope':f['gap'],'href':'#rp='+prefix,'link':'Explore the research direction ↗'})
        targets = ''.join(f'<a href="#rp={esc(t["id"])}">{esc(t["title"])} ↗</a>' for t in f['targets'])
        archive.append(f'<article class="journey-direction" id="direction-{esc(prefix)}"><p class="eyebrow">{esc(f["area"])}</p><h3>{esc(f["title"])}</h3><p>{esc(f["next_step"])}</p><div class="story-directory-links"><a href="{esc(proof_url)}">Read the proof &amp; exact scope ↗</a>{targets}</div></article>')
    buttons = ''.join(f'<button type="button" class="story-node" data-node="{esc(n["id"])}" data-kind="{n["kind"]}" data-group="{n["group"]}" aria-label="{esc(n["status"]+": "+n["label"])}"><span class="story-dot" aria-hidden="true">{"✓" if n["kind"]=="result" else str(n["order"]+1) if n["kind"]=="step" else ""}</span><span class="story-node-label">{esc(n["label"])}</span></button>' for n in nodes)
    copies = ''.join(f'<div class="story-copy" data-scene-copy="{i}"{ " hidden" if i else ""}><p class="story-eyebrow">{eyebrow}</p><h2{ " id=next-questions-title" if i==0 else ""}><span>{esc(first)}</span><em>{esc(second)}</em></h2><p class="story-deck">{esc(text)}</p></div>' for i,(_,eyebrow,first,second,text) in enumerate(SCENES))
    nav = ''.join(f'<a href="#story-{key}" data-scene-link="{i}"{ " aria-current=step" if i==0 else ""}><span>0{i+1}</span> {label}</a>' for i,(key,label) in enumerate([('questions','Questions'),('proofs','Proofs'),('bridges','Bridges'),('horizons','Horizons')]))
    stops = ''.join(f'<span class="story-stop" id="story-{key}" style="top:{i*25}%" aria-hidden="true"></span>' for i,(key,*_) in enumerate(SCENES))
    data = json.dumps({'nodes':nodes,'edges':edges,'areas':areas},ensure_ascii=False).replace('<','\\u003c')
    return f'''<section class="research-journey result-followups" id="next-questions" aria-labelledby="next-questions-title">
<div class="story-scroll">{stops}<div class="story-stage" data-scene="0">
<div class="story-atmosphere" aria-hidden="true"></div><header class="story-heading">{copies}<a class="story-skip" href="#research-paths">Go straight to the questions ↗</a></header>
<div class="story-map" role="group" aria-label="Three research areas, their proof outlines and proposed open routes"><svg class="story-edges" aria-hidden="true"></svg><div class="story-gap" aria-hidden="true"><span>The open gap</span></div>{buttons}{''.join(f'<span class="story-area" data-area="{i}">{esc(a["label"])}</span>' for i,a in enumerate(areas))}</div>
<footer class="story-footer"><nav aria-label="Research story chapters">{nav}</nav><p class="story-legend"><span>━ Proof outline</span><span>┄ Proposed route · not a proved implication</span></p><span class="story-scroll-cue">Scroll to unfold ↓</span></footer>
</div></div>
<section class="story-directory" id="research-paths"><p class="story-eyebrow">YOUR NEXT STEP</p><h2>Find your way in.</h2><p>Choose a concrete question, read its exact scope, and explore the work behind it.</p><div class="story-directory-grid">{''.join(archive)}</div></section>
<dialog class="story-inspector" aria-labelledby="story-detail-title"><form method="dialog"><button class="story-close" aria-label="Close question details">×</button></form><p class="story-detail-status"></p><h2 id="story-detail-title"></h2><p class="story-detail-body"></p><h3 class="story-scope-heading">Exact scope</h3><p class="story-detail-scope"></p><a class="story-detail-link"></a></dialog>
<script type="application/json" id="research-story-data">{data}</script></section>'''
