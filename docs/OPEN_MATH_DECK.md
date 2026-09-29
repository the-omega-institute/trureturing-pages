# Open Math collaboration pitch

`site/open-math.html` is a ten-slide bilingual pitch for SAIR's Open Math Model
initiative. It leads with actual human–AI research and a public joint manuscript.
The harness combines reference retrieval, formalization, information escape and
rejection of bind-only output. The proposal is to connect OMM to this research
harness and open contribution workflow, with mathematicians guiding the questions.

1. Human insight. Machine rigor. Shared discovery.
2. Cloitre / A076502: a counterexample, complementary work and a public joint paper.
3. Public research directions: Sahbi's hypercube/grid work and Nikandish's clique theorem.
4. The harness core: reference retrieval, information escape, rejection of bind-only,
   and formal verification. Each requirement explains its effect on output quality.
5. Information escape and strict contribution rules, with a finite interactive illustration.
6. The actual pinned Atlas excerpt and reusable formal results.
7. Open participation: questions, examples, arguments, formalization and independent checks.
8. Team Omega: **#1 on every SAIR EQT2 leaderboard**, **1889/1889** certified;
   the EQT2 solver used zero LLM calls.
9. Connect OMM to the harness and open a shared contribution loop.
10. Choose a research direction, connect the model, and open the work to contributors.

## Public case evidence

The Cloitre manuscript and reproducibility archive are public:
https://github.com/the-omega-institute/a076502-padovan/releases/tag/v1.0.1
and https://doi.org/10.5281/zenodo.22979217. The displayed paper panel is a
linked editorial representation, not a screenshot. It preserves the actual title
and authors. The 69 Lean modules and 18 theorem axiom audits refer to the
archived September 23, 2026 verification. No new Lean build is required for this deck.

Follow-up directions link to public artifacts. The general grid conjecture and
Nikandish's next coloring problem are marked as next directions, not solved results.
The deck includes no private email quotations, addresses or manuscript attachments.

## Harness core

Slide 4 explains the four requirements together:

- **Reference retrieval:** search local declarations, pinned mathlib and admissible
  third-party Lean libraries before proving. Check assumptions and directly import
  exact matches. Literature checks establish original statements and solved scope.
- **Information escape:** define the representation and target, quantify the missing
  distinctions and let the residual guide the next definition or research step.
- **Reject bind-only:** inline local aliases and helpers relative to fixed existing
  premises. Instantiation, projection and normalization wrappers do not qualify as
  new mathematical content. A substantive witness must be on the live proof path.
- **Formalization:** state the claim and assumptions in Lean, then check the proof
  term and axiom dependencies. Accepted contributions return to the reference library.

The source anchors are `CLAUDE.md` §§3.1–3.2 and the linked information-escape
formalization. The deck describes the research discipline without claiming a
universal automated novelty judge. A preregistered named external open-problem
resolution has a separate admission basis; speaker notes preserve that distinction.

Slide 9 proposes integrating OMM into this harness, without an invented schedule
or fixed number of models or questions. The joint output is checked mathematics,
sources and dependencies that researchers and community contributors can extend.

## Information escape illustration

Four states have target values `[0, 1, 0, 1]`. The initial readout groups the first
pair and the last pair. Four ordered distinct pairs escape out of twelve.
Relabeling leaves `4/12`; adding a distinction that separates the first pair
leaves `2/12`. The fixed denominator is the number of ordered distinct state pairs.
This example illustrates the mechanism; it is not a measured escape rate for a
collaboration case. Proof nontriviality is a separate criterion on the actual
proof path relative to existing foundations. Named open-problem resolutions have
a separate admission basis, described in the speaker notes and linked rules.

`open-math-escape.mjs` controls the illustration. Its default state remains
readable without JavaScript. Print restores the initial state and then restores
the live selection afterward.

## An embedded presentation of the actual Pages evidence

Slide 6 embeds a dedicated presentation view of actual Atlas identities and relationships. It is an offline excerpt of
the published product, with direct links into Atlas, the generated result pages,
source history and Evolution. It does not iframe the full website or call a live
API during a presentation.

- The complete excerpt contains **79 modules and 97 module-import edges**:
  `DeficitInteger`, its three direct prerequisites, and all 75 reachable downstream
  modules. Desktop opens with the complete network; mobile opens the local view.
- Selecting a node updates its explanation, full-graph degree/reach counts and
  evidence links. The local view shows up to five prerequisites and five direct
  dependents; it says when that display limit is reached. Boundary nodes outside
  the bundled exploration metadata open their immutable result pages directly.
- A guided path focuses `DeficitInteger → DeficitThreeValued → AlmostAdditivity`.
  Its three Lean statement excerpts are verbatim statement headers from the
  pinned source. They are excerpts, not the complete proofs.
- The record tab links to the immutable result page, Git history at the pinned
  commit, and the current Evolution page for the selected identity. Public Atlas
  and Evolution may have advanced beyond the deck snapshot.
- Colors group Deficit, Analytic and other modules. Coordinates are a deterministic
  force layout for presentation, not mathematical coordinates or proof steps.

`site/assets/open-math/atlas-excerpt.json` records source identities, the full
prerequisite/dependent lists for selectable modules, the excerpt edges, layout
positions, statement excerpts and historical observation receipts. Explanations
come from published Atlas metadata. Interface text and the three guided-path
summaries are bilingual; other mathematical descriptions retain their source
language and are labeled accordingly.

The source graph's raw SHA-256 is
`5841574f82ceafbe52a1f3a63dff19822e25168a0c1adaeaa251e3eef460ae69`.
It was obtained from `data/pages-atlas-view.v1.json` and checked against the
published manifest. The graph, source statements and release links pin:

- Source commit: `a450fbe4eed778b0b5f5b4954ce7f9a500f074c0`.
- Truth release: `f8a59e9e5c1ec71a983cd8844eaf6b9f0b55555ba3a49dc58550db6ab2446873`.

Rebuild the network SVG and deterministic node positions from that excerpt with:

```sh
node tools/render_open_math_graphs.mjs
```

## Preview, interaction and export

Serve `site/` with `python3 -m http.server 8877 --directory site`, then open
`http://localhost:8877/open-math.html`. No full site generation, Lean build or
remote data access is required for the embedded presentation.

- Desktop: 1280×720 presentation stage. Small screens: a responsive document.
- `?view=read` / `?view=present` select the mode; `?lang=zh-CN` selects Chinese.
- `#s1` through `#s10` link to a slide. Arrow keys and Home/End navigate;
  `N` shows notes and `F` toggles fullscreen. Graph controls keep their own
  keyboard events; tabs support left/right arrows. Mobile graph touches do not
  trigger a slide swipe.
- Print / PDF produces ten landscape pages. The dependency slide prints a
  consistent local view and explanation, even after other live interactions.
- With JavaScript disabled or the data request failing, the cover, complete
  static local diagram, explanation and public evidence links
  remain usable. Interaction controls stay disabled instead of pretending to
  work. The whole deck remains readable.

For the repository's isolated Playwright/Chrome browser validation:

```sh
python tests/browser/open_math_deck.py --output /tmp/open-math-review
```

It tests both languages, all slides, containment, mobile and smaller desktop
viewports, node selection, source excerpts, record links, tab keyboard handling,
escape illustration, no-JavaScript and failed-fetch fallbacks. It produces
screenshots and both PDFs; exported links use public Pages, not the local test
server. `tests/test_open_math_deck.py` also checks edge direction against import
records, complete downstream closure, pinned evidence and translation coverage.
