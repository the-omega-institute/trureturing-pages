# Open Math collaboration deck

`site/open-math.html` presents a discussion proposal for the SAIR Open Math
Model initiative. It contains ten main slides and two evidence appendices.
The Contribute page links to it. The proposal does not assert an existing
partnership or an agreed pilot.

The narrative covers participation, learning, checked mathematical artifacts,
reuse and a proposed four-week community/open-model pilot. Repository counts
are pinned to trureturing `5eb49eb`, rather than updated from a live endpoint.
The case study and dependency links pin published source `a450fbe4` and release
`f8a59e9e5c1ec71a983cd8844eaf6b9f0b55555ba3a49dc58550db6ab2446873`.

## Evidence represented in the graphics

The multiplication table is the `mulW` definition from
`D5/S0/Certificates/AraujoOrthodoxCompleteMappingRefutation.lean`.
[PR #9405](https://github.com/the-omega-institute/trureturing/pull/9405)
records its source correspondence, verification and admission under the
external open-problem-resolution exception. It is classified `bind-only`.

The cover and reuse slide show recorded **module imports**, not individual
theorem-use counts. The cover excerpt includes these relationships from the
published Atlas snapshot (arrows run from prerequisite to dependent):

- `D5/S0/Carrier/Conj` → `D5/S1/Deficit/DeficitInteger`
- `D5/S1/Digit/Addition` → `D5/S1/Deficit/DeficitInteger`
- `D5/S1/Scale/Embedding` → `D5/S1/Deficit/DeficitInteger`
- `D5/S1/Deficit/DeficitInteger` → `D5/S1/Deficit/DeficitThreeValued`
- `D5/S1/Deficit/DeficitThreeValued` → `D5/S1/Deficit/AlmostAdditivity`
- `D5/S1/Deficit/DeficitInteger` → `D5/S1/Deficit/Carry/GoldenCarryDeficitBridge`
- `D5/S1/Deficit/DeficitInteger` → `D5/S1/Deficit/FixedModulusNoncongruence`

Coordinates are editorial layout. The two outer unlabeled leaf nodes represent
the last two dependencies. The main reuse slide links all three displayed
modules to their immutable release pages. Contribution attribution comes from
source history and PR records, not graph centrality.

## Preview and export

Serve the static site with `python3 -m http.server 8876 --directory site`, then
open `http://localhost:8876/open-math.html`. Desktop defaults to a 1280×720
presentation. Small screens and browsers without JavaScript show a reading
layout. Explicit `?view=read` and `?view=present` choose a mode. Use `?lang=zh-CN`
for Chinese and `#s1` through `#s12` for direct slide links.

Arrow keys, Home/End and the chapter selector navigate. `N` toggles speaker
notes, `F` toggles fullscreen, and Print / PDF uses the browser print dialog.
Printing includes all twelve slides, one slide per landscape page. The notes,
site navigation and controls do not print. Reduced-motion preferences disable
the slide fade.

For reproducible screenshot and PDF generation using Python Playwright and
installed Chrome:

```sh
python tests/browser/open_math_deck.py --output /tmp/open-math-review
```

This starts its own local HTTP server and isolated headless browser. It checks
English and Chinese slide containment, keyboard and chapter navigation, notes,
reading-mode navigation, mobile width, no-JavaScript reading, and printing.
It writes screenshots and both PDF versions to the requested output directory.
No full site generation, Lean build or release changes are needed.
