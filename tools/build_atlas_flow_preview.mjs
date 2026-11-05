import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateView } from "../site/assets/atlas-startup-view.mjs";
import { createPublicModel } from "../site/assets/atlas-public-core.mjs";
import { mathematicalArchitecture } from "../site/assets/architecture-core.mjs";
import { theoryModel } from "../site/assets/atlas-theory-core.mjs";
import { flowLayout, readFlowLayout } from "../site/assets/atlas-flow-layout.mjs";

export function buildFlowPreview(theory, architecture, graphDigest) {
  const positions = flowLayout(theory, architecture);
  const layout = {
    schema_version: "pages-atlas-flow-preview.v1",
    layout_profile: "atlas-connected-flow-preview-v1",
    atlas_graph_digest: graphDigest,
    nodes: theory.nodes.map(node => [node.id,
      ...["x", "y", "z"].map(axis => Math.round(positions[node.id][axis] * 1000) / 1000)]),
  };
  readFlowLayout(layout, theory, graphDigest);
  return layout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = Object.fromEntries(Array.from({length:Math.floor((process.argv.length-2)/2)}, (_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
  if (!options["--cache"]) throw new Error("Usage: node tools/build_atlas_flow_preview.mjs --cache <verified-startup-cache> [--output <json>]");
  const cache = path.resolve(options["--cache"]);
  const output = options["--output"] ? path.resolve(options["--output"]) : fileURLToPath(new URL("../site/assets/atlas-flow-preview.v1.json",import.meta.url));
  const index = JSON.parse(fs.readFileSync(path.join(cache,"data/atlas-startup.v1.json")));
  const graph = validateView(JSON.parse(gunzipSync(fs.readFileSync(path.join(cache,index.fast.graph.path)))),index);
  const model = createPublicModel(graph), architecture = mathematicalArchitecture(model), theory = theoryModel(model,architecture);
  const started = performance.now(), layout = buildFlowPreview(theory, architecture, index.atlas_graph_digest);
  fs.writeFileSync(output,JSON.stringify(layout)+"\n");
  console.log(JSON.stringify({output,nodes:layout.nodes.length,bytes:fs.statSync(output).size,layoutMs:Math.round(performance.now()-started)}));
}
