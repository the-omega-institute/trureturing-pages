# Millennium research maps

The Conjectures page links to seven independently addressable, manually curated
research DAGs. The RH map connects the existing equivalence atlas to shared source
objects, candidate scripts, missing analytic bridges and the standard RH target.
The other six maps are explicitly labelled starting maps. They do not imply that
the corresponding repository areas have been comprehensively audited.

## Routes and integration

- `conjectures.html`: the optional Millennium entry is inserted after the existing
  destination navigation. Released dossiers, the workbench and their history stay
  intact. Its load failure does not prevent their independent initialization.
- `millennium.html?problem=rh`: RH overview.
- `millennium.html?problem=rh&family=F08&node=5040`: Robin and the finite checker.
- `millennium.html?problem=rh&node=A045`: expand and select the original Robin
  specification, retaining its independent forward/reverse evidence state.
- `millennium.html?problem=rh&view=catalogue`: all 93 specification summaries.
- `millennium.html?problem=rh&view=shared`: compare two families' shared inputs.
- The other IDs are `pnp`, `hodge`, `navier-stokes`, `yang-mills`, `bsd`, `poincare`.

`site/assets/living-library.js` independently imports the entrypoint. The static
`site/millennium.html` imports the same module for the dedicated view. Existing
site copying publishes these assets; there is no frontend build, new external
library, workflow change or modification of the release graph producer.

The page uses existing site navigation and editorial theme files, plus scoped
component styles. It supports mouse background panning, native touch/scroll
panning, zoom/reset, a list alternative, keyboard node activation, shareable query
parameters and browser back/forward navigation. Family expansion uses structural
edges rather than adding a cycle for each mathematical equivalence.

## Seed and provenance

`site/assets/millennium-data.json` is the single manually edited data owner. The
initial revision is `2026-09-08.manual-1`. RH has 39 overview nodes and 60 edges:
9 source-located nodes, 3 candidate-script nodes, 5 missing bridges, 21 family
nodes and the RH target. Expanding a family adds individual specification nodes;
A001 remains the standard RH root rather than becoming a duplicate node.

The 93 specifications and 21 families come from the existing theory at trureturing
commit `915a86bf19ec91fdbd690a70e75c84014d237b7d`, PR #6412, file
`docs/develop/theory/RH_RESEARCH_LANE_THEORY.md`. Links retain original full-file
line numbers. A001 is standard RH; the other 92 entries include classical
parameter families and derived formulations. A080 remains a separately labelled
preprint specification. Q01 through Q10 are visible public-coverage gaps. This
page does not claim that all public RH equivalents have already been catalogued.

The canonical source objects use pinned dev commit
`aee1eaff34f997e44f04147cee1010bb482c4c1b`. Candidate sources use the actual pinned
#6219, #6114 and #5602 commits listed in the data. A live PR link is a separate
navigation aid; its future status cannot silently change the pinned annotation.
The xi, Robin ratio and rational-checker files were reread during this change;
other seed references retain the preceding atlas's source-audit scope. No Lean
proof or transitive axiom closure was rerun.

The `5040` node explicitly links the rational Robin checker and its **10080**
instance. It does not claim that all integers above 5040 have been verified. Its
path to the Robin family crosses the separately open all-integer obligation.

Clay Mathematics Institute supplies the external seven-problem reference.
Poincare is marked scientifically solved; its repository nodes remain unassessed.
The other six starter DAGs contain conceptual objects and the original question,
not invented existing repository proofs.

## Editing the manual catalogue

The JSON contains `schema`, `revision`, `reviewed`, a `sources` dictionary and seven
`problems`. Each problem has its own `goal`, `nodes`, `edges`, `families`,
`catalogue`, `gaps`, `history` and explanation fields.

A repository source has `kind: "repo"`, `label`, `repo`, a **40-character commit**,
`path`, and optionally a known `blob` and `pr`. Literature sources use an HTTPS
URL. Avoid floating `dev` links for mathematical evidence. The renderer displays
the short commit and actual path next to source links.

Catalogue rows are compact tuples:

```json
["A045", "Robin: every n >= 5041", "F08", 7599]
```

The fourth field is the source's actual line, not the example number above. A
fifth field can override `catalogue_source`. Labels are summaries for navigation;
the pinned theory remains the location for full functions, hypotheses, quantifiers
and original references. `directions` maps a specification to `[forward, reverse]`
with values `unassessed`, `conditional`, `candidate`, or `identity`. Only the
problem's declared `root_formulation` can use `identity`. `proof_sources` gives the
actual sources of those direction annotations; `preprints` lists warning IDs.

Node states:

| State | Meaning in this manual view |
| --- | --- |
| `source` | A concrete source was located at the displayed commit. |
| `candidate` | A proof script or construction is a candidate at that source. |
| `open` | A named proof or analytic bridge is outstanding. |
| `specification` | A literature/theory statement or a family is catalogued. |
| `unassessed` | This view has not audited its repository implementation. |

There is deliberately **no manually settable `verified` state**. The validator
rejects it, and completion never propagates through graph edges. Future machine
verification must consume and validate the existing release evidence protocol,
with matching source and statement identities. A node's presence in this view
cannot mutate a Truth release or certify a problem resolution.

Edge kinds:

| Kind | Meaning |
| --- | --- |
| `support` | An editorial research connection, possibly useful in a route. |
| `plan` | A missing bridge to construct. |
| `structure` | Family, formulation or problem organization. |
| `imports` | An explicitly checked direct source dependency. |

The seed uses curated support/plan/structure edges. None is advertised as an
extracted Lean dependency. Edges run from input to proposed consumer or target;
RH equivalences are represented by direction annotations instead of reciprocal
arrows. Each edge needs a reason and source references. Validate duplicates,
missing references, source pins, directed cycles and routes to the goal before
committing an edited catalogue.

## Shared inputs, reuse and fixed points

Reuse is the number of **distinct reachable families in this curated graph**,
including planned edges. It is neither the number of Lean calls in the repository
nor a measurement of a theorem's mathematical importance. The shared view
intersects ancestor sets of two chosen families and shows the actual common
source nodes. Changing the curated edges changes these counts.

The finite iteration displayed there is `C(S) = S union predecessors(S)` until
no new graph node is added. Its fixed point is a finite reachability closure.
This provides a useful way to inspect common premises. It establishes no
stability, contraction, convergence or fixed-point theorem about RH, a Weil
operator or a dynamical system. The UI and source comments retain this distinction.

The local observation list lets the user pin nodes and write the actual map,
state space, `T(x)=x` condition and stability question they intend to study.
Notes use `trureturing.millennium.notebook.v1` in this browser only. They are
validated independently of proof data and export as JSON. Blocked storage uses
memory with a visible warning. Unreadable/invalid existing storage is left
untouched. Export is a portable backup; an import UI is not included in this
revision. Notes never alter curated source or proof states.

## Tests and execution scope

Run from the repository root:

```sh
node --test tests/js/millennium.test.mjs
python -m unittest discover -s tests -p 'test_millennium.py'
CHROMIUM_PATH=/usr/bin/chromium python tests/browser/millennium.py
```

The Python unittest shim enrolls the new Node tests and JavaScript syntax checks
in the repository's existing `test_*.py` discovery without changing its workflow.
It requires Node and fails clearly when unavailable. The browser component test
requires Python Playwright and Chromium; it is an additional local test and is
not silently assumed present in CI.

Executed for this revision: 19 Node tests, 2 Python wrappers and 13 offline
Chromium component scenarios. They cover the data/DAG contract, exact ID counts,
source binding, cycle rejection, shared closure, reuse, no proof-state inference,
5040 versus all integers, per-specification links, notes and export serialization,
all seven maps, the Conjectures insertion fixture, 390-pixel containment, keyboard
selection, failed data/storage and HTML injection resistance.

Browser HTTP and file navigation were blocked by this runtime's administrator.
No policy or security configuration was changed. The browser test therefore uses
`page.set_content` with the actual component CSS and a joined copy of the actual
core/UI modules. Fetch, History, Storage and downloads are explicit test doubles;
module imports/exports are adapted only in the test harness. Source rendering and
DOM event handlers are exercised in Chromium. Screenshots are component previews,
not screenshots of the deployed site or the full upstream theme integration.

Real HTTP/module loading, native persistent storage/downloads, the entire
production Conjectures generator, existing workbench integration in a real
release build, the full repository test suite, .NET build, deployment and Lean
compilation were **not** executed here. The sparse local checkout ran only this
change's tests. A created PR is not a live Pages deployment.
