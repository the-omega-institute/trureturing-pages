# Preserve the visualization, fix its readability

This correction supersedes the layout/theme direction introduced in #57.
The reference is the pre-#57 experience at `7be71c8ede250c3854e34b83124ebc3c2a30ab6e`.
It is applied on current `dev`, retaining the existing publication and claim gates.

## Fixed visual contract

- Evolution remains the original interactive canvas, with dependency/time modes,
  selection, zoom, playback and the release slider. `evolution-core.mjs`, its
  aggregation, metric definitions, coordinates and topic-family colors are unchanged.
- Research keeps the original light `research-editorial.css`, serif headings,
  news sections, publication cards and academic palette. No replacement dark theme.
- Conjectures retains the original page heading, statistics, source browser/sidebar
  and follow-up layout. Changes are confined to source grouping and lazy enhancement.
- Existing OEIS/Erdos/other-source grouping, pagination, direct dossier links,
  exact result scope and proof links remain. Completed dossiers stay accessible.
- The global Atlas is still the main knowledge visualization. Source websites and
  internal domains are not offered as interchangeable comparison objects.

## Small enhancements

`reading.css` contains disclosure/search styling only, inheriting the page's own
colors and typography. `common_shell` only removes an initial color transition,
loads those controls and normalizes navigation. It does not choose a theme.

Question filtering remains owned by the existing source browser. The disclosure
controller observes that browser's filtered rows to open the corresponding group
and apply the display batch limit. It does not reinterpret question status or
replace the existing source/triage/node filter semantics.

The original Evolution receives a compact size/color/line legend and a tooltip
with grouping meaning, dependency depth or observation, and two actual example
module titles. Single-module points use their mathematical titles. Gold rings
mark groups containing modules newly present in the selected comparable snapshot;
a baseline or analysis-profile change never invents additions. These are module
observations, not counts of newly proved theorems.

Publication status is an optional inline disclosure in Evolution, using the
existing validated status loader and counters. Stale, unavailable and differently
bound observations are labelled explicitly. The diagnostic route remains usable
for existing links, but is removed from primary navigation.

Spaces is retired as an independent UI. Existing `spaces.html` links lead to the
Atlas, preserving language and a selected node where supplied. Source-space and
comparison parameters are not silently reinterpreted as mathematical membership.
`evolution-structure.html` is a compatibility redirect to the restored Evolution,
retaining its query/hash. No new destination or publication workflow is introduced.

## Acceptance

1. Original Evolution canvas, slider, playback, dependency/time modes and selected
   lineage remain visible and work with the archived architecture input.
2. Research retains the exact original light background and serif heading in a
   real browser. Result collections are folded and independently pageable.
3. Conjectures preserves its original layout; its notebook is not fetched or
   prepended on initial arrival. Explicit notebook and old question URLs work.
4. Exact result/dossier links, source/proof markup and resolution metadata survive.
5. Annotation tests prove that graph identities, positions, colors, edges and
   source objects are unchanged. No additions are inferred for a baseline.
6. Primary navigation has the five original knowledge destinations. Optional
   operational diagnostics do not become a competing Evolution page.
7. Research, Conjectures and Evolution remain usable at a 390px viewport.

Tests: `python -m unittest discover -s tests -p 'test_reading_views.py' -v` and
`node --test tests/js/evolution-labels.test.mjs`. The existing reading-preview
workflow runs native HTTP/ESM Chromium checks using the actual public Library,
architecture history and their verified digest bindings. Its report and screenshots
are preview evidence, not a production deployment. Current-head results belong in
the PR record; old #57 results do not certify this correction.

No Base publishing, Truth identity, Scribe source, topology package pin, resolution
or Frozen gate is changed. The previously merged rebuild-current path is retained.
