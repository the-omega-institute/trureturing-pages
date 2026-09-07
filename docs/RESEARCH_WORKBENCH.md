# Research conjecture workbench

The Research index has a Pages-owned advisory bank above the release-bound
source dossiers. Revision `2026-09-07.2` contains **13 source questions and 28
proposed subproblems**. It preserves all 21 IDs from the first revision. No Lean
statements, proof states, release observations or certified graph edges change.

## Content and provenance

Edit `site/assets/research-catalog.json`. The seven original dossier families
retain upstream commit `89231f9140ce2138a4e74d4d03421c724149ac24`. Six new arXiv
families use per-family `source_commit` at
`05c05729c5cb073dbeb215d8148813db4470952d`. Their repository anchors were read at
that commit. Presence of a source file is not a kernel/release certification.
Existing and in-flight work must be checked before starting any proposed target.

Every entry gives a question, repository foothold, gap to recheck, next step and
progress criterion. Child targets distinguish bridges, certificates, route tests
and research questions. Related links are suggestions, not dependency edges.
The finite-UNSAT target retains the correct implication: a sound finite sample
obstruction suffices for a state lower bound; a SAT candidate needs all-input
correctness.

A new arXiv family has `source` metadata: `arxiv_id`, exact `version`, title,
`submitted`, `revised`, `checked`, `locator`, `status`, and a scope note. Its DOI
must match the arXiv ID. Its source link points to that version on arXiv, never to
an invented `Problems/<slug>.md`. Existing dossier links remain unchanged.
Optional `updates` attach subsequent results without changing the parent status.
Children display this information as a **family source**, not as a claim that the
paper explicitly conjectures every proposed child target.

Source labels distinguish an open question in the checked text, a conjectural
limit with a conditional implication, a reported result, a route obstruction and
context. Only the first two can be a primary open-question source. Reported
proofs have not been independently verified here. A source reading is not an
exhaustive proof of continued openness. Unannotated legacy dossiers remain not
rechecked. The original release dossier and its historical status are untouched.

## arXiv review, 7 September 2026

| Checked version | Submitted / revised | Location and use |
|---|---|---|
| [Zeta Spectral Triples, 2511.22755v1](https://arxiv.org/abs/2511.22755v1) | 2025-11-27 / same | Sections 7-8: genuine lowest-mode comparison, distinct from the explicit model limit. |
| [Suzuki, 2606.09096v1](https://arxiv.org/abs/2606.09096v1) | 2026-06-08 / same | Corollary 1.6, equation (1.12), and Section 7: boundary-characteristic limit. The limit is conjectural; the Section 7 heuristic assumes RH. |
| [Randomstrasse101, 2603.29571v1](https://arxiv.org/abs/2603.29571v1) | 2026-03-31 / same | Conjectures 18, 19(a,b), 20 and 24: circulant theta, complex phase-retrieval probability, universal real stability and SIC existence. |
| [Shmalo, 2607.06249v1](https://arxiv.org/abs/2607.06249v1) | 2026-07-07 / same | Gaussian least-singular-value asymptotics; a reported answer to the Gaussian case, not the universal deterministic conjecture. |
| [Sarkar, 2606.13903v1](https://arxiv.org/abs/2606.13903v1) | 2026-06-11 / same | Sections 8-10, Corollaries 9.1-9.2: obstruction for the two specified vector-coordinate degree-four SoS encodings; projector bound has a different scope. |
| [Shallit and Vukusic, 2509.16150v2](https://arxiv.org/abs/2509.16150v2) | 2025-09-19 / 2026-03-11 | Section 2, Lemmas 2-3 and Theorem 5: the solved Kimberling problem provides a conversion test, not a new trident proof. |

The six new families add twelve subproblems. The MUB and negative-base-phi
families receive one further target each, giving twenty new entries overall.
The review used submission histories and relevant full-text HTML sections, not
HTML generation dates. In particular, the Randomstrasse manuscript was submitted
in March; an August HTML generation timestamp is not a later arXiv version.
This is a selected, repository-connected literature pass, not a complete search
of arXiv or all current development PRs.

The new repository connections use five inspected sources:

- `D5/S3/Weil/ZetaBridge/FixedScaleWeilQuadraticForm`: finite-scale multiplier;
  convergence/ZeroData premises remain explicit.
- `D5/S3/Weil/FiniteResolventClarkIdentity`: supplied atomic-spectrum transport;
  the actual boundary-operator identification remains a separate task.
- `D5/S3/Quantum/Tomography/RankOneContextCommutator`: rank-one predicates and
  overlaps; arbitrary frame recovery is not already supplied by a context.
- `D5/S3/Quantum/Algebra/WeylDisplacementTrace`: trace orthogonality, not an
  already constructed SIC fiducial.
- `D5/S3/Fourier/FinitePoisson`: cyclic characters, not a theta-SDP solver or
  probabilistic bound.

Additions retain the important quantifier distinctions. A Gaussian asymptotic
cannot close a universal full-spark claim. A projector bound `m <= d+1` does not
exclude four bases in dimension six. The MUB and SIC versions of Zauner's
conjecture are distinct. Suzuki's meromorphic quotient and compact-limit wording
must be interpreted precisely before formalizing the proposed limit.

## Browsing and personal progress

Search includes questions, next steps, DOI, anchors, bilingual keywords and source
metadata. Field, type, horizon, literature, personal-stage and shortlist filters
compose. Literature filters select new arXiv families, related updates, or entries
not rechecked this round. Latest-paper sorting uses the largest recorded paper
revision date; it never sorts by review date or page-generation time.

Shared links use `#rp=<id>`. Filters use `rq`, `ra`, `rk`, `rh`, `rs`, `rl`, `ro`
and `rw`. Existing `#node=<gid>` entrypoints still filter source anchors. A direct
question link clears hiding filters. Advanced filters fold on narrow screens.

The notebook keeps `trureturing.pages.research-notes.v1` in localStorage.
Stages remain Not started, Reading, Working, Blocked and Ready for review.
No local action promotes a proof. These records do not synchronize across people
or devices. JSON export/import uses `pages-research-notes.v1`; import validates the
whole file before replacing matching entries, rejects files above 1 MB, preserves
unaffected entries and reports unknown IDs. A different catalog revision requests
source reassessment. All first-round notebook IDs remain valid.

Saving merges edited fields with the latest stored notebook. On browsers with
Web Locks, read/merge/write operations serialize across tabs so an older tab
cannot erase another tab's unrelated notes or progress. Export waits for pending
saves and includes the latest stored entries. The fallback merges immediately
when Web Locks are unavailable; cross-tab atomicity then depends on the browser.

The GitHub link opens a prefilled issue form with public catalog text only. It
neither submits the issue nor transmits personal notes.

## Integration, validation and failure behavior

The existing bootstrap and byte-preserved release handlers are unchanged. The
workbench loads only on `.research-home`. Catalog failure leaves the original
server-rendered list available. All metadata and notes use DOM text APIs, never
HTML interpolation. No additional runtime dependency, release parser, archive
schema, publication workflow or upstream frontmatter migration is introduced.

Validation rejects invalid IDs, unsafe anchors, dangling related targets,
nonexistent calendar dates, reversed source chronology, malformed arXiv versions,
DOI mismatches and solved-result sources masquerading as open parent questions.

```sh
node --test tests/research-workbench.test.mjs
python tests/research_workbench_browser.py --chromium /usr/bin/chromium
ATLAS_ORIGIN=http://127.0.0.1:8767 node tests/browser/research-workbench.cjs
```

The 23 Node tests cover those contracts, all original behavior, source filters
and ordering, link destinations and preservation of first-round notebook IDs.
The Chromium suite uses an offline DOM fixture with fetch/storage doubles and
adapted asset loading. It exercises the actual DOM/filter/notebook code and CSS,
source labels/URLs, imports/exports, old-note restoration, hash navigation, mobile
overflow and catalog/storage failure paths. `--screenshots <directory>` saves
fixture captures. It does not exercise native localStorage persistence, network
module loading, the release graph or the full deployed site.

A local-HTTP smoke attempt in the authoring environment was blocked by Chromium
administration policy before loading the page. The offline suite passed; that
result is not substituted for production or native-storage verification. No
full-site CI, Lean compilation, independent proof review or deployment is claimed.

The integration review adds the Node contracts to CI and a native Chrome suite
against a local HTTP preview with the verified release. It covers actual module
loading, native localStorage, reload, two-tab saves and field preservation,
import/export, literature filters, question links, original dossier access,
centered headers at 1512/390/320 pixels, and the catalog failure fallback.
