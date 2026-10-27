import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicModel,
  computeLayout,
  verifyGraph,
} from "../site/assets/atlas-public-core.mjs";
import {
  STARTUP_SCHEMA,
  LAYOUT_SCHEMA,
  LAYOUT_PROFILE,
  validateLayout,
} from "../site/assets/atlas-startup.mjs";
import { analyzeArchitecture } from "../site/assets/architecture-core.mjs";
import { FOUNDATION_SCHEMA, FOUNDATION_PROFILE, foundationModel } from "../site/assets/foundations-core.mjs";

const digest = (raw) =>
  "sha256:" + createHash("sha256").update(raw).digest("hex");
export function buildFoundationData(graph, manifest) {
  const architecture = analyzeArchitecture(graph);
  const nodes = graph.nodes.filter(n => n.kind === 'truth').map(n => {
    const metrics = architecture.metrics.get(n.id);
    return {id:n.id, title:n.human_title && n.human_title !== 'None' ? n.human_title : n.title || n.id,
      summary:n.human_abstract || '', domain:n.domain || 'Unclassified',
      // Omit only coordinates exactly reproducible from the canonical module ID.
      // This avoids shipping thousands of duplicate paths and random Wiki hashes.
      source_path:n.repo_path === n.id + '.lean' ? undefined : n.repo_path || null,
      knowledge_page:n.knowledge_page === `knowledge/node/${digest(n.id).slice(7)}/` ? undefined : n.knowledge_page || null,
      direct:metrics.direct, reach:metrics.reach, coverage:metrics.coverage, depth:metrics.depth};
  }).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const data = {schema_version:FOUNDATION_SCHEMA, profile:FOUNDATION_PROFILE,
    atlas_graph_digest:manifest.atlas_graph_digest, truth_release_digest:manifest.truth_release_digest,
    source_commit:graph.source_snapshot.source_commit || null, nodes,
    edges:[...architecture.children].flatMap(([id,children])=>[...children].sort().map(child=>[id,child]))};
  foundationModel(data,manifest);
  return data;
}
export async function buildStartup(graphPath, manifestPath, output) {
  const raw = await readFile(graphPath, "utf8");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const graph = await verifyGraph(raw, manifest, digest);
  const layout = {
    schema_version: LAYOUT_SCHEMA,
    layout_profile: LAYOUT_PROFILE,
    atlas_graph_digest: manifest.atlas_graph_digest,
    truth_release_digest: manifest.truth_release_digest,
    positions: computeLayout(createPublicModel(graph)),
  };
  validateLayout(layout, graph, manifest);
  await mkdir(join(output, "data/atlas-startup"), { recursive: true });
  const artifact = async (text) => {
    const bytes = gzipSync(text, { level: 9 });
    const key = digest(bytes);
    const path = `data/atlas-startup/${key.slice(7)}.json.gz`;
    await writeFile(join(output, path), bytes);
    return { path, digest: key, bytes: bytes.length };
  };
  const index = {
    schema_version: STARTUP_SCHEMA,
    layout_profile: LAYOUT_PROFILE,
    atlas_graph_digest: manifest.atlas_graph_digest,
    truth_release_digest: manifest.truth_release_digest,
    graph: await artifact(raw),
    layout: await artifact(JSON.stringify(layout)),
    foundations: await artifact(JSON.stringify(buildFoundationData(graph, manifest))),
  };
  await writeFile(
    join(output, "data/atlas-startup.v1.json"),
    JSON.stringify(index, null, 2) + "\n",
  );
  return index;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length !== 5)
    throw new Error("Usage: build_atlas_startup.mjs GRAPH MANIFEST OUTPUT");
  console.log(JSON.stringify(await buildStartup(...process.argv.slice(2))));
}
