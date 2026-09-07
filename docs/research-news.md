# Research news and conjectures

Research is generated as readable HTML by `lib/research_news.py`, called from
the existing release-bound Library build. Its editorial source is
`site/assets/research-news.json`. The Atlas frontier reads the same catalog
only when opened; news does not alter certified graph nodes or edges.

## Independent consumers

Upstream supplies Pages and mdBook independently. Pages consumes upstream
release/source data directly; it does not fetch mdBook HTML or a mdBook registry
to discover, validate or publish results. mdBook is optional further reading.
Primary proof explanations link directly to pinned upstream Blueprint sources.

Reviewed results can be published immediately through the manually maintained
`site/assets/research-news.json`, including before any upstream problem binding,
new Truth release, or mdBook publication. Each manual entry must carry its exact
external scope and pinned proof evidence. Research, Conjectures and the Atlas
results list use that same catalog. Later release records merge by declaration
identity without duplicating the result; release membership remains separate.

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
not replace upstream typed `OpenProblemResolutionClaim` validation.

The structured interface improvement is submitted as
[trureturing PR #6221](https://github.com/the-omega-institute/trureturing/pull/6221).
It adds `nodes[].open_problem_resolution.declaration_gid` to the existing
`scribe-describe-report-v2` JSON and its corresponding text record. A Describe
node ID names an editorial block and must not be used to infer a Lean theorem
selector. The new field carries the exact declaration selected by the typed
statement, consistent with the existing Markdown marker.

This PR is submitted for upstream review, not merged or consumed by Pages yet.
The current release importer below remains in use. A future structured-report
importer must check report status and findings and tie the report, dossiers,
declaration and Frozen evidence to the same captured source commit. It must
also retain the external statement and exact proved/refuted scope: report
validation alone cannot establish that a Lean statement answers that question.
Neither importer makes mdBook a synchronization dependency.

`lib/problem_resolutions.py` also imports emitted
`scribe-open-problem-resolution-v1` Markdown comments from Blueprint files at
the release's pinned source commit. Bindings must name an existing problem,
the containing module's declaration, a proved/refuted kind and an existing
Frozen module record. Code examples are ignored; malformed, duplicate or
dangling records fail the build. These are structural checks, not a replay of
typed-claim validation or Lean. Generated results explicitly say **source
record** and have no invented proof PR or merge date.

The release snapshot retains each binding as optional `problem.resolution`.
Older snapshots without bindings remain unchanged. News joins editorial and
source records by exact declaration; conflicting kinds fail the build. New
source records appear in Research and Conjectures automatically. Atlas removes
them from the open frontier and retains them under recent results. Matching
question-bank families leave the active direction overview, while all notebook
IDs, saved notes and links remain available. Child targets require reassessment;
the parent result does not establish their completion. Library history records
binding additions, changes and removals even if the dossier text is unchanged.

The two source-checked results awaiting upstream registration for automatic
Pages synchronization are tracked in
[trureturing #6179](https://github.com/the-omega-institute/trureturing/issues/6179).
The mdBook tracking issue #4 is withdrawn: mdBook publication is independent
and is not a prerequisite for Pages.
An absent resolution binding means unregistered evidence, not a mathematical
claim that the question remains unsolved. Pages does not write to either source
repository. A future release must include those registrations before its
source-bound states appear. The reviewed manual results are already displayed.

Before requesting any solved-problem registration, compare the exact external
statement with the formal definitions, assumptions and conclusion. A Frozen
lemma alone does not establish that the external question was resolved.
Keep working audit notes local; publish the result's exact scope and primary
paper, Lean declaration and proof links in the editorial catalog.

The mdBook links follow development; pinned Blueprint, Lean and Frozen sources
remain available through the proof record. News updates can be deployed against
the current Truth release without manufacturing a new release observation.

## Routes

- `research.html`: publications and resolutions, readable without JavaScript.
- `conjectures.html`: field-first question bank, local notebook and resolved
  questions with links to exact scope and mdBook explanations.
- `research/<slug>/`: existing immutable-source problem dossier routes.
- Old `research.html#rp=...` and filter hashes redirect to Conjectures. Stable
  question IDs and the `trureturing.pages.research-notes.v1` storage key are kept.
- `atlas.html#mode=frontier`: released research foundations plus separate
  recent-resolution links, explicitly labeled with their release status.

Verify with `python -m unittest tests.test_research_news` and the browser suites
`research-news.cjs`, `research-workbench.cjs`, `atlas-research.cjs`,
`living-library.cjs`, and `header-alignment.cjs` against a prepared preview.
