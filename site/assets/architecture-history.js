import {
  METRICS,
  loadHistory,
  snapshotFromGraph,
  sha256,
} from "./architecture-core.mjs";
import {
  metricFacts,
  domainDistribution,
  evolutionPanel,
} from "./architecture-ui.mjs";
import { FAMILIES } from "./atlas-public-core.mjs";
import {
  dependencyScene,
  timeScene,
  releaseDelta,
  lineageIds,
} from "./evolution-core.mjs";
import { mountEvolution } from "./evolution-map.js";
import { nodeSlug } from "./library-core.mjs";

const $ = (s) => document.querySelector(s),
  initial = new URLSearchParams(location.hash.slice(1));
const el = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};
let snapshots = [],
  nodes = [],
  selected = initial.get("node"),
  observation = 0,
  mode = initial.get("view") === "time" ? "time" : "dependency",
  expanded = null,
  scene,
  player = null;
const metric = Object.hasOwn(METRICS, initial.get("metric"))
  ? initial.get("metric")
  : "reach";
const renderer = mountEvolution($("#evolution-map"), {
  onSelect: (group) => {
    if (group.observation !== undefined && group.observation !== observation) {
      observation = group.observation;
      $("#lineage-release").value = observation;
    }
    showGroup(group);
    selectNode(group.nodes.slice().sort((a, b) => b.reach - a.reach)[0].id);
  },
});
function stateURL() {
  history.replaceState(
    null,
    "",
    `#${new URLSearchParams({ view: mode, observation: String(observation), ...(selected ? { node: selected } : {}), metric })}`,
  );
}
function search() {
  const q = $("#evolution-search").value.trim().toLowerCase(),
    root = $("#evolution-nodes");
  root.replaceChildren();
  root.hidden = !q;
  if (!q) {
    $("#evolution-results").textContent = "";
    return;
  }
  const matches = nodes.filter((n) =>
    `${n.id} ${n.title} ${n.domain}`.toLowerCase().includes(q),
  );
  $("#evolution-results").textContent = `${matches.length} matching modules`;
  for (const node of matches) {
    const b = el("button", node.title);
    b.type = "button";
    b.setAttribute("aria-pressed", String(node.id === selected));
    b.onclick = () => selectNode(node.id);
    root.append(b);
  }
}
function showGroup(group) {
  const root = $("#lineage-group");
  root.replaceChildren(
    el("p", `${group.nodes.length} modules / ${group.domain}`, "eyebrow"),
  );
  if (mode === "dependency" && group.nodes.length > 1) {
    const b = el("button", "Expand domain");
    b.onclick = () => {
      expanded = group.domain;
      renderMap(true);
    };
    root.append(b);
  }
  const list = el("details"),
    summary = el("summary", "Modules in this group");
  list.append(summary);
  for (const node of group.nodes.slice().sort((a, b) => b.reach - a.reach)) {
    const b = el("button", node.title, "group-module");
    b.onclick = () => selectNode(node.id);
    list.append(b);
  }
  root.append(list);
}
function selectNode(id) {
  selected = id;
  renderDetail();
  renderMap();
  search();
  stateURL();
}
let detailVersion = 0;
async function renderDetail() {
  const version = ++detailVersion,
    root = $("#evolution-detail"),
    current = snapshots[observation],
    node = current.nodes.find((n) => n.id === selected),
    known = nodes.find((n) => n.id === selected);
  root.replaceChildren();
  if (!known) {
    root.append(
      el("h2", "Structural foundations"),
      el(
        "p",
        `${current.nodes.length.toLocaleString()} modules / ${current.domain_count} source domains`,
        "architecture-provenance",
      ),
    );
    for (const n of current.nodes
      .slice()
      .sort((a, b) => b.reach - a.reach || a.id.localeCompare(b.id))
      .slice(0, 6)) {
      const button = el("button", undefined, "architecture-rank"),
        label = el("span");
      label.append(
        el("strong", n.title),
        el("small", `${n.coverage} domains / downstream support`),
      );
      button.append(label, el("b", n.reach));
      button.onclick = () => selectNode(n.id);
      root.append(button);
    }
    return;
  }
  root.append(
    el(
      "p",
      node ? "SELECTED OBSERVATION" : "ABSENT FROM THIS OBSERVATION",
      "eyebrow",
    ),
    el("h2", known.title),
  );
  if (node) metricFacts(root, node);
  const links = el("div", undefined, "lineage-detail-links");
  const atlas = el("a", "Current Atlas");
  atlas.href = `atlas.html#${new URLSearchParams({ mode: "dependency", node: selected, metric })}`;
  const research = el("a", "Related research");
  research.href = `research.html#${new URLSearchParams({ node: selected })}`;
  const wiki = el("a", node ? "Release Library" : "Content history");
  wiki.href = node
    ? `release/${current.truth_release_digest.slice(7)}/node/${await nodeSlug(selected)}/`
    : `library-history.html#node=${encodeURIComponent(selected)}`;
  if (version !== detailVersion) return;
  links.append(atlas, wiki, research);
  root.append(links);
  evolutionPanel(root, snapshots, selected, { metric });
  if (node) domainDistribution(root, node);
  root.append(el("p", selected, "architecture-provenance"));
}
function releaseSummary() {
  const snapshot = snapshots[observation],
    delta = releaseDelta(snapshots[observation - 1], snapshot);
  $("#lineage-release-label").textContent =
    `${observation + 1} / ${snapshots.length}  ${snapshot.truth_release_digest.slice(7, 19)}`;
  $("#release-change-summary").textContent =
    delta.kind === "baseline"
      ? `Archive baseline / ${snapshot.nodes.length.toLocaleString()} modules / no earlier observation`
      : delta.kind === "analysis-changed"
        ? "Analysis profile changed / structural comparison interrupted"
        : `${delta.added.length} added / ${delta.retired.length} absent / ${delta.edgesAdded === null ? "earlier edges not archived" : `${delta.edgesAdded.length} dependencies added / ${delta.edgesRemoved.length} removed`}`;
  if (!snapshot.dependency_edges && mode === "dependency")
    $("#release-change-summary").textContent +=
      " / dependency edges not archived";
  const root = $("#release-events");
  root.replaceChildren();
  if (delta.kind === "comparable")
    for (const [name, ids] of [
      ["Added modules", delta.added],
      ["Absent modules", delta.retired],
    ])
      if (ids.length) {
        const d = el("details"),
          summary = el("summary", `${name} (${ids.length})`);
        d.append(summary);
        for (const id of ids) {
          const button = el(
            "button",
            nodes.find((n) => n.id === id)?.title || id,
          );
          button.onclick = () => selectNode(id);
          d.append(button);
        }
        root.append(d);
      }
}
function renderMap(reset = false) {
  if (!snapshots.length) return;
  scene =
    mode === "time"
      ? timeScene(snapshots)
      : dependencyScene(
          snapshots[observation],
          expanded,
          snapshots.flatMap((s) => s.nodes),
        );
  const ids =
    mode === "time"
      ? new Set(snapshots.flatMap((s) => [...lineageIds(s, selected)]))
      : lineageIds(snapshots[observation], selected);
  renderer.update(scene, { selectedId: selected, ids, reset });
  document
    .querySelectorAll("[data-lineage]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.lineage === mode)),
    );
  $("#lineage-axis-label").textContent =
    mode === "time"
      ? "Release observations / solid: identity continuity / dashed: new dependencies"
      : "Dependency depth (log scale) / foundations to consequences";
  $("#lineage-collapse").hidden = !expanded || mode !== "dependency";
  $("#lineage-clear").disabled = !selected;
  releaseSummary();
  stateURL();
}
function stop() {
  clearInterval(player);
  player = null;
  $("#release-play").setAttribute("aria-label", "Play release evolution");
  $("#release-play").title = "Play release evolution";
  $("#release-play").innerHTML = '<i data-lucide="play"></i>';
  window.lucide?.createIcons();
}
$("#release-play").onclick = () => {
  if (player) {
    stop();
    return;
  }
  $("#release-play").setAttribute("aria-label", "Pause release evolution");
  $("#release-play").title = "Pause release evolution";
  $("#release-play").innerHTML = '<i data-lucide="pause"></i>';
  window.lucide?.createIcons();
  if (observation === snapshots.length - 1) observation = -1;
  const step = () => {
    observation++;
    $("#lineage-release").value = observation;
    renderMap();
    renderDetail();
    if (observation === snapshots.length - 1) stop();
  };
  step();
  if (observation < snapshots.length - 1) player = setInterval(step, 1600);
};
$("#lineage-release").oninput = () => {
  stop();
  observation = Number($("#lineage-release").value);
  $("#lineage-group").replaceChildren();
  renderMap();
  renderDetail();
};
$("#evolution-search").oninput = search;
$("#lineage-fit").onclick = () => renderer.fit();
$("#lineage-clear").onclick = () => {
  selected = null;
  $("#lineage-group").replaceChildren();
  renderMap();
  renderDetail();
  search();
};
$("#lineage-zoom-in").onclick = () => renderer.zoomBy(1.3);
$("#lineage-zoom-out").onclick = () => renderer.zoomBy(1 / 1.3);
$("#lineage-collapse").onclick = () => {
  expanded = null;
  renderMap(true);
};
document.querySelectorAll("[data-lineage]").forEach(
  (b) =>
    (b.onclick = () => {
      mode = b.dataset.lineage;
      renderMap(true);
    }),
);
window.addEventListener("pagehide", () => {
  stop();
  renderer.destroy();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});

(async () => {
  const response = await fetch("data/pages-atlas-manifest.v1.json", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Atlas manifest HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.schema_version !== "pages-atlas-manifest.v1")
    throw new Error("Unsupported Atlas manifest.");
  snapshots = await loadHistory(
    new URL("./", location.href),
    manifest.truth_release_digest,
    manifest.atlas_graph_digest,
  );
  if (!snapshots.length || !snapshots.at(-1).dependency_edges) {
    const response = await fetch("data/pages-atlas-view.v1.json");
    if (!response.ok) throw new Error(`Atlas graph HTTP ${response.status}`);
    const text = await response.text();
    if ((await sha256(text)) !== manifest.atlas_graph_digest)
      throw new Error("Atlas graph digest mismatch.");
    const graph = JSON.parse(text);
    if (
      graph.source_snapshot?.truth_release_digest !==
      manifest.truth_release_digest
    )
      throw new Error("Atlas graph release mismatch.");
    const current = snapshotFromGraph(graph, manifest.atlas_graph_digest);
    if (!snapshots.length) snapshots = [current];
    else snapshots[snapshots.length - 1] = current;
  }
  observation = Math.max(
    0,
    Math.min(
      snapshots.length - 1,
      Number(initial.get("observation") ?? snapshots.length - 1) || 0,
    ),
  );
  const byId = new Map();
  snapshots.forEach((s) => s.nodes.forEach((n) => byId.set(n.id, n)));
  nodes = [...byId.values()].sort(
    (a, b) => b[metric] - a[metric] || a.id.localeCompare(b.id),
  );
  $("#evolution-search").disabled = false;
  $("#lineage-release").max = snapshots.length - 1;
  $("#lineage-release").value = observation;
  $("#lineage-release").disabled = snapshots.length < 2;
  $("#release-play").disabled = snapshots.length < 2;
  $("#evolution-status").textContent =
    `${snapshots.length} verified observations / ${new Set(snapshots.map((s) => s.truth_release_digest)).size} Truth releases / ${nodes.length.toLocaleString()} tracked modules`;
  for (const family of FAMILIES) {
    const item = el("span", family.name);
    item.style.setProperty("--family-color", family.color);
    $("#lineage-key").append(item);
  }
  window.lucide?.createIcons();
  renderMap(true);
  await renderDetail();
  window.architectureHistoryDiagnostics = () => ({
    snapshots: snapshots.length,
    selected,
    nodes: nodes.length,
    observation,
    mode,
    sceneNodes: scene.nodes.length,
    sceneEdges: scene.edges.length,
  });
})().catch((error) => {
  $("#evolution-status").textContent = `History unavailable: ${error.message}`;
});
