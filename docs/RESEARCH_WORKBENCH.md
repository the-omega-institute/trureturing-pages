# Research conjecture workbench

The research index now has a Pages-owned, advisory question bank above the existing
release-bound dossiers. The bank contains seven source questions and fourteen
proposed subproblems grounded in `trureturing/Problems`. It adds no Lean declarations,
truth states, archive observations, generated graph edges or release promotions.

## Content and provenance

Edit `site/assets/research-catalog.json`. The first revision records the seven
upstream dossiers at commit `89231f9140ce2138a4e74d4d03421c724149ac24`. Its review
covers repository dossiers, not a fresh literature-resolution audit or a complete
review of current development PRs. Existing or newly completed formalizations
must be checked before treating any listed gap as still missing.

Each family has a stable ID matching its upstream dossier, a complete DOI,
explicit repository anchors, a question, a repository foothold, a gap to recheck,
a concrete next step and a progress criterion. Child targets distinguish bridges,
certificates, route tests and research questions. They are proposals; their
completion is never inferred from a parent theorem or a matching source path.
Related targets are suggested connections, not dependency edges.

The seven families cover sparse base-4 DFAO minimality, dimension-six MUBs,
negative base-phi prefixes, ordered and random Zeckendorf games, Wall-Sun-Sun
period lifts and polynomial-subsequence maximum order complexity. The finite
UNSAT target deliberately uses the correct implication: a sound finite sample
obstruction suffices for a lower bound, while a finite SAT candidate still needs
an all-input correctness proof.

To add a family or target, provide every required field, keep IDs unique, link
only existing target IDs, and use a pinned upstream commit. Update the catalog
revision and review date when rechecking sources. Run the tests below. Validation
rejects unsafe anchor paths, incomplete content and unresolved related IDs.

## Browsing and personal progress

Search covers questions, next steps, DOI, anchor paths and bilingual keywords.
Field, type, horizon, personal stage and shortlist filters compose. Advanced
filters fold on narrow screens. Shared links use `#rp=<id>`; filter state uses
`rq`, `ra`, `rk`, `rh`, `rs`, `ro` and `rw`. Existing `#node=<gid>` entrypoints
also filter the curated anchors. A question permalink clears hiding filters.

The notebook uses only `trureturing.pages.research-notes.v1` in localStorage.
Stages are Not started, Reading, Working, Blocked and Ready for review. These are
personal workflow labels, with no Proved or Complete state. Notes, shortlist and
stage persist in that browser. They do not synchronize across people or devices.
Export and import use `pages-research-notes.v1`. Import validates the complete
file before merging known IDs, rejects files above 1 MB, preserves unaffected
entries and reports unknown IDs. Imported entries replace the corresponding
local entries. A different catalog revision requests source reassessment.

The GitHub progress link opens a prefilled upstream issue form containing public
catalog text only. It neither submits the issue nor transmits local notes.
Use a reviewed repository record for shared progress and proof evidence.

## Integration and failure behavior

`living-library.js` is a small bootstrap. Existing handlers move verbatim to
`living-library-release.js`, retaining their relative imports and behavior.
The workbench loads only on `.research-home`, uses no external runtime dependency
and does not alter dossier detail pages. The original server-rendered listing,
release graph links and history remain under an expandable archive section.
A catalog failure leaves that original listing untouched. Source dossiers remain
usable without the optional enhancement. All catalog and note text is rendered
through DOM text APIs, never inserted as HTML.

The archive schema, release verifier, source parser and publication pipeline are
unchanged. In particular, this change does not handle upstream frontmatter
migrations or claim a new deployment has occurred.

## Checks

```sh
node --test tests/research-workbench.test.mjs
python tests/research_workbench_browser.py --chromium /usr/bin/chromium
```

The Node suite exercises catalog integrity, pinned links, related targets,
search/filter/sort behavior, notebook round trips and invalid imports, stable
permalinks and the finite-UNSAT implication. It requires no added dependencies.

The optional Python smoke test requires Playwright and an installed Chromium.
It runs an offline DOM fixture with in-memory catalog and storage doubles, using
the workbench's DOM code and styles. It checks filtering, restored notebook state,
import/export, hash navigation, mobile overflow, failed catalog loading and
storage-denial handling. It does not validate native localStorage persistence,
network delivery, the full production site or a truth-release archive.
`--screenshots <directory>` saves desktop and mobile fixture captures.
