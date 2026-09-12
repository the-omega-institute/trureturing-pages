# Reading experience and same-release presentation refresh

This change addresses user-visible problems after #54/#55: mixed light/dark Conjectures,
late content insertion and legacy question redirects, a flat Research results list,
an undiscoverable Spaces entry, and an Evolution surface that foregrounds repository
groups instead of understandable changes.

## Existing behavior inspected

At Pages dev `f0434f1ca3fca17f526dbbd33a257e6c3a40c858`, the inspected
`pages.yml` run 34709032689 completed prepare and skipped deploy. A merged renderer
change did not by itself imply new served content. During this implementation #56
merged at `7be71c8ede250c3854e34b83124ebc3c2a30ab6e`, adding the existing pipeline's
explicit `rebuild_current` path. This change consumes it directly. The preliminary
separate checkpoint-refresh design was discarded before delivery.

`living-library.js` mounted the workbench and Millennium entry asynchronously into the
Conjectures first viewport, with component styles inserted after initial parsing.
`research-editorial.css` used light colors and transitions while Atlas is dark.
`research-news.mjs` redirected old question hashes after module loading. These are
source-level causes of inconsistency and potential visible page shifts.

## Reader changes

Research and Conjectures use a synchronous shared dark reading stylesheet. Their
first-view content is generated before publication. Collections use native collapsed
`details`; JavaScript is not required to open and read them. OEIS and Erdős membership
comes from the recorded original source hostname, never keywords in titles. Other
sources retain their records. Empty categories report zero, without invented results.

Research preserves each original result card, exact-scope block and evidence URL.
Search opens matching collections; clearing restores their preceding open state.
Existing result hashes open their containing details before scrolling. Publications
remain separate. Spaces appears in navigation and an explicit Research callout.

Conjectures shows unresolved dossiers with direct per-question destinations. Its
long-horizon links come from the existing Millennium catalog at build time. The
workbench remains in an explicit lazy section with its original storage/catalog
behavior. Legacy question hashes are corrected before navigation or redirected by
a parser-blocking head script on Research. Result and external links stay unchanged.

Evolution defaults to an explanation-led reader of verified Library snapshots. It
compares a selected release to its predecessor, distinguishing added modules, changed
records, absent modules and question outcomes. One snapshot is a baseline, not growth.
Source, explanation and recorded state changes are described separately. Module
counts never become theorem counts. Authored titles and summaries precede technical
source groups such as `Tower`. The original map remains `evolution-structure.html`;
its source blob is retained. No proof status or structural metric is rewritten.

## Reuse the current publication owner

`refresh-presentation.yml` is only a bounded scheduling adapter, matching the existing
reconciliation scheduler pattern. A merge affecting site/lib presentation on dev
requests `pages.yml` on dev with `rebuild_current=true`. No second renderer deployment
transaction, cache recovery, Truth parser or new release identity is introduced.
PRs do not trigger this publication adapter. The existing pipeline retains its
verification, concurrency, archive/receipt preservation and freshness checks.
Scheduling success is explicitly distinguished from deployment success.

Base admission, producer workflows and package pins are unchanged. Review the actual
`pages.yml` run for the deployment result. The command documented by #56 remains a
manual recovery option; it is not required after every future presentation merge.

## Acceptance

1. Research has independently collapsible OEIS, Erdős and other-source groups, preserving
   recorded result scope and proof links.
2. Conjectures headings, collection rows and map links exist before JavaScript. Notebook
   enhancement starts on explicit opening or a notebook permalink.
3. Questions open their dossiers. Legacy Research question hashes resolve to Conjectures;
   completed-result and external links retain their destinations.
4. Spaces is visible in navigation and Research, with its data generated from the same
   verified Library input.
5. Evolution shows concrete named changes, baseline and empty states, with the expert
   dependency map preserved separately.
6. Merged presentation code schedules the existing rebuild-current pipeline, without
   creating a new truth observation or bypassing its release gate.

## Validation

```
python -m unittest discover -s tests -p 'test_reading_views.py' -v
node --test tests/js/reading.test.mjs
python -m compileall -q lib tests
```

Initial local execution passed 12 Python tests, including the wrapper for 11 Node
tests. These are unit/contract tests; the Node wrapper is not a second independent
suite. Full existing CI and browser findings are recorded in the PR after observation.
Local HTTP browser navigation was blocked by runtime policy and was not bypassed.
No live deployment or full browser acceptance is claimed by unit results alone.
The old evidence/claim gates and Base release path remain unchanged.

## PR review follow-through

Large collections progressively reveal 12 records at a time after enhancement;
without JavaScript every source result remains readable. Search retains the bounded
view and old result hashes reveal their containing rows even beyond the first batch.
Saved `#next-questions` links open the notebook, which now mounts directly in its
slot. Completed source metadata remains available to the notebook's existing gate.

The shared reading shell also covers Millennium maps, Discovery and generated OEIS/API
source pages. Existing source/candidate/open colors remain distinct in the maps.
Historical Evolution outcome links pin the dossier to the selected source commit;
they cannot silently navigate to a newer question record. Failed release selection
clears prior evidence and results. Release selectors include a short digest.

Validation adds historical-link and legacy-route unit tests, and native browser
scenarios for large collections, saved notebook links and the connected reading pages.
