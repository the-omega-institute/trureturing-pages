# Open Math collaboration pitch

`site/open-math.html` is a fourteen-slide bilingual pitch for SAIR's Open Math
Model initiative. The narrative establishes the motivation for formalization,
then asks what additional understanding a contribution supplies. Information
escape answers the concept-distinction part of that question. The harness
brings the requirements together before the deck shows results and proposes
opening this research loop to OMM and community contributors.

1. Human intelligence, machine rigor, an endless research loop. A short outcome
   line establishes that the loop already produces results.
2. Intuition, AI exploration and reading, Lean formalization, and reusable logic.
3. The transition: a proof checks out, but what have we learned? Formal validity
   and additional understanding motivate distinct checks.
4. Intrinsic information escape: different states indistinguishable to the catalog.
5. Escape rate and leave-one-out gain: what distinctions disappear without a concept.
6. Harness: reference retrieval, formal verification, rejecting bind-only, escape.
7. Construction and verification capability: EQT2 #1, 1889/1889 certified, zero
   LLM calls in that solver.
8. Outcomes: 439 recorded resolutions, two joint arXiv papers with real PDF
   images, and 20+ researchers in mathematical exchanges.
9. Reciprocal work: Sahbi's joint paper, Nikandish's exact coloring and shared
   writing, Campbell/Cloitre recurrence proofs and next questions.
10. Research conversations: twelve names on a dedicated slide, in three columns
    and four rows, with readable affiliations and consistent alignment.
11. A growing white-box model: knowledge organized through logical relationships
    across disciplines. The 15,113 to 34,526 frozen-statement chart and real
    dependency graph show accumulation. Information escape, recursive relations,
    spacetime and holographic geometry remain the research foundations.
12. Start before becoming an expert; learn by making one step precise.
13. Connect OMM to the harness and open contribution loop.
14. Start with one idea. Make one step precise. Choose the next question together.

The matching English and Chinese talk tracks are in
`docs/OPEN_MATH_TALK_TRACK.md`. Each numbered paragraph follows its slide.
The full Atlas remains directly linked from the growth and reuse story.

## Public case evidence

The Cloitre manuscript and reproducibility archive are public:
https://github.com/the-omega-institute/a076502-padovan/releases/tag/v1.0.1
and https://doi.org/10.5281/zenodo.22979217. The displayed manuscript image is rendered directly from page 1 of the public
`v1.0.1` PDF, cropped to preserve the original title, authors, date and complete
abstract. It has no tilt, decorative paper layers or reconstructed typesetting.
The image links to that archived PDF; its caption links to the now-public
arXiv preprint, https://arxiv.org/abs/2609.33421. The screenshot remains
explicitly labeled as the archived manuscript, not an arXiv rendering.
Image provenance and reproduction instructions are in
`site/assets/open-math/MANUSCRIPT_IMAGE.md`. The 69 Lean modules and 18 theorem axiom audits refer to the
archived September 23, 2026 verification. No new Lean build is required for this deck.

The October 1 update uses the collaboration tracker to find progress and then
verifies the claims against public artifacts. The public evidence manifest is
`site/assets/open-math/research-progress.json`. No private correspondence,
contact details or author praise is copied into the site.

Slide 9 shows three concrete research loops:

- **Sahbi:** arXiv:2609.25128v3 publicly lists Ma, Sahbi and Wenlin. The
  hypercube theorem is Lean formalized; subsequent grid proofs and exact
  certificates support continued work on the open general grid conjecture.
- **Nikandish:** the exact dimension-six chromatic number is 15. The independent
  certificate checks all 2,824 subspaces and 3,986,076 pairs. Public PR #1
  contains Nikandish’s proof, geometry and code commits, making reciprocal
  contributions directly inspectable. PR snapshot `d32555c` remains open.
  Its historical Lean result contains native-evaluation axioms; the slide
  accurately presents a checked finite certificate, not a pure kernel result.
  Dimension seven and a structural coloring rule remain open.
- **Campbell and Cloitre:** their proposed recurrences led to a public explicit
  solution for Campbell’s example (ratio liminf 2/5, limsup 3/4) and golden/Fibonacci
  structure for Cloitre’s example. These are written proofs and finite checks,
  not Lean formalizations. Cloitre’s full ratio convergence remains open;
  no joint-paper authorship is claimed.

The slide uses three result-led columns with public links and one next question
per project. The proposal offers active projects and the open contribution
community alongside the harness. It does not imply that these researchers have
already agreed to participate in OMM.

## Growth and research foundations

Slide 11 places the accumulated knowledge after the public research cases and
before the invitation to contribute. It shows cumulative frozen theorem statements increasing from
15,113 to 34,526 over September 2–27, 2026: +19,413, or 2.28×.
The chart uses actual source timestamps, a linear count axis starting at zero,
and the first public baseline plus the last available source snapshot per UTC day.
There is no interpolation beyond straight segments and no extrapolation.

`site/assets/open-math/theorem-growth.json` pins every point to a source commit
and published Truth release, plus a hash of the sorted statement IDs.
The count is unique `statement_id` values with `kind=theorem` in schema-v5 Freeze
records under `Golden/Frozen/accepted`. It includes retained historical frozen
statements. It excludes definitions, constructors, blueprint nodes and module
counts; it does not estimate the number of distinct mathematical ideas.

Reproduce every count without running Lean:

```sh
python tools/verify_open_math_growth.py /path/to/trureturing
```

Regenerate the standalone SVG using Matplotlib in an isolated rendering environment:

```sh
python tools/render_open_math_growth.py
```

Matplotlib is not a site or CI dependency. The chart is a static, locally bundled
SVG and stays visible offline and in PDF exports.

The philosophy appears as a research thesis: mathematics is logical structure,
and knowledge connects through relationships across disciplines. Three compact
lines retain shared logic and information escape, relations of relations and
recursion, and spacetime and holographic geometry. The source manifest links the actual theory texts.
Speaker notes distinguish this research orientation from an unconditional claim
that every single readout must lose information: an injective readout can be
complete on its stated domain. The dependency excerpt connects that growth to the reuse of earlier results.
The next slide invites more people to contribute to this shared knowledge.

## Harness core

Slide 6 explains the four requirements together:

- **Reference retrieval:** search local declarations, pinned mathlib and admissible
  third-party Lean libraries before proving. Check assumptions and directly import
  exact matches. Literature checks establish original statements and solved scope.
- **Formalization:** state the claim and assumptions in Lean, then check the proof
  term and axiom dependencies. Accepted contributions return to the reference library.
- **Reject bind-only:** inline local aliases and helpers relative to fixed existing
  premises. Instantiation, projection and normalization wrappers do not qualify as
  new mathematical content. A substantive witness must be on the live proof path.
- **Information escape:** fix the state space and selected concept catalog. Count
  different states that every selected concept still merges. Leave-one-out gain
  measures distinctions a contribution supplies beyond the remaining catalog.

The source anchors are `CLAUDE.md` §§3.1–3.2 and the linked information-escape
formalization. The deck describes the research discipline without claiming a
universal automated novelty judge. A preregistered named external open-problem
resolution has a separate admission basis; speaker notes preserve that distinction.

Slide 13 proposes integrating OMM into this harness, without an invented schedule
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

## Output counts and research reach

The October 1 registry has 439 unique problem IDs: 336 proofs and 103
refutations. `problem-resolutions.json` publishes their IDs, titles, original
sources and kinds without correspondence. This is a recorded-resolution count,
including counterexamples, and not a claim that every result has new priority.
The currently deployed catalog has 419 released entries at source `2a9d8fea`;
the deck labels the larger count as recorded to keep the publication distinction.

Twenty-plus refers to 28 named researchers across 16 two-way mathematical
correspondence threads, including copied coauthors. The manifest lists the
names and explains this scope. It does not mean twenty coauthored papers or
independent responses from every participant. The two arXiv papers are verified
separately. Affiliation labels refer to individuals, not institutional partners.
The user's remembered UK contact is supported by The Open University and Queen
Mary records; Oxford was not substantiated and is not claimed. Campbell's OpenAI
affiliation was directly confirmed in correspondence. Other displayed affiliations
are verified in the linked original papers.

## The library as a white-box model

Slide 2 introduces the organizing principle: connect knowledge through logical
relationships without partitioning it by discipline. Slide 11 names the resulting
library a growing white-box model of reasoning. Definitions, premises, proofs and
dependencies stay explicit and available for composition. The ambition to gather
all nontrivial logical relationships motivates continued extension; the deck
makes no claim that the library is complete or that the statement count measures
coverage. The OMM proposal pairs this shared library with the harness and open
contribution loop. Human direction, model exploration and checked contributions
can keep extending the same body of reasoning.

## Reusable knowledge

Slide 11 uses `atlas-network.svg`, the existing pinned module-import network,
as a compact visual of accumulated reusable results. The full Atlas is linked.
The 79-module / 97-edge excerpt and immutable provenance remain in
`atlas-excerpt.json`. The deck does not load its former interactive inspector
or fetch its JSON during a presentation. The dependency graph is a consequence
of reuse, not the project objective or an authorship map.

## Preview, interaction and export

Serve `site/` with `python3 -m http.server 8877 --directory site`, then open
`http://localhost:8877/open-math.html`. No full site generation, Lean build or
remote data access is required for the embedded presentation.

- Desktop: 1280×720 presentation stage. Small screens: a responsive document.
- `?view=read` / `?view=present` select the mode; `?lang=zh-CN` selects Chinese.
- `#s1` through `#s14` link to a slide. Arrow keys and Home/End navigate;
  `N` shows notes and `F` toggles fullscreen. The information-escape controls retain their own interaction.
- Print / PDF produces fourteen landscape pages. Bundled images remain visible offline.
- With JavaScript disabled or the data request failing, the whole deck, source links and static escape illustration remain readable.

For the repository's isolated Playwright/Chrome browser validation:

```sh
python tests/browser/open_math_deck.py --output /tmp/open-math-review
```

It tests both languages, all slides, containment, mobile and smaller desktop
viewports, paper images, affiliation entries, escape interactions and no-JavaScript
reading. It produces
screenshots and both PDFs; exported links use public Pages, not the local test
server. `tests/test_open_math_deck.py` also checks edge direction against import
records, complete downstream closure, pinned evidence and translation coverage.

The twelve-person research network has its own slide immediately after the
reciprocal research cases. Names have a consistent primary type size, with affiliations below,
in three columns and four rows. Long institution names have space to wrap within
a stable row. On phones this becomes one column. The output slide now shows
only the three headline counts, two larger manuscript images and the source link.
Topics and detailed relationship scope remain in the evidence manifest.
