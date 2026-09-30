# Cloitre manuscript screenshot

`cloitre-manuscript-page-1.png` is an unretouched crop of the first page of
*A Padovan-automatic description of a nested recurrence*, by Benoit Cloitre,
Haobo Ma and Wenlin Zhang. It contains the original title, author block, date
and complete abstract. Text inside the image remains in the source language.

Source: https://github.com/the-omega-institute/a076502-padovan/blob/v1.0.1/manuscript/output/pdf/paper.pdf

Source PDF SHA-256:
`917d68d62b355e7708efe93ab98b951de89a1f68a8fe10d3f143ba0a974b8cc1`

Render page 1 with Poppler at a maximum dimension of 2000 pixels:

```sh
pdftoppm -f 1 -singlefile -scale-to 2000 -png paper.pdf page-1
```

The output is 1415 × 2000 pixels. Crop with Pillow using the box
`(190, 255, 1225, 1135)` to produce the 1035 × 880 pixel PNG. Preserve the
pixels and original proportions; do not reconstruct the paper in HTML.

The image links to this versioned GitHub manuscript. As of October 1, 2026,
the adjacent paper text links to the public arXiv abstract at https://arxiv.org/abs/2609.33421.
The caption labels the pixels as an archived manuscript excerpt; they have not
been replaced with an arXiv rendering.

## Sahbi arXiv v3 screenshot

`sahbi-arxiv-page-1.png` is an unretouched first-page crop from
https://arxiv.org/pdf/2609.25128v3 . It retains the original title, all three
authors, affiliations and complete abstract. Render page 1 with
`pdftoppm -f 1 -singlefile -scale-to 1800 -png paper.pdf page-1`, then crop the
1273 × 1800 PNG at `(140, 225, 1140, 1145)` to produce 1000 × 920 pixels.

Source PDF SHA-256: `0d4f4956f381d9846802d6fb0fd25ddb6ad36626a5807bb3f76674dc142939c2`.
The image links to the exact v3 PDF; adjacent text links to its abstract page.
