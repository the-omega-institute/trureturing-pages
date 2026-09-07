import { verifyGraph } from "./atlas-public-core.mjs";
import { sha256 } from "./architecture-core.mjs";

export const STARTUP_SCHEMA = "pages-atlas-startup.v1";
export const LAYOUT_SCHEMA = "pages-public-layout.v1";
export const LAYOUT_PROFILE = "atlas-editorial-families-v1";
const DIGEST = /^sha256:[a-f0-9]{64}$/;

export function validateStartup(index, manifest) {
  if (
    index.schema_version !== STARTUP_SCHEMA ||
    index.atlas_graph_digest !== manifest.atlas_graph_digest ||
    index.truth_release_digest !== manifest.truth_release_digest ||
    index.layout_profile !== LAYOUT_PROFILE
  )
    throw new Error("Startup artifacts do not bind the current Atlas.");
  for (const entry of [index.graph, index.layout]) {
    if (
      !DIGEST.test(entry?.digest) ||
      entry.path !== `data/atlas-startup/${entry.digest.slice(7)}.json.gz`
    )
      throw new Error("Invalid Atlas startup artifact coordinate.");
  }
  return index;
}

export function validateLayout(layout, graph, manifest) {
  if (
    layout.schema_version !== LAYOUT_SCHEMA ||
    layout.layout_profile !== LAYOUT_PROFILE ||
    layout.atlas_graph_digest !== manifest.atlas_graph_digest ||
    layout.truth_release_digest !== manifest.truth_release_digest ||
    !layout.positions ||
    Array.isArray(layout.positions) ||
    Object.keys(layout.positions).length !== graph.nodes.length ||
    graph.nodes.some((node) => {
      const point = layout.positions[node.id];
      return (
        !Object.hasOwn(layout.positions, node.id) ||
        !point ||
        ![point.x, point.y, point.z].every(
          (n) => Number.isFinite(n) && Math.abs(n) < 1e7,
        )
      );
    })
  )
    throw new Error("Precomputed layout does not cover this Atlas.");
  return layout.positions;
}

async function artifactText(base, entry) {
  // Content-addressed URLs may use cached bytes even after HTTP freshness expires.
  // The live manifest and both compressed/decompressed digests still gate rendering.
  const response = await fetch(new URL(entry.path, base), {
    cache: "force-cache",
  });
  if (!response.ok)
    throw new Error(`Atlas startup artifact HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const digest =
    "sha256:" +
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  if (digest !== entry.digest)
    throw new Error("Atlas startup artifact digest mismatch.");
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).text();
}

export async function loadStartup(base) {
  const started = performance.now();
  const [manifestResponse, indexResponse] = await Promise.all([
    fetch(new URL("data/pages-atlas-manifest.v1.json", base), {
      cache: "no-cache",
    }),
    fetch(new URL("data/atlas-startup.v1.json", base), { cache: "no-cache" }),
  ]);
  if (!manifestResponse.ok)
    throw new Error(`Atlas manifest HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (
    indexResponse.status === 404 ||
    typeof DecompressionStream === "undefined"
  ) {
    const response = await fetch(
      new URL("data/pages-atlas-view.v1.json", base),
      { cache: "no-cache" },
    );
    if (!response.ok) throw new Error(`Atlas graph HTTP ${response.status}`);
    const graph = await verifyGraph(await response.text(), manifest, sha256);
    return {
      graph,
      manifest,
      positions: null,
      timing: {
        source: "legacy-worker",
        dataReadyMs: performance.now() - started,
      },
    };
  }
  if (!indexResponse.ok)
    throw new Error(`Atlas startup index HTTP ${indexResponse.status}`);
  const index = validateStartup(await indexResponse.json(), manifest);
  const [graphText, layoutText] = await Promise.all([
    artifactText(base, index.graph),
    artifactText(base, index.layout),
  ]);
  const graph = await verifyGraph(graphText, manifest, sha256);
  const positions = validateLayout(JSON.parse(layoutText), graph, manifest);
  return {
    graph,
    manifest,
    positions,
    timing: { source: "precomputed", dataReadyMs: performance.now() - started },
  };
}
