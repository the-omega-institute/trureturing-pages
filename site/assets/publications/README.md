# Publication previews

Feed-only arXiv publications receive first-page images automatically during
Pages preparation through `python -m lib.publication_previews --site site`.
The source is the announced arXiv revision (prefer the evidence URL); the
first-page title must match the publication. Preparation pins the generated
JPEGs and `assets/publication-previews.json` alongside the public feed in one
artifact before fingerprinting build inputs. The offline renderer verifies
image digests and revision bindings before attaching them to their canonical
paper identities. Browser acceptance also includes feed-only publications and
checks that their actual images load. Existing reviewed editorial previews
remain in this directory. New screenshots do not require manual catalog rows.

`eqt2.jpg` and `routing.jpg` are reduced, unaltered first-page renders of the
authors' arXiv PDFs, retrieved on 2026-09-07:

- https://arxiv.org/pdf/2609.00706
- https://arxiv.org/pdf/2607.04534

`klein-four-ca.jpg` and `eof-coincidence.jpg` are the same kind of render,
retrieved on 2026-10-16:

- https://arxiv.org/pdf/2610.20329 (v1)
- https://arxiv.org/pdf/2610.18816 (v2, posted 2026-10-15)

`subquorum.jpg` and `padovan.jpg` were retrieved and rendered on 2026-10-16:

- https://arxiv.org/pdf/2609.25128v4 (updated 2026-10-10)
- https://arxiv.org/pdf/2609.33421v1 (submitted 2026-09-27)

Four more unaltered first-page previews were retrieved and rendered on 2026-10-30:

- `insertion-degree-descent.jpg`: https://arxiv.org/pdf/2610.39941v1
  (submitted 2026-10-29)
- `residue-sums.jpg`: https://arxiv.org/pdf/2610.29608v1
  (submitted 2026-10-21)
- `petersen-zero-forcing.jpg`: https://arxiv.org/pdf/2610.24059v1
  (submitted 2026-10-16)
- `generalized-fidelity.jpg`: https://arxiv.org/pdf/2609.09753v3
  (first submitted 2026-09-09; v3 updated 2026-10-20)

`singhvi.jpg` is an unaltered first-page render retrieved on 2026-11-04 from
https://arxiv.org/pdf/2611.01064v1 (submitted 2026-10-31). Its title and author
order were checked against the PDF. It was rendered at 960 pixels on the long
edge using `pdftoppm -f 1 -singlefile -scale-to 960 -jpeg -jpegopt quality=90,optimize=y`.

Two newer arXiv first-page previews were retrieved and rendered on 2026-11-04
with the same 960-pixel command:

- `two-qutrit-time-invariant-negativity.jpg`:
  https://arxiv.org/pdf/2611.04568v1 (submitted 2026-11-03). The first page
  identifies the title, Wenlin Zhang, Mazhar Ali and Haobo Ma, and version v1.
- `cotfas-gaussian-discrete-approximation.jpg`:
  https://arxiv.org/pdf/2610.05623v2 (posted 2026-11-03). The first page
  identifies the revised title, Nicolae Cotfas, Haobo Ma and Wenlin Zhang, and
  version v2.

Titles, author order, dates and result scope were checked against the public
arXiv records and these PDFs. The fidelity card retains its first submission
date and identifies the October revision separately.

Two further first-page previews were rendered on 2026-11-04 from locally
archived PDFs, with the same 960-pixel command:

- `cross-engine-admission.jpg`: the authors' camera-ready manuscript,
  `fkst-system-paper/output/pdf/mathai-camera-ready-2026-10-03.pdf` in the local
  research workspace. Its first-page title matches the official acceptance
  list, and its author order matches the existing publication catalog. The
  public paper is https://openreview.net/forum?id=xOAZvprLXO. The PDF came from
  the authors' archive; it was not retrieved from OpenReview during this review.
- `zeckendorf.jpg`: the published RAIRO article archived as
  `Documents/Codex/2026-08-17/jia/work/paper/ita20260032.pdf` in the local
  archive. Its first page carries the exact catalog title, authors, volume 60,
  article 29, DOI https://doi.org/10.1051/ita/2026032, and the publisher's
  Creative Commons Attribution notice. The public PDF source is
  https://www.rairo-ita.org/articles/ita/pdf/2026/01/ita20260032.pdf.

The MATH-AI title and acceptance are listed at
https://mathai-2026.github.io/papers; the event page confirms 12 December 2026
in Atlanta. The institute's announcement records the authors, poster format
and announcement month. No abstract or acceptance claim was inferred from
the local preview.

The research-news catch-up was compared with the organization profile at
[`the-omega-institute/.github@f98733b9`](https://github.com/the-omega-institute/.github/blob/f98733b9eb0f4423d668128a651ac0389bf3d485/profile/README.md#research-news).
Its nine news entries are represented by eight publication/poster records and
one activity record. Publication scope and dates follow the primary records;
the profile's October 3 project statistics are not publication metadata.

Generated using Poppler `pdftoppm -f 1 -singlefile -scale-to 680 -jpeg`.
The previews link to the original articles and are attributed beside each image.
The journal's published title and DOI are also verified against
https://api.crossref.org/works/10.1051/ita/2026032.
