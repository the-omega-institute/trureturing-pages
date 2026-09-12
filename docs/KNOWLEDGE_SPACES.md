# Automatic knowledge spaces

This change implements a release-bound, corpus-independent exploration surface and
its build-time projection. The global 3D Atlas remains the home experience. New
source domains, source citations and registered targets create views from data;
there is no OEIS/Erdos-specific renderer or new manually authored verification list.

## Architecture and current ownership

Scribe already owns declaration handles, Describe identities, assessed provenance,
source references, acknowledgements, display-formula provenance and resolution claims.
The current Pages `lib/literature.py` reads its emitted citations. This projection
reuses those records, preserving authors, year, role, original source/version URL
and attributed declaration. It never rechecks or silently strengthens the claims.

`lib/knowledge_spaces.py` reads an already verified `pages-library-snapshot.v1`.
Truth resolution gating remains in `lib/problem_resolutions.py` and `build_library`.
Source domains come from the graph. Source associations come from existing Scribe
citations and dossiers. Website collections group explicitly registered question
sources by hostname; they do not claim complete coverage of a mathematical corpus.
An open module does not automatically create a scientific open problem.

The following are intentionally separate: released module state, a source-recorded
resolution backed by the release gate, an authored literature attribution and an
external literature-status check. No novel-result flag, last-checked date or theorem
verification is invented. Source text remains authored text even inside a release.

### Actual data available now

Every current graph record is indexed, including its existing Scribe explanation
and citations. Mathematical modules receive source-domain views, source views and
registered-target views. Target anchors absent from the graph remain explicit.
Standalone unjoined theory atoms, complete structured Scribe provenance assessments,
experimental records, attempts and exact declaration-use edges are not supplied by
Library snapshot v1. The coverage panel reports those gaps. This implementation does
not claim that a domain grouping is a complete autonomous-theory inventory.

The package-side extension plan and acceptance criteria are in
[packages PR #29](https://github.com/the-omega-institute/trureturing-fkst-packages/pull/29).
Reuse document-graph #26 and the existing evidence/delta/counterfactual #21/#22/#24
work when adopted. Do not duplicate those producers or manually fill their missing
fields in Pages. The Base publishing pipeline is unchanged and owner-managed.

## Implemented experience

`spaces.html` provides four data-generated perspectives: source domains, literature
sources, question-source websites and research targets. Search covers names and
source attribution. Each space has an independent URL and can be compared with any
other space. The same module identity appears in every view, with one Library route.

The 3D workspace reuses the vendored ForceGraph3D library and the existing public
Atlas startup/layout worker. Supplied coordinates remain unchanged between scopes;
selection never starts a new layout simulation. A sidebar reads authored summaries,
statements, sources and acknowledgements, then follows actual dependencies without
opening another page. A complete paginated module list is available without WebGL.
Desktop and mobile use the same records and controls. Source IDs and release hashes
are inside evidence details, not the primary explanation.

`atlas.html` keeps its existing renderer, scene and primary navigation; its contextual
entry now opens the generic spaces view. `research.html` introduces automatically
generated domain entries, shows six result cards initially, preserves every remaining
result and old anchor in expandable archives, and stops labelling arbitrary unresolved
dossiers as current active work. Existing authored result stories and exact-scope
verification links are preserved; this change does not migrate or rewrite their data.
Conjecture dossiers and manually curated Millennium maps remain accessible through
existing routes; their full data unification awaits owner-produced joins.

## Dependency and comparison semantics

`knowledge-spaces-core.mjs` takes the existing `analyzeArchitecture` result. It does
not replace the graph reader, global metrics, topology package or certified edges.
The current analysis is at recorded module-relation granularity, not theorem-call
frequency. Proposed, affinity and document edges do not contribute to these counts.

For selected memberships A and B, with prerequisite -> consumer edges:

- context is the union of the two predecessor closures, including memberships;
- shared foundations are the intersection of closures outside A union B;
- overlap is A intersect B and is displayed separately;
- support counts distinct selected descendants, excluding the supporting node itself;
- directional crossing edges connect A\\B to B\\A, and separately B\\A to A\\B.

Diamond paths count one target once. Overlapping memberships never manufacture a
cross-space dependency. Context toggles change display scope, not underlying counts.
A selected inspection node can add its immediate neighbors without changing membership.
These are observations of the recorded graph. They establish neither mathematical
necessity nor successful transfer. Candidate effects and independently achieved
outcomes belong to the separate Topology/Intuition contracts.

## Build integration and renderer replay

The existing successful fresh-release path is:

```
build_library -> render_research -> render_news -> render_spaces
```

No additional deployment service, dependency, credential or workflow is required for
new releases. The projection writes canonical UTF-8 JSON to
`data/spaces/<sha256>.json` before publishing `data/knowledge-spaces.v1.json`.
The manifest binds catalog bytes, profile, source commit, Atlas digest and Truth release.
The browser verifies bytes and all bindings against the existing Atlas startup input
before allowing joins. Unknown schemas, corruption, unsafe URLs, duplicate identities
and mixed releases are rejected. Full target-resolution inputs must already carry the
existing release-gate annotation. Legacy renderer-only calls without a snapshot schema
remain readable but cannot emit a verified spaces catalog. A present unknown schema
fails; it is never interpreted as legacy.

An already ingested release may skip the normal Library rebuild. A local deployment
checkpoint or verified preview can regenerate **only the spaces artifacts** with:

```
python -m lib.knowledge_spaces --site _site
```

This validates the current Library archive bytes, archive coordinate, current Atlas
manifest and source commit, then projects again without appending history. It does not
refresh Research HTML or deploy the directory. A renderer-only publication still needs
the existing deployment owner to stage current site assets and publish that checkpoint.
This PR does not claim that the unchanged reconcile workflow automatically deploys
code-only changes when no new truth release exists. Future build-identity separation
is specified in packages #29. Never manufacture a new truth observation for a UI fix.

The browser reports unavailable projections explicitly on older deployments. It does
not fall back to a fixture. Display-library failure retains the already verified lists
and explanations. Browser back/forward restores selection; invalid saved space IDs
clear the old view and display an error rather than selecting a replacement identity.

## Verification and acceptance

Run from the complete repository:

```
python -m unittest discover -s tests -p 'test_knowledge_spaces.py' -v
node --test tests/js/knowledge-spaces.test.mjs
python tests/browser/knowledge_spaces.py --chromium /usr/bin/chromium
```

Python tests enter existing `test_*.py` discovery, including a Node suite wrapper.
The optional browser suite requires Playwright and Chromium. It uses `set_content`
with actual component HTML/CSS and joined actual modules. Startup, Fetch, History,
SHA transport and the renderer are explicit test doubles. Hashing is independently
executed in Python; the Node tests exercise real WebCrypto against catalog bytes.
The renderer double checks fixed graph data and no-layout selection behavior. The
fallback case checks usable UI with no 3D library. No browser security settings change.

Executed in the authoring environment: 23 Python tests (including the Node wrapper),
19 Node tests and 15 offline Chromium scenarios. The full unchanged architecture
helper and citation parser were checked against their pinned Git blobs before testing.
Integration tests execute the actual changed `render_news` with unrelated theme and
result-page emitters doubled. Existing Research assertions retain all old scope and
link checks; only the active-work heading expectation changes.

Acceptance covered: domains with no question catalog; arbitrary new domain/host;
source identity reuse and citation roles; missing anchors; open-module/target separation;
resolution gating; duplicate nodes/slugs; hostile URLs; deterministic projection;
content-addressed emission; corrupt/mixed replay; no duplicate history on replay;
news generation with all legacy result anchors retained; diamond and overlapping
membership counts; advisory-edge exclusion; scope URL restoration; missing identities;
context changes; desktop/mobile DOM; and accessible no-WebGL fallback.

This sparse authoring checkout did not run the complete pre-existing Python/Node
suite, .NET, full release construction, real network ESM, the production layout worker,
WebGL rendering, native History under an HTTP origin, or a Pages deployment. Component
screenshots are offline fixture views. Opening a PR is not production deployment.
No Lean, Scribe source, Frozen ledger, Base workflow, package pin, authorization or
CI configuration is changed. Package #29 is a separate design PR, not a runtime API
implementation claim.
