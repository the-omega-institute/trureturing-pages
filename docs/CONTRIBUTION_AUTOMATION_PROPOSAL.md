# Contributions and follow-up research

Conjectures opens directly on an automatically ordered list of contributions.
Pages owns both the ranking policy and its implementation. trureturing keeps its
existing dossiers, proof descriptions, release artifacts and release notification.
There are no new required upstream fields and no new mathematical research tasks.

## The pages

The first view has a title, a small search field and the ordered results. There
are no reader-selected ranking dimensions, source categories, outcome dropdowns
or visible point totals. OEIS and paper-derived results share one list. Original
source links and exact mathematical statements remain in the expanded evidence.
Existing open questions and future pursuits are available in a secondary disclosure.

Research lists public papers and preprints by date. Outreach supplies either a
public paper or mutually confirmed active joint research. The follow-up copy is:

- “Further research on {topic} — see more details here: [arXiv / Paper].”
- “In collaboration with {name} from {institution} to further investigate [topic].”

Either qualifies independently; both may appear. Associations use exact problem
IDs, not guessed links between papers mentioning similar topics.

## Automatic ranking in Pages

`lib/contributions.py` derives an assessment from content already present in the
release: `Problem`, `Motivation`, `Route`, `Triage`, bibliographic metadata, the
bound proof's human-readable abstract and dependencies between released results.
Every result gets a numeric score on every build, including new arrivals. No
assessment form or new `contribution_assessment` field is requested upstream.

`contribution-ranking.v2` uses these dimensions and maximum weights:

| Dimension | Weight | Existing evidence used |
| --- | ---: | --- |
| Problem significance | 20 | The dossier's existing Tier 1/2/3 classification, a documented connection to a broader question, or use by another released result. |
| Conceptual contribution | 20 | A structural formulation/correspondence in the delivered argument; stronger credit for an explicitly introduced concept. A source definition alone is insufficient. |
| Proof methods | 15 | Existing `proof_shape: content` records and a described mathematical mechanism, such as an injection, induction, spectral estimate or isoperimetric argument. |
| Mathematical advance | 10 | The actual proved/refuted scope. A general proof or parameterized obstruction gains more credit than one certificate; an explicitly unresolved stronger claim limits the credit. |
| Scholarly context | 15 | Documented proposer background in Pages' cited reference file, matched only to the primary attribution. Incidental names in proof routes and secondary literature cannot transfer reputation. |
| Historical context | 10 | A dated conjecture line, otherwise the source bibliography/arXiv date. An OEIS AUTHOR date is never substituted for a later conjecture date. |
| Prior research | 10 | Earlier mathematical results or partial cases described in the motivation. Literature-search volume, failed searches and unverified coverage do not earn credit. |

Each dimension has a capped level from 0 to 4. Signals are conservative reading
rules, not an independent semantic review or novelty certification. Repeating
text, adding helper declarations or using a particular source collection cannot
inflate a dimension. Proposed, negated and explicitly unformalized statements
are excluded from contribution signals. Missing evidence adds no bonus; it does
not block scoring or remove the result from the list.

Let C be the weighted contribution points (`concepts + methods + advance`, maximum
45), and I the weighted context points (the remaining dimensions, maximum 55).
The overall score is:

```
C + I × (0.35 + 0.65 × C / 45)
```

This couples the importance of a question to the actual contribution. An old
source or famous proposer cannot, by itself, make a small witness outrank a
substantial conceptual/methodological advance. Ties use conceptual contribution,
then methods, then title and stable ID. The website displays this reading order;
points are stored for audit rather than presented as a measure of mathematical worth.

Historical levels use 0–1 / 2–4 / 5–14 / 15–39 / 40+ years relative to the fixed
2026 policy baseline. They indicate documented historical context, not the number
of years people unsuccessfully worked on a problem. Fixing the baseline avoids
rankings drifting with the build clock. Profiles in `site/assets/scholarly-context.json`
include public references; unknown identities receive no invented affiliation or
reputation. The initial reference set is limited and can be expanded in Pages.

Every build writes `assets/contribution-index.json` with the policy, source
commit, per-result input digest, score, dimension reasons, source excerpts and
citations. These estimates can be inspected under “Why this order” in each result.
The original verified statement and proof remain the authority for mathematical
claims. Existing human abstracts and dossier prose supply the short explanation.

The current release's 1,419 results are evaluated directly from their existing
content. The existing `truth-release-published` notification triggers the normal
Pages build, which recomputes and stores the order. Outreach updates do not add
ranking points. No extra trureturing issue, schema, export or release is required.

## outreach: one small public feed

Outreach publishes a complete replacement JSON document with the following
shape. **All example data below is fictional.**

```json
{
  "schema_version": "research-updates.v1",
  "updated_at": "2026-10-28T00:00:00Z",
  "publications": [{
    "id": "example-paper",
    "problem_ids": ["example-problem"],
    "topic": "a generalization of the original problem",
    "title": "Example paper title",
    "authors": "A. Researcher, B. Researcher",
    "date": "2026-10-01",
    "url": "https://arxiv.org/abs/2609.12345",
    "venue": "arXiv",
    "status": "preprint",
    "summary": "State the actual contribution and any remaining boundary.",
    "evidence_url": "https://arxiv.org/abs/2609.12345"
  }],
  "collaborations": [{
    "id": "example-project",
    "problem_ids": ["example-problem"],
    "topic": "the next specific research question",
    "status": "confirmed_active",
    "people": [{"name": "A. Researcher", "institution": "Example Institute"}],
    "evidence_url": "https://example.org/public-project"
  }]
}
```

Publication status is `preprint` or `published`; a draft, submission or acceptance
without a publicly accessible paper does not qualify. A paper without a matching
conjecture may have an empty `problem_ids` list and still appear on Research.
Collaboration requires mutually confirmed, current work on a specific project,
a publishable collaborator name/affiliation and public evidence. Interest, praise,
contact, an invitation and conditional coauthorship are insufficient.

The private tracker is not the feed. Export a dedicated public projection;
never publish correspondence, email identifiers, private paths or mail excerpts.
The consumer rejects fields outside this small schema. Public evidence and the
right to disclose the collaboration must be checked upstream before export.
The existing `relations.json` “active” classifier is not sufficient by itself.

The feed is authoritative for its additions: omit ended collaborations and remove
withdrawn feed-only papers. Existing editorial publications remain the bootstrap
archive; withdrawing one of those also requires updating that original record.
Canonical arXiv/version/DOI aliases deduplicate; existing paper anchors, images and
scope qualifications are retained. No heuristic credit matching is performed.
The effective paper list is written to `assets/publication-index.json`.

## Transport and refresh

Publish the sanitized `research-updates.v1.json` asset to public Pages repository
release tag `research-updates`, then send repository dispatch type
`research-updates` to Pages. An appropriately scoped upstream installation token
is required to upload/replace the public asset and dispatch; no private-repository
credential is added to the public site. The release asset is public, so export
must occur only after the upstream publication checks.

Pages also requests a refresh every six hours. Before fingerprinting inputs, the
existing Pages workflow downloads and validates the feed. Preparation uploads
that exact validated file as a workflow artifact; deployment uses the same bytes
rather than fetching a mutable asset again. Feed changes therefore invalidate
generated-page caches even if the Truth release is unchanged. A missing release
uses the checked-in public bootstrap; other download/validation failures stop
the build and leave the existing deployed site intact.

Two already-listed public papers (Padovan and sub-quorum colorings) seed the
bootstrap follow-ups. No private tracker data or inferred active collaborations
were imported. The outreach exporter/release remains an upstream handoff. trureturing already
provides the content and release notification consumed by Pages; it needs no changes.
