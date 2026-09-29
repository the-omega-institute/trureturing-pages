# Open Math collaboration pitch

`site/open-math.html` is an eleven-slide bilingual pitch for SAIR's Open Math Model
initiative. It leads with actual human–AI research and a public joint manuscript.
The harness combines reference retrieval, formalization, information escape and
rejection of bind-only output. The proposal is to connect OMM to this research
harness and open contribution workflow, with mathematicians guiding the questions.

1. Human insight. Machine rigor. Shared discovery.
2. Cloitre / A076502: a counterexample, complementary work and a public joint paper.
3. Public research directions: Sahbi's hypercube/grid work and Nikandish's clique theorem.
4. Information escape: different states remain identical to every concept in the selected catalog.
5. Contribution gain: remove a concept and measure which distinctions disappear.
   One two-graph example carries both slides.
6. The harness: retrieval, information escape, rejection of bind-only, formal proof.
7. The actual pinned Atlas excerpt and reusable formal results.
8. Open participation: questions, examples, arguments, formalization and independent checks.
9. Team Omega: **#1 on every SAIR EQT2 leaderboard**, **1889/1889** certified;
   the EQT2 solver used zero LLM calls.
10. Connect OMM to the harness and open a shared contribution loop.
11. Choose a research direction, connect the model, and open the work to contributors.

## Public case evidence

The Cloitre manuscript and reproducibility archive are public:
https://github.com/the-omega-institute/a076502-padovan/releases/tag/v1.0.1
and https://doi.org/10.5281/zenodo.22979217. The displayed manuscript image is rendered directly from page 1 of the public
`v1.0.1` PDF, cropped to preserve the original title, authors, date and complete
abstract. It has no tilt, decorative paper layers or reconstructed typesetting.
It links to that public PDF; an arXiv link can replace it once supplied.
Image provenance and reproduction instructions are in
`site/assets/open-math/MANUSCRIPT_IMAGE.md`. The 69 Lean modules and 18 theorem axiom audits refer to the
archived September 23, 2026 verification. No new Lean build is required for this deck.

Follow-up directions link to public artifacts. The general grid conjecture and
Nikandish's next coloring problem are marked as next directions, not solved results.
The deck includes no private email quotations, addresses or manuscript attachments.

## Harness core

Slide 6 explains the four requirements together:

- **Reference retrieval:** search local declarations, pinned mathlib and admissible
  third-party Lean libraries before proving. Check assumptions and directly import
  exact matches. Literature checks establish original statements and solved scope.
- **Information escape:** fix the state space and selected concept catalog. Count
  different states that every selected concept still merges. Leave-one-out gain
  measures distinctions a contribution supplies beyond the remaining catalog.
- **Reject bind-only:** inline local aliases and helpers relative to fixed existing
  premises. Instantiation, projection and normalization wrappers do not qualify as
  new mathematical content. A substantive witness must be on the live proof path.
- **Formalization:** state the claim and assumptions in Lean, then check the proof
  term and axiom dependencies. Accepted contributions return to the reference library.

The source anchors are `CLAUDE.md` §§3.1–3.2 and the linked information-escape
formalization. The deck describes the research discipline without claiming a
universal automated novelty judge. A preregistered named external open-problem
resolution has a separate admission basis; speaker notes preserve that distinction.

Slide 10 proposes integrating OMM into this harness, without an invented schedule
or fixed number of models or questions. The joint output is checked mathematics,
sources and dependencies that researchers and community contributors can extend.

## Information escape illustration

The intrinsic definition is `E_S = {(x,y): x ≠ y and ∀ i ∈ S, c_i(x)=c_i(y)}`.
Two states differ, but the selected mathematical concepts cannot tell them apart:
their difference escapes the catalog's discriminating power. No external target
question is required; this is the identity-target specialization of the general
residual theory. The catalog readouts derive from registered primitive bundles,
not arbitrary labels attached to proof terms.

For a fixed finite state space with at least two states, the escape rate is
`ε(S) = |E_S| / (|X|(|X|−1))`: the fraction of ordered different pairs still
indistinguishable under all selected concepts. The rate compares catalogs on the
same arena; deleting hard states does not count as capturing their differences.

The illustration fixes exactly two graphs: a six-cycle and two disjoint triangles.
With sorted degree sequence as the only concept, both readings are
`(2,2,2,2,2,2)` and both ordered different pairs escape, giving `2/2`.
Connectedness makes their difference visible to the viewer but is not included
in the selected catalog. Relabeling preserves the rate. Adding triangle count
gives readings `0` and `2`, separating the states and reducing escape to `0/2`.
The triangle count inspects original graph relations, not just the degree sequence.

Contribution gain uses the same current catalog, with and without one member:
`δ_i = ε(S ∖ {i}) − ε(S)`. Removing triangle count makes the two states
indistinguishable again, yielding gain `1 − 0 = 1`. Removing degree sequence
while retaining triangle count has gain `0`. This is a leave-one-out
counterfactual, not a comparison against historical submissions. Zero gain here
means redundant in this catalog, not globally useless mathematics.

The public source links establish the definitions and principles:

- `InformationEscape/EscapePairs.lean`: intrinsic escape and unique capture.
- `InformationEscape/ExactRate.lean`: exact escape fractions and leave-one-out gain.
- `InformationEscape/StructuralNovelty.lean`: in the nondegenerate finite catalog,
  positive gain is equivalent to strict kernel refinement and nonrecoverability
  from the remaining catalog.
- `DefinitionEscape/BlindKernelObstruction.lean`: a pair invisible to the whole
  available definition language remains invisible to its combinations.

The specification's sections 3.1 and 4.3 give the intrinsic definition and its
collision-probability interpretation:
`docs/develop/spec/lean_single_compile_intrinsic_information_escape_theory_and_spec.md`
in the source repository. The earlier target-relative graph explanation has been
replaced by this intrinsic definition; both give the same numbers in this example,
but only the latter directly explains the catalog metric used by the project.

The graph example explains the metric; it is not a novel admitted theorem.
Bind-only separately checks proof shape and the live substantive witness, with
a distinct admission basis for preregistered named external open-problem resolutions.

`open-math-escape.mjs` controls the illustration. Its default state remains
readable without JavaScript. Print restores the initial state and then restores
the live selection afterward.

## An embedded presentation of the actual Pages evidence

Slide 7 embeds a dedicated presentation view of actual Atlas identities and relationships. It is an offline excerpt of
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
- `#s1` through `#s11` link to a slide. Arrow keys and Home/End navigate;
  `N` shows notes and `F` toggles fullscreen. Graph controls keep their own
  keyboard events; tabs support left/right arrows. Mobile graph touches do not
  trigger a slide swipe.
- Print / PDF produces eleven landscape pages. The dependency slide prints a
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
