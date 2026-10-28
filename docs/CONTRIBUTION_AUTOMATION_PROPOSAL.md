# Contributions and follow-up research

Implementation contract for the Conjectures / Research refactor. Agreed scope:
Conjectures ranks existing results from trureturing; outreach supplies public
papers **or** confirmed joint research. No new research tasks are initiated.

## The two pages

Conjectures leads with problems and contributions, followed by the existing open
questions and long-term pursuits. Readers can combine ranking dimensions, search,
filter the source collection and outcome, and inspect the original statement and
proof. A source assessment tells a connected story: why the question matters,
what we contributed, and what remains open. The exact theorem retains its scope.

Research is a publication list ordered by publication date. Papers and preprints
retain their distinct labels. The giant duplicate result catalogue and general
announcements are removed. Historical result links redirect to Conjectures;
publication anchors stay on Research.

Follow-ups use two sentences:

- “Further research on {topic} — see more details here: [arXiv / Paper].”
- “In collaboration with {name} from {institution} to further investigate [topic].”

A paper and an active collaboration can both appear. Neither is required for the
other. Links to problems are explicit stable dossier slugs; sharing a source
paper never establishes that a research project builds on a particular result.

## trureturing: assessments at the source commit

The optional `contribution_assessment` field in `Problems/<slug>.md` frontmatter
is carried into the release snapshot. Example **schema only**, not a real rating:

```yaml
contribution_assessment:
  schema_version: contribution-assessment.v1
  question_context: "Explain the question's place in the literature."
  contribution: "Explain the new idea and the exact advance."
  next_question: "State what remains unresolved."
  dimensions:
    concepts:
      level: 2
      rationale: "Explain which definition is new and how it is used."
      evidence: ["https://example.org/public-paper"]
    history:
      proposed_year: 1989
      resolved_year: 2026
      rationale: "The cited source poses this exact question in 1989."
      evidence: ["https://example.org/original-question"]
```

All dimensions except `history` have an integer level 0–4, a rationale and at
least one public HTTP(S) evidence URL. Unknown dimensions are omitted. A known
zero is different from missing evidence. History takes documented proposed and
resolved years; Pages computes its level. Do not use a paper's date unless it
actually establishes when this question was posed.

`contribution-ranking.v1` uses these weights and assessment anchors:

| Key | Weight | What the assessment should establish |
| --- | ---: | --- |
| `significance` | 20 | 0: narrow curiosity; 2: substantive field question; 4: central problem or a necessary foundation for a major program. Explain dependencies. |
| `concepts` | 20 | 0: no new concept; 2: useful new formulation or definition; 4: a new framework with demonstrated explanatory/research uses. Renaming is not a new concept. |
| `methods` | 15 | 0: direct existing technique; 2: a reusable proof technique; 4: a broadly reusable method with demonstrated applications. |
| `advance` | 10 | 0: negligible advance; 2: meaningful partial resolution or informative obstruction; 4: substantial progress on the stated program. A counterexample is assessed by what it teaches. |
| `standing` | 15 | The proposer's verified scholarly background, role, institution, field relevance and documented influence. 0: evidenced limited field footprint; 2: established relevant contributions; 4: foundational influence in the relevant area. Unknown biography is omitted; an institution label alone is insufficient. |
| `history` | 10 | 0–1 / 2–4 / 5–14 / 15–39 / 40+ years correspond to levels 0 / 1 / 2 / 3 / 4. Measured at resolution, so rankings do not drift daily. |
| `attention` | 10 | 0: evidenced isolated question; 2: independent attempts/partial results; 4: a sustained research program across groups. Cite actual attempts and literature, not guessed counts. |

Levels 1 and 3 are intermediate anchors requiring an explanation. Useful
conceptual and methodological contributions are prioritized, without automatically
rewarding the words “definition”, “proof” or “theorem”. These are editorial
importance assessments, not proof verification or objective measurements of worth.

For selected weights W, score = 100 × Σ(weight × level / 4) / Σ(weight).
Complete assessments rank first, partial assessments next, and unassessed records
last. Partial assessments sort by evidenced points with missing dimensions still
in the denominator; no overall number is displayed until the selected dimensions
are complete. Ties use case-folded title and stable ID. The client and build share
weights and are checked for parity across every nonempty dimension selection.

Each build writes `assets/contribution-index.json` with source commit, policy,
scores, coverage, reasons, citations and validation errors. Malformed editorial
metadata leaves that assessment pending; it does not quarantine a valid proof.
Outreach never contributes ranking points. No author-name guessing or automatic
prestige lookup is performed in the browser.

Upstream work still required: extend the existing result/dossier workflow to
produce these assessments automatically when a result is added or corrected,
validate evidence and exact scope, and backfill existing records. An LLM can
prepare sourced assessments; deterministic code computes the scores. Pages
already consumes the field, but current live snapshots do not contain it.

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
were imported. The upstream exporter/release and source assessment producer
remain separate handoffs; the Pages PR does not claim they are already live.
