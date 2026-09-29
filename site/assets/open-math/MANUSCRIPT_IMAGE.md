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

The link currently uses the published GitHub manuscript. Replace it with the
arXiv URL when the author supplies it, and refresh the screenshot if the public
paper changes.
