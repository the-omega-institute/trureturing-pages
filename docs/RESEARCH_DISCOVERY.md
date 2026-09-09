# Research Discovery

The Pages build emits a public, read-only discovery API and crawlable OEIS pages.
`lib/discovery.py` runs from `render_research` for every published source snapshot.
It combines reviewed result stories, publications, conjectures, proposed targets,
released module records, source dossiers and `site/assets/discovery-curation.json`.

## Clients

Start with `/api/v1/manifest.json`. Fetch its `index_url`, verify `index_sha256`
against the response bytes, then search titles, aliases, identifiers and summaries
locally. Search parameters are not processed by GitHub Pages. Exact identifiers
use `/api/v1/oeis/A010060.json`; unknown identifiers return 404, not an "unsolved"
assessment. Responses include neighboring records and typed, sourced relations.
Other records use `/api/v1/records/{sha256(UTF8(id))}.json`. Compare the response's
`index_sha256` with the downloaded index before joining records across requests.
Retry if a deployment changed between requests. OpenAPI is at `/api/openapi.json`.

```js
const base = 'https://the-omega-institute.github.io/trureturing-pages/';
const response = await fetch(base + 'api/v1/oeis/A010060.json');
if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);
const {record, relations, neighbors} = await response.json();
// Inspect relations[].kind and scope before interpreting a neighboring proof.
console.log(record.identifiers.oeis, relations, neighbors);
```

The browser uses the same data at `/discover.html?q=A010060`. Concept aliases
include Chinese queries while authored English display text remains unchanged.
Static `/oeis/Axxxxxx/` pages, `/sitemap.xml` and `/llms.txt` expose the records to
crawlers. Publishing these resources does not guarantee external search indexing.

## Evidence

OEIS links are explicitly curated, never guessed from matching integer prefixes.
A010060 is the underlying Thue-Morse word, not its reduced abelian complexity
sequence. Its identity was checked against the OEIS entry on 2026-09-09.
A026471 and A026475 are identified as S_(1,2,3) and S_(1,3,4) in the greedy
3-sumfree section of Fokkink et al., JIS 28 (2025), Article 25.3.8. Both have d=1
and lie outside our Conjecture 17 theorem's d>=2 domain. They are paper-context
associations, not new resolved OEIS claims.

Result records retain proved/refuted status, exact theorem identity, source commit,
scope and Lean file digest. Relations never propagate that status. Topic membership
is curated; follow-ups are proposals; dossier anchors are source-authored motivation
links, not extracted declaration-use dependencies. Released-module membership is
separate from proof validation. The first version does not infer new equivalences,
mathematical stability, novelty or exhaustive literature coverage.

Curated relation types and sources are the extension point for future upstream
declaration-level evidence. Such evidence should come from Truth and Topology;
Pages must not manufacture theorem-use counts from editorial relations.

## Validation

Run `python -m unittest tests.test_discovery`,
`node --test tests/js/discovery.test.mjs`, and
`node tests/browser/discovery.cjs` against the local generated preview.
