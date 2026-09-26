# Open Math pitch deck

`site/open-math.html` is a fourteen-slide pitch, linked from Contribute, for a
conversation with SAIR's Open Math Model initiative. It leads with the
project's own story and ends with why the two efforts fit:

1. **true · return · Turing**: a scientific method for discovering truth, for
   people and AI.
2. **#1 on every leaderboard** of SAIR's Equational Theories Stage 2 (Team
   Omega): 1889/1889 public problems certified, zero LLM calls
   ([solver repository](https://github.com/the-omega-institute/sair-eqt2-stage2-solver),
   arXiv:2609.00706).
3. **Logic is the subject**: mathematics (411 problem dossiers), physics (294
   quantum modules), concepts and ethics (940 ConceptDynamics modules).
4. **Information escape, defined**: readout `q`, question `T`, and
   `E(q, T) = { (x, y) : q(x) = q(y), T(x) ≠ T(y) }`.
5. **The engine**: `E(q ∨ d, T) = E(q, T) ∩ ker d` (DECT). What still escapes
   is the next question; a blind residual calls for a new language.
6. **An escape, measured**: `LocalMarginalCorrelationBlindSpot`, 9 of 15
   directions for two qubits.
7. **The filter**: no new distinction, no new theorem (bind-only).
8. **Layer on layer** and 9. **the graph that grows** use the embedded Atlas
   history and dependency showcase described below.
10. **The kernel decides**, and the reasoning rules are theorems too
    (CLAUDE.md §2.7).
11. **Anyone, any agent, any model**: bring an idea, or bring a theory (74
    theory documents, 48,223 tracked claims, 4,130 closed by checked theorems).
12. **Real mathematics**: 164 open problems settled; the original authors are
    contacted, three collaborations are under way and the first joint paper is
    headed to arXiv.
13. **SAIR Open Math Model × trureturing** and a first four-week project.
14. **Let's build Math 2.0 on ground that checks itself.**

Repository counts refer to trureturing `6fec50cf0`. Speaker notes carry the
supporting detail; the slides stay short.

## An embedded presentation of the actual Pages evidence

The cover uses a real Atlas subgraph. Slide 9 embeds a dedicated presentation
view of those same identities and relationships. It is an offline excerpt of
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

Rebuild the cover SVG and deterministic node positions from that excerpt with:

```sh
node tools/render_open_math_graphs.mjs
```

## History

Slide 8 samples observations 1, 15, 30, 45 and 59 of the published architecture
history. Their raw snapshot hashes were checked against the history index.
Each observation in the bundled excerpt retains its content-addressed path,
digest, source commit, release, full library size and DeficitInteger reach.
Selecting an observation changes the library count and snapshot link. The chart
shows **67, 69, 74, 75, 75** reachable downstream modules. Its horizontal axis is
observation order, not elapsed time. This is module-import reach, not theorem-use
counts, author credit or community adoption.


## Preview, interaction and export

Serve `site/` with `python3 -m http.server 8876 --directory site`, then open
`http://localhost:8876/open-math.html`. No full site generation, Lean build or
remote data access is required for the embedded presentation.

- Desktop: 1280×720 presentation stage. Small screens: a responsive document.
- `?view=read` / `?view=present` select the mode; `?lang=zh-CN` selects Chinese.
- `#s1` through `#s14` link to a slide. Arrow keys and Home/End navigate;
  `N` shows notes and `F` toggles fullscreen. Graph controls keep their own
  keyboard events; tabs support left/right arrows. Mobile graph touches do not
  trigger a slide swipe.
- Print / PDF produces fourteen landscape pages. The dependency slide prints a
  consistent local view and explanation, even after other live interactions.
- With JavaScript disabled or the data request failing, the cover, complete
  static local diagram, explanation, history chart and public evidence links
  remain usable. Interaction controls stay disabled instead of pretending to
  work. The whole deck remains readable.

For the repository's isolated Playwright/Chrome browser validation:

```sh
python tests/browser/open_math_deck.py --output /tmp/open-math-review
```

It tests both languages, all slides, containment, mobile and smaller desktop
viewports, node selection, source excerpts, record links, tab keyboard handling,
history selection, no-JavaScript and failed-fetch fallbacks. It produces
screenshots and both PDFs; exported links use public Pages, not the local test
server. `tests/test_open_math_deck.py` also checks edge direction against import
records, complete downstream closure, pinned evidence and translation coverage.
