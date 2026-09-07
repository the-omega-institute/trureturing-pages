# Research news and conjectures

Research is generated as readable HTML by `lib/research_news.py`, called from
the existing release-bound Library build. Its editorial source is
`site/assets/research-news.json`. The Atlas frontier reads the same catalog
only when opened; news does not alter certified graph nodes or edges.

## Adding a record

- Publications carry the exact current title, authors, publication date,
  venue, source URL, publication status and a bounded summary. Keep competition
  team reports distinct from the preprint's measurements and official results.
- Resolutions carry a stable ID, exact scope, `proved` or `refuted`, source
  question, merged PR, resolving declaration, pinned upstream commit and Frozen
  module statement ID. Check both the Blueprint and Frozen record at that commit.
- Keep records in the intended display order, newest first. Update `reviewed`
  after source review. Do not use review dates as publication or merge dates.
- Preview images are actual PDF first pages; record their source in
  `site/assets/publications/README.md`. Never use an older manuscript's title or
  conclusions to describe a revised journal article.

Frozen editorial evidence does not itself establish membership in the current
Truth release. The renderer checks module presence separately, and even when
present links the resolution claim to its pinned evidence. This catalog does
not replace upstream typed `OpenProblemResolutionClaim` validation. Future
automatic discovery should consume those upstream records with their exact
release and declaration coordinates.

The mdBook links follow development; pinned Blueprint, Lean and Frozen sources
remain available through the proof record. News updates can be deployed against
the current Truth release without manufacturing a new release observation.

## Routes

- `research.html`: publications and resolutions, readable without JavaScript.
- `conjectures.html`: existing field-first question bank and local notebook.
- `research/<slug>/`: existing immutable-source problem dossier routes.
- Old `research.html#rp=...` and filter hashes redirect to Conjectures. Stable
  question IDs and the `trureturing.pages.research-notes.v1` storage key are kept.
- `atlas.html#mode=frontier`: released research foundations plus separate
  recent-resolution links, explicitly labeled with their release status.

Verify with `python -m unittest tests.test_research_news` and the browser suites
`research-news.cjs`, `research-workbench.cjs`, `atlas-research.cjs`,
`living-library.cjs`, and `header-alignment.cjs` against a prepared preview.
