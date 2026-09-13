"""A guided editorial map; its dashed routes never assert theorem dependencies."""
from lib.knowledge_pages import esc

# Short labels complement the exact scope and questions from the source catalog.
LABELS = {
    'thue-morse-reduced-abelian-even': ('Find the pattern behind a sequence', 'Odd-length recurrence', ['Even-length relations', 'Beyond finite automata'], 'The full complexity sequence'),
    'pochhammer-higher-even-intervals': ('Understand where all roots stay real', 'Exact quadratic classification', ['Classify degree four', 'Compare endpoint radii'], 'Intervals in higher degrees'),
    'greedy-three-sumfree-third-seed-one': ('Explain a greedy sequence with a formula', 'Conjecture 17 proved', ['Accepted & forbidden blocks', 'The literal greedy process'], 'The separate g + 1 family'),
}


def render_guided_journey(families, stories):
    cards, choices = [], []
    stages = ['What we know', 'Where to contribute', 'What comes next']
    for index, f in enumerate(families):
        identity = 'direction-' + f['id']
        lead, result, target_labels, horizon = LABELS.get(f['id'], (f['title'], 'Existing result', [t['title'] for t in f['targets']], 'The wider question'))
        choices.append(f'<a href="#{esc(identity)}" data-route-choice="{esc(identity)}"><span>{index+1:02d} / {esc(f["area"])}</span><strong>{esc(lead)}</strong><span class="route-choice-arrow" aria-hidden="true">↗</span></a>')
        targets = ''.join(f'<button type="button" class="route-node route-target" data-route-node="target-{i}" data-stage="1"><small>Open target {i+1}</small><strong>{esc(label)}</strong></button>' for i, label in enumerate(target_labels))
        target_details = ''.join(f'<details class="route-target-detail"><summary>{esc(t["title"])}</summary><p>{esc(t["question"])}</p><p><b>Success means</b> {esc(t["success"])}</p><a href="#rp={esc(t["id"])}">Explore this question ↗</a></details>' for t in f['targets'])
        step_buttons = ''.join(f'<button type="button" data-route-step="{i}" aria-pressed="{str(i==0).lower()}"><span>{i+1:02d}</span> {name}</button>' for i,name in enumerate(stages))
        cards.append(f'''<article class="journey-direction" id="{esc(identity)}" data-guided-route{' hidden' if index else ''}>
<header class="route-heading"><p class="eyebrow">{esc(f['area'])}</p><h3>{esc(f['title'])}</h3><a href="#source-questions">Browse all source questions ↓</a></header>
<div class="route-layout"><div class="route-visual"><nav class="route-stages" aria-label="Reading stages">{step_buttons}</nav>
<div class="route-map" role="group" aria-label="{esc(f['area'])}: existing result, proposed targets and wider question">
<div class="route-focus" aria-hidden="true"></div><svg class="route-connections" aria-hidden="true"></svg>
<button type="button" class="route-node route-result" data-route-node="result" data-stage="0"><small>Existing proof</small><strong>{esc(result)}</strong><span aria-hidden="true">✓</span></button>
<div class="route-targets">{targets}</div>
<button type="button" class="route-node route-horizon" data-route-node="horizon" data-stage="2"><small>Research horizon</small><strong>{esc(horizon)}</strong></button>
</div><p class="route-legend"><span>✓ Existing result</span><span>┄ Proposed route · not a proved implication</span></p><p class="route-cue">Scroll to follow the route, or choose a stage.</p></div>
<div class="route-narrative">
<section class="route-chapter" data-route-chapter="0" id="{esc(identity)}-known"><p class="route-chapter-label">01 / WHAT WE KNOW</p><h4>A proof to build on.</h4><p>{esc(stories[f['builds_on']]['finding'])}</p><a href="results/{esc(f['builds_on'])}/">Read the proof &amp; exact scope ↗</a><details><summary>What this result does not settle</summary><p>{esc(stories[f['builds_on']]['boundary'])}</p></details></section>
<section class="route-chapter" data-route-chapter="1" id="{esc(identity)}-contribute"><p class="route-chapter-label">02 / WHERE TO CONTRIBUTE</p><h4>The next missing bridge.</h4><p>{esc(f['next_step'])}</p>{target_details}</section>
<section class="route-chapter" data-route-chapter="2" id="{esc(identity)}-horizon"><p class="route-chapter-label">03 / WHAT COMES NEXT</p><h4>A wider question comes into view.</h4><p>{esc(f['question'])}</p><a href="#rp={esc(f['id'])}">Explore the research direction ↗</a><p class="route-source-note">Proposed follow-up · open in the cited source version.</p></section>
</div></div></article>''')
    return ('<section class="research-journey result-followups" id="next-questions" aria-labelledby="next-questions-title">'
        '<p class="eyebrow">01 / OUR PRIORITY DIRECTIONS</p><h2 id="next-questions-title">Small steps. Deeper connections.</h2>'
        '<p class="journey-intro">A curated set of questions where we see a concrete way to contribute. Choose a field, follow what is already proved, and find the next bridge to build.</p>'
        '<nav class="journey-priorities" aria-label="Priority research areas">'+''.join(choices)+'</nav><div class="journey-grid">'+''.join(cards)+'</div></section>')
