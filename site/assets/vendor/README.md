# Atlas runtime dependencies

Pinned browser distributions are checked in so the public Atlas does not require
a runtime CDN connection or a frontend build step.

| File | Upstream | Version | License |
| --- | --- | --- | --- |
| `3d-force-graph.min.js` | `https://unpkg.com/3d-force-graph@1.79.0/dist/3d-force-graph.min.js` | 1.79.0 | MIT |
| `d3-force-3d.mjs` | `https://esm.sh/d3-force-3d@3.0.6/es2022/d3-force-3d.bundle.mjs` | 3.0.6 | MIT |
| `lucide.min.js` | `https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js` | 0.468.0 | ISC |
| `dagre.min.js` | `https://unpkg.com/@dagrejs/dagre@1.1.5/dist/dagre.min.js` | 1.1.5 | MIT |
| `d3.min.js` | `https://unpkg.com/d3@7.9.0/dist/d3.min.js` | 7.9.0 | ISC |
| `katex/` | `https://www.npmjs.com/package/katex` | 0.16.22 | MIT |
| `three-atlas.mjs` | `https://www.npmjs.com/package/three` | 0.184.0 | MIT |

The force graph distribution includes Three.js and its renderer dependencies.
The standalone D3 bundle includes binarytree, octree, quadtree, dispatch, and
timer modules. License notices are stored alongside the distributions.
Dagre arranges proof-only diagrams; D3 supplies mixed-relation force layouts and
SVG pan/zoom for the Atlas sidebar and generated Wiki pages.

`three-atlas.mjs` is a tree-shaken module for semantic overlay geometry, built
from `tools/three-atlas-entry.mjs` with Three.js 0.184.0 and esbuild 0.25.5.
It uses the existing force-graph renderer; it does not create another canvas.
The Three.js license is retained in `three.LICENSE`.
