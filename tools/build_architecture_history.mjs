import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  HISTORY_SCHEMA,
  snapshotFromGraph,
  validateHistory,
  validateSnapshot,
  sha256,
} from "../site/assets/architecture-core.mjs";

async function optionalRead(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function writeAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path + ".tmp", text);
  await rename(path + ".tmp", path);
}
export async function buildHistory({
  graphPath,
  manifestPath,
  output,
  previousUrl,
}) {
  const graphText = await readFile(graphPath, "utf8");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const graphDigest = await sha256(graphText);
  const graph = JSON.parse(graphText);
  if (
    manifest.schema_version !== "pages-atlas-manifest.v1" ||
    graphDigest !== manifest.atlas_graph_digest ||
    graph.source_snapshot?.truth_release_digest !==
      manifest.truth_release_digest
  )
    throw new Error(
      "Architecture input does not match the verified Atlas manifest.",
    );
  const indexPath = resolve(output, "data/architecture-history.v1.json");
  let prior = null;
  let readPrior;
  if (previousUrl) {
    const base = new URL(previousUrl);
    if (
      base.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(base.hostname)
    )
      throw new Error("Previous deployment must use HTTPS.");
    const response = await fetch(
      new URL("data/architecture-history.v1.json", base),
      { signal: AbortSignal.timeout(30000), cache: "no-store" },
    );
    if (response.status !== 404) {
      if (!response.ok)
        throw new Error(
          `Previous history HTTP ${response.status}; refusing to erase history.`,
        );
      prior = validateHistory(await response.json());
    }
    readPrior = async (path) => {
      const response = await fetch(new URL(path, base), {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(
          `Previous snapshot HTTP ${response.status}; refusing to erase history.`,
        );
      return response.text();
    };
  } else {
    const text = await optionalRead(indexPath);
    if (text !== null) prior = validateHistory(JSON.parse(text));
    readPrior = (path) => readFile(resolve(output, path), "utf8");
  }
  const entries = prior ? [...prior.entries] : [];
  for (const entry of entries) {
    const text = await readPrior(entry.path);
    if ((await sha256(text)) !== entry.digest)
      throw new Error(
        "Previous snapshot hash mismatch; refusing to erase history.",
      );
    const snapshot = validateSnapshot(JSON.parse(text));
    if (
      snapshot.truth_release_digest !== entry.truth_release_digest ||
      snapshot.atlas_graph_digest !== entry.atlas_graph_digest
    )
      throw new Error("Previous snapshot release mismatch.");
    await writeAtomic(resolve(output, entry.path), text);
  }
  const snapshot = validateSnapshot(snapshotFromGraph(graph, graphDigest));
  const text = JSON.stringify(snapshot) + "\n";
  const digest = await sha256(text);
  const existing = entries.findIndex(
    (e) =>
      e.digest === digest ||
      (e.atlas_graph_digest === graphDigest &&
        e.truth_release_digest === snapshot.truth_release_digest),
  );
  if (existing >= 0 && existing !== entries.length - 1)
    throw new Error(
      "Incoming architecture snapshot is older than the archived tip.",
    );
  if (existing < 0) {
    const path = `data/architecture/${digest.slice(7)}.json`;
    await writeAtomic(resolve(output, path), text);
    entries.push({
      path,
      digest,
      truth_release_digest: snapshot.truth_release_digest,
      atlas_graph_digest: graphDigest,
    });
  }
  const index = validateHistory({
    schema_version: HISTORY_SCHEMA,
    current_truth_release_digest: snapshot.truth_release_digest,
    entries,
  });
  await writeAtomic(indexPath, JSON.stringify(index, null, 2) + "\n");
  return index;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [graphPath, manifestPath, output, previousUrl] = process.argv.slice(2);
  if (!graphPath || !manifestPath || !output)
    throw new Error(
      "Usage: node tools/build_architecture_history.mjs GRAPH MANIFEST SITE [PREVIOUS_DEPLOYMENT_URL]",
    );
  const index = await buildHistory({
    graphPath,
    manifestPath,
    output,
    previousUrl,
  });
  console.log(
    `Architecture history: ${index.entries.length} verified snapshots / ${index.current_truth_release_digest}`,
  );
}
