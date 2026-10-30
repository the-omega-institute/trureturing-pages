import { verifyGraph } from "./atlas-public-core.mjs?v=lean-admission-v2";
import { sha256, analyzeArchitecture } from "./architecture-core.mjs?v=lean-admission-v2";
import { applyAdmission, admissionFromEvidence, supportedLean } from "./atlas-admission.mjs?v=lean-admission-v2";
import { validateView, validateDetails, detailShard, DETAIL_SHARDS } from "./atlas-startup-view.mjs?v=lean-admission-v2";

export const STARTUP_SCHEMA = "pages-atlas-startup.v1";
export const LAYOUT_SCHEMA = "pages-public-layout.v1";
const COMPACT_LAYOUT_SCHEMA = "pages-public-layout-indexed.v1";
export const LAYOUT_PROFILE = "atlas-evidenced-dag-v4";
const CONNECTED_PROFILES = [LAYOUT_PROFILE, "atlas-connected-dag-v3"];
const PROFILES = [...CONNECTED_PROFILES, "atlas-dependency-scaffold-v2"];
const DIGEST = /^sha256:[a-f0-9]{64}$/;

// Index coordinates by the complete, digest-bound source node order rather
// than repeating long module paths twice. Rounding remains exactly 1e-3.
export function compactLayout(layout, graph, nodeOrderDigest) {
  const pack = positions => graph.nodes.map(node => ["x", "y", "z"].map(axis => Math.round(positions[node.id][axis] * 1000)));
  return { ...layout, schema_version: COMPACT_LAYOUT_SCHEMA, node_order_digest: nodeOrderDigest,
    positions: pack(layout.positions), dependency_positions: pack(layout.dependency_positions) };
}

export async function expandLayout(layout, graph) {
  if (layout.schema_version !== COMPACT_LAYOUT_SCHEMA) return layout;
  if (layout.node_order_digest !== await sha256(JSON.stringify(graph.nodes.map(n => n.id))))
    throw new Error("Indexed layout disagrees with the source node order.");
  const unpack = rows => {
    if (!Array.isArray(rows) || rows.length !== graph.nodes.length || rows.some(row =>
      !Array.isArray(row) || row.length !== 3 || row.some(n => !Number.isSafeInteger(n))))
      throw new Error("Indexed layout does not cover this Atlas.");
    return Object.fromEntries(rows.map((row, i) => [graph.nodes[i].id,
      Object.fromEntries(["x", "y", "z"].map((axis, j) => [axis, row[j] / 1000]))]));
  };
  return { ...layout, schema_version: LAYOUT_SCHEMA,
    positions: unpack(layout.positions), dependency_positions: unpack(layout.dependency_positions) };
}

export function validateStartup(index, manifest) {
  if (
    index.schema_version !== STARTUP_SCHEMA ||
    index.atlas_graph_digest !== manifest.atlas_graph_digest ||
    index.truth_release_digest !== manifest.truth_release_digest ||
    !PROFILES.includes(index.layout_profile)
  )
    throw new Error("Startup artifacts do not bind the current Atlas.");
  if (index.fast && (!Array.isArray(index.fast.details) || index.fast.details.length !== DETAIL_SHARDS))
    throw new Error("Invalid Atlas concept detail index.");
  if (index.details && (!Array.isArray(index.details) || index.details.length !== DETAIL_SHARDS))
    throw new Error("Invalid Atlas concept detail index.");
  for (const entry of [index.graph, index.layout, ...(index.admission ? [index.admission] : []), ...(index.details || []), ...(index.fast ? [index.fast.graph, index.fast.layout, ...index.fast.details] : [])]) {
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
    !PROFILES.includes(layout.layout_profile) ||
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
  if (CONNECTED_PROFILES.includes(layout.layout_profile)) {
    const points = layout.dependency_positions;
    if (!points || Array.isArray(points) || Object.keys(points).length !== graph.nodes.length ||
        graph.nodes.some(n => !Object.hasOwn(points, n.id) || !points[n.id] ||
          ![points[n.id].x, points[n.id].y, points[n.id].z].every(v => Number.isFinite(v) && Math.abs(v) < 1e7)))
      throw new Error("Dependency layout does not cover this Atlas.");
    const truthIds = new Set(graph.nodes.filter(n => layout.layout_profile === LAYOUT_PROFILE ? supportedLean(n) : n.kind === "truth").map(n => n.id));
    const endpoint = value => typeof value === "object" ? value.id : value;
    if (graph.edges.some(e => truthIds.has(endpoint(e.source)) && truthIds.has(endpoint(e.target)) && ["truth-dependency", "module-import", "frozen-prerequisite", "dependency"].includes(e.layer || "dependency") &&
        !["advisory", "proposed"].includes(e.status) && points[endpoint(e.source)].y <= points[endpoint(e.target)].y))
      throw new Error("Dependency layout reverses a published import.");
  }
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
    fetch(new URL("data/atlas-startup.v1.json?v=lean-admission-v2", base), { cache: "no-cache" }),
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
    const sourceGraph = await verifyGraph(await response.text(), manifest, sha256);
    analyzeArchitecture(sourceGraph);
    const admissionResponse = await fetch(new URL("data/atlas-admission.v1.json", base), { cache: "no-cache" });
    const admission = admissionResponse.ok ? await admissionResponse.json() : admissionFromEvidence(sourceGraph, manifest);
    const graph = applyAdmission(sourceGraph, manifest, admission);
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
  const fast = index.fast;
  const [graphText, layoutText, admissionText] = await Promise.all([
    artifactText(base, fast?.graph || index.graph),
    artifactText(base, fast?.layout || index.layout),
    !fast && index.admission ? artifactText(base, index.admission) : null,
  ]);
  let graph = fast ? validateView(JSON.parse(graphText), manifest) : await verifyGraph(graphText, manifest, sha256);
  // The compact view retains all source topology fields, so the same full
  // validation runs before admission in either startup path.
  analyzeArchitecture(graph);
  if (!fast) graph = applyAdmission(graph, manifest, admissionText ? JSON.parse(admissionText) : admissionFromEvidence(graph, manifest));
  const layout = await expandLayout(JSON.parse(layoutText), graph);
  if (layout.layout_profile !== index.layout_profile) throw new Error("Layout profile disagrees with its startup index.");
  const positions = validateLayout(layout, graph, manifest);
  const detailCache = new Map();
  const detailIndex = fast?.details || index.details;
  const loadDetails = detailIndex ? async id => {
    const shard = detailShard(id);
    if (!detailCache.has(shard)) {
      const task = artifactText(base, detailIndex[shard])
        .then(text => validateDetails(JSON.parse(text), manifest, graph, shard))
        .catch(error => { detailCache.delete(shard); throw error; });
      detailCache.set(shard, task);
    }
    const node = (await detailCache.get(shard)).get(id);
    if (!node) throw new Error("Concept is absent from the published details.");
    return node;
  } : null;
  return {
    graph,
    manifest,
    positions,
    dependencyPositions: CONNECTED_PROFILES.includes(layout.layout_profile) ? layout.dependency_positions : null,
    loadDetails,
    timing: { source: "precomputed", compact: Boolean(fast), dataReadyMs: performance.now() - started },
  };
}
