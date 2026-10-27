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

const digest = (raw) =>
  "sha256:" + createHash("sha256").update(raw).digest("hex");
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
