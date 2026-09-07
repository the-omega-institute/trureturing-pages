import {
  FAMILIES,
  createPublicModel,
  endpoint,
  familyFor,
  isOpen,
  neighborhood,
  searchNodes,
  title,
  verifyGraph,
  viewFor,
  architectureLayout,
} from "./atlas-public-core.mjs";
import {
  METRICS,
  analyzeArchitecture,
  rankedNodes,
  snapshotFromGraph,
  loadHistory,
} from "./architecture-core.mjs";
import {
  metricFacts,
  domainDistribution,
  evolutionPanel,
} from "./architecture-ui.mjs";

const $ = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = {
  graph: null,
  model: null,
  positions: null,
  renderer: null,
  family: null,
  selected: null,
  mode: "structure",
  tab: "overview",
  neighbors: new Set(),
  hover: null,
  rotating: false,
  depth: "all",
  types: [...globalThis.TrureturingRelations.TYPES],
  context: true,
  related: null,
  metric: "reach",
  architecture: null,
  structurePositions: null,
  architecturePositions: null,
  history: [],
  historyError: null,
};
const icon = (name) => {
  const el = document.createElement("i");
  el.dataset.lucide = name;
  return el;
};
const el = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};
const action = (label, className, handler) => {
  const item = el("button", className, label);
  item.type = "button";
  item.addEventListener("click", handler);
  return item;
};
const icons = () => window.lucide?.createIcons();
const format = (n) => n.toLocaleString("en-US");
let currentNodes = [];
let familyLabels = [];
let nodeLabels = [];
let lastLabelUpdate = 0;
let resizeObserver;
let wikiMap = null;

function color(node) {
  if (node.id === state.selected) return "#ffffff";
  if (state.selected && !state.neighbors.has(node.id)) return "#253036";
  if (node.kind !== "truth") return "#82b5e0";
  return isOpen(node) ? "#fff1ad" : familyFor(node).color;
}
function edgeColor(edge) {
  const from = endpoint(edge.source),
    to = endpoint(edge.target);
  if (state.selected) {
    if (!state.related?.edgeIds.has(edge.relationId)) return "#1e292f";
    if (edge.category !== "proof")
      return {
        affinity: "#d7a0ca",
        document: "#82b5e0",
        advisory: "#e5c26c",
        authored: "#a7b5c1",
      }[edge.category];
    if (to === state.selected) return "#efc66e";
    if (from === state.selected) return "#6ad7c8";
    return state.related.upstream.has(from) && state.related.upstream.has(to)
      ? "#cbaa65"
      : "#61b3a5";
  }
  const a = state.model.byId.get(from),
    b = state.model.byId.get(to);
  return a.family === b.family ? familyFor(a).color : "#71818b";
}
function edgeWidth(edge) {
  if (state.selected)
    return state.related?.edgeIds.has(edge.relationId)
      ? edge.category === "proof"
        ? 0.95
        : 0.48
      : 0.1;
  return state.mode === "dependency" ? 0.58 : 0.3;
}
function nodeSize(node) {
  if (state.mode === "dependency" && state.architecture.metrics.has(node.id)) {
    const value = state.architecture.metrics.get(node.id)[state.metric];
    return (
      3 + Math.log2(1 + value) ** 2 * 3 + (node.id === state.selected ? 55 : 0)
    );
  }
  if (node.id === state.selected) return 60;
  const degree =
    state.model.parents.get(node.id).size +
    state.model.children.get(node.id).size;
  return isOpen(node) ? 20 : 5 + Math.min(20, degree * 1.6);
}
function stopRotation() {
  state.rotating = false;
  if (state.renderer) state.renderer.controls().autoRotate = false;
  $("#rotate-camera").setAttribute("aria-pressed", "false");
}
function syncUrl() {
  const params = new URLSearchParams();
  if (state.family) params.set("family", state.family);
  if (state.selected) params.set("node", state.selected);
  if (state.mode !== "structure") params.set("mode", state.mode);
  if (state.metric !== "reach") params.set("metric", state.metric);
  if (state.depth !== "all") params.set("depth", state.depth);
  if (!state.context) params.set("context", "0");
  if (state.types.length !== globalThis.TrureturingRelations.TYPES.length)
    params.set("types", state.types.join(","));
  history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}${params.size ? `#${params}` : ""}`,
  );
}
function setMode(mode) {
  if (!state.model) return;
  state.mode = mode;
  state.positions =
    mode === "dependency"
      ? state.architecturePositions
      : state.structurePositions;
  stopRotation();
  renderGraph();
  renderWiki();
  frameNodes(
    state.selected
      ? [...state.neighbors].map((id) => state.model.byId.get(id))
      : currentNodes,
  );
}
function setFamily(id) {
  if (!state.model) return;
  state.family = id;
  state.selected = null;
  state.neighbors.clear();
  state.mode = "structure";
  state.positions = state.structurePositions;
  stopRotation();
  renderGraph();
  renderWiki();
  frameNodes(currentNodes);
}
function selectNode(id) {
  if (!state.model?.byId.has(id)) return;
  const node = state.model.byId.get(id);
  const wasVisible = currentNodes.some((n) => n.id === id);
  state.selected = id;
  state.tab =
    state.mode === "dependency" && node.kind === "truth"
      ? "architecture"
      : "overview";
  if (!wasVisible) {
    state.family = node.family;
    if (state.mode !== "dependency") {
      state.mode = "structure";
      state.positions = state.structurePositions;
    }
  }
  stopRotation();
  $("#search-results").hidden = true;
  $("#concept-query").setAttribute("aria-expanded", "false");
  renderGraph();
  renderWiki();
  frameNodes(
    [...state.neighbors].map((key) => state.model.byId.get(key)),
    320,
  );
  $("#back-to-all").hidden = false;
  $("#view-caption").textContent =
    `${state.neighbors.size} related nodes / ${state.related.edges.length} relations`;
}
function arrowLength(edge) {
  if (edge.category !== "proof") return 0;
  return state.selected &&
    (endpoint(edge.source) === state.selected ||
      endpoint(edge.target) === state.selected)
    ? 5
    : state.mode === "dependency"
      ? 2.4
      : 0;
}
function particles(edge) {
  return !reducedMotion &&
    state.selected &&
    edge.category === "proof" &&
    (endpoint(edge.source) === state.selected ||
      endpoint(edge.target) === state.selected)
    ? 2
    : 0;
}
function renderGraph() {
  document.body.classList.toggle(
    "architecture-mode",
    state.mode === "dependency",
  );
  const view = viewFor(state.model, state);
  state.related = view.related;
  state.neighbors = view.related?.ids || new Set();
  currentNodes = view.nodes;
  state.renderer.graphData({
    nodes: view.nodes.map((n) => {
      const p = state.positions[n.id];
      return { ...n, ...p, fx: p.x, fy: p.y, fz: p.z };
    }),
    links: view.edges.map((e) => ({ ...e })),
  });
  state.renderer
    .nodeColor(color)
    .nodeVal(nodeSize)
    .linkColor(edgeColor)
    .linkWidth(edgeWidth)
    .linkCurvature((edge) =>
      edge.category === "affinity"
        ? 0.12
        : edge.category === "document"
          ? 0.04
          : 0,
    )
    .linkDirectionalArrowLength(arrowLength)
    .linkDirectionalParticles(particles);
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)),
    );
  $("#back-to-all").hidden = !state.family && !state.selected;
  $("#architecture-controls").hidden = state.mode !== "dependency";
  const family = FAMILIES.find((f) => f.id === state.family);
  $("#view-caption").textContent =
    `${family?.name || (state.mode === "frontier" ? "Open questions & their prerequisites" : "All concept families")} / ${format(view.nodes.length)} concepts`;
  if (!view.nodes.length)
    $("#view-caption").textContent = "No open questions in this release";
  if (state.mode === "dependency")
    $("#view-caption").textContent =
      `${METRICS[state.metric]} / module dependencies / ${format(view.nodes.length)} nodes`;
  document.querySelectorAll("[data-edge-key]").forEach((item) => {
    item.hidden =
      !state.selected || !state.types.includes(item.dataset.edgeKey);
  });
  buildLabels();
  syncUrl();
}
function frameNodes(nodes, minimumSpan = 0) {
  if (!nodes.length) return;
  const points = nodes.map((n) => state.positions[n.id]);
  const extent = (axis) => [
    Math.min(...points.map((p) => p[axis])),
    Math.max(...points.map((p) => p[axis])),
  ];
  const [x0, x1] = extent("x"),
    [y0, y1] = extent("y"),
    [z0, z1] = extent("z");
  const width = $("#graph").clientWidth,
    height = $("#graph").clientHeight;
  const camera = state.renderer.camera();
  const tangent = Math.tan((camera.fov * Math.PI) / 360);
  const compact =
    window.innerWidth <= 700 && Boolean(state.selected || state.family);
  const topInset = compact ? 75 : window.innerWidth <= 900 ? 220 : 140;
  const bottomInset = compact ? 28 : 70;
  const availableHeight = Math.max(100, height - topInset - bottomInset);
  const span = Math.max(
    (x1 - x0 + 140) / (width / height),
    ((y1 - y0 + 90) * height) / availableHeight,
    minimumSpan,
  );
  const distance = span / (2 * tangent) + (z1 - z0) * 0.55;
  const center = {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2 + (span * (topInset - bottomInset)) / (2 * height),
    z: (z0 + z1) / 2,
  };
  state.renderer.cameraPosition(
    { x: center.x, y: center.y, z: center.z + distance },
    center,
    reducedMotion ? 0 : 650,
  );
}
function zoom(multiplier) {
  if (!state.renderer) return;
  stopRotation();
  const camera = state.renderer.camera(),
    target = state.renderer.controls().target;
  state.renderer.cameraPosition(
    {
      x: target.x + (camera.position.x - target.x) * multiplier,
      y: target.y + (camera.position.y - target.y) * multiplier,
      z: target.z + (camera.position.z - target.z) * multiplier,
    },
    target,
    reducedMotion ? 0 : 250,
  );
}

function buildLabels() {
  $("#family-labels").replaceChildren();
  familyLabels = [];
  for (const family of state.mode === "dependency"
    ? []
    : state.model.families) {
    const nodes = currentNodes.filter((n) => n.family === family.id);
    if (!nodes.length) continue;
    const points = nodes.map((n) => state.positions[n.id]);
    const point = {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: Math.max(...points.map((p) => p.y)) + 22,
      z: points.reduce((s, p) => s + p.z, 0) / points.length,
    };
    const label = action("", "family-label", () => setFamily(family.id));
    label.style.setProperty("--family-color", family.color);
    label.append(
      el("span", "family-label-name", family.name),
      el("small", "", `${format(nodes.length)} concepts`),
    );
    $("#family-labels").append(label);
    familyLabels.push({ label, point });
  }
  updateLabels();
}
function updateLabels() {
  $("#node-labels").replaceChildren();
  nodeLabels = [];
  let candidates = [];
  if (state.selected)
    candidates = [...state.neighbors]
      .map((id) => state.model.byId.get(id))
      .sort(
        (a, b) =>
          Number(b.id === state.selected) - Number(a.id === state.selected),
      )
      .slice(0, 10);
  else if (state.mode === "dependency")
    candidates = rankedNodes(
      currentNodes,
      state.architecture,
      state.metric,
    ).slice(0, 12);
  else if (state.family)
    candidates = currentNodes
      .slice()
      .sort(
        (a, b) =>
          state.model.children.get(b.id).size -
          state.model.children.get(a.id).size,
      )
      .slice(0, 6);
  if (state.hover && !candidates.some((n) => n.id === state.hover))
    candidates.unshift(state.model.byId.get(state.hover));
  for (const node of candidates.filter(Boolean)) {
    const label = action(
      title(node),
      `node-label${node.id === state.selected ? " is-selected" : ""}`,
      () => selectNode(node.id),
    );
    label.title = title(node);
    $("#node-labels").append(label);
    nodeLabels.push({ label, node });
  }
  positionLabels();
}
function positionLabels() {
  if (!state.renderer) return;
  const width = $("#graph").clientWidth,
    height = $("#graph").clientHeight;
  const graphBounds = $("#graph").getBoundingClientRect();
  const occupied = [
    ...document.querySelectorAll(
      ".atlas-heading, .search, .view-controls, .graph-tools, .back-to-all, .atlas-bottom",
    ),
  ]
    .filter((item) => !item.hidden && getComputedStyle(item).display !== "none")
    .map((item) => {
      const r = item.getBoundingClientRect();
      return {
        x: r.x - graphBounds.x,
        y: r.y - graphBounds.y,
        w: r.width,
        h: r.height,
      };
    });
  const project = (label, p, isNode = false) => {
    const screen = state.renderer.graph2ScreenCoords(p.x, p.y, p.z);
    const camera = state.renderer.camera();
    const direction = camera.getWorldDirection(camera.position.clone());
    const front =
      (p.x - camera.position.x) * direction.x +
        (p.y - camera.position.y) * direction.y +
        (p.z - camera.position.z) * direction.z >
      0;
    const labelWidth = label.offsetWidth,
      labelHeight = label.offsetHeight;
    const x = screen.x - labelWidth / 2,
      y = screen.y + (isNode ? 12 : -labelHeight);
    const box = { x, y, w: labelWidth, h: labelHeight };
    const collides = occupied.some(
      (b) =>
        x < b.x + b.w + 8 &&
        x + box.w + 8 > b.x &&
        y < b.y + b.h + 6 &&
        y + box.h + 6 > b.y,
    );
    const compact =
      window.innerWidth <= 700 && Boolean(state.selected || state.family);
    const topInset = compact ? 85 : window.innerWidth <= 900 ? 200 : 142;
    const visible =
      front &&
      x > 16 &&
      x + box.w < width - 16 &&
      y > topInset &&
      y + box.h < height - (compact ? 12 : 65) &&
      !collides;
    label.style.visibility = visible ? "visible" : "hidden";
    label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (visible) occupied.push(box);
  };
  nodeLabels.forEach(({ label, node }) =>
    project(label, state.positions[node.id], true),
  );
  familyLabels.forEach(({ label, point }) => {
    label.hidden = Boolean(state.selected);
    if (!state.selected) project(label, point);
  });
}

function nodeButton(node, subtitle) {
  const b = action("", "concept-row", () => selectNode(node.id));
  const copy = el("span");
  copy.append(
    el("strong", "", title(node)),
    el("small", "", subtitle || familyFor(node).name),
  );
  b.append(copy, icon("arrow-up-right"));
  return b;
}
function renderWiki() {
  wikiMap?.destroy();
  wikiMap = null;
  const root = $("#wiki-content");
  root.replaceChildren();
  $("#close-wiki").hidden = !state.selected && !state.family;
  $("#wiki").classList.toggle(
    "has-selection",
    Boolean(state.selected || state.family),
  );
  document.body.classList.toggle(
    "concept-open",
    Boolean(state.selected || state.family),
  );
  root.scrollTop = 0;
  if (!state.selected && state.mode === "dependency") {
    renderArchitectureOverview(root);
    icons();
    return;
  }
  if (!state.selected) {
    const family = state.model.families.find((f) => f.id === state.family);
    root.append(
      el("p", "eyebrow", family ? "CONCEPT FAMILY" : "THE COLLECTION"),
      el("h2", "", family ? family.name : "Mathematics, in relation."),
    );
    if (family) {
      root.append(
        el(
          "p",
          "wiki-intro",
          `${format(family.nodes.length)} concepts / ${new Set(family.nodes.map((n) => n.domain)).size} mathematical domains`,
        ),
      );
      const domains = [...new Set(family.nodes.map((n) => n.domain))];
      root.append(
        el(
          "p",
          "domain-names",
          domains.map((d) => d.replace(/([a-z])([A-Z])/g, "$1 $2")).join(" / "),
        ),
      );
      root.append(
        el("div", "wiki-divider"),
        el("h3", "section-label", "STRUCTURAL LANDMARKS"),
      );
      family.nodes
        .slice()
        .sort(
          (a, b) =>
            state.model.children.get(b.id).size -
            state.model.children.get(a.id).size,
        )
        .slice(0, 9)
        .forEach((n) =>
          root.append(
            nodeButton(
              n,
              `${state.model.children.get(n.id).size} direct consequences`,
            ),
          ),
        );
    } else {
      root.append(
        el(
          "p",
          "wiki-intro",
          `${format(state.model.nodes.length)} formal concepts. One evolving mathematical structure.`,
        ),
        el("div", "wiki-divider"),
        el("h3", "section-label", "CONCEPT FAMILIES"),
      );
      const list = el("div", "family-index");
      state.model.families.forEach((f, index) => {
        const b = action("", "family-row", () => setFamily(f.id));
        const swatch = el("span", "family-swatch");
        swatch.style.background = f.color;
        b.append(
          el("span", "family-number", String(index + 1).padStart(2, "0")),
          swatch,
          el("strong", "", f.name),
          el("small", "", format(f.nodes.length)),
          icon("chevron-right"),
        );
        list.append(b);
      });
      root.append(
        list,
        el("div", "wiki-divider"),
        el("h3", "section-label", "FROM THE COLLECTION"),
      );
      const featured = state.model.nodes
        .filter((n) => n.human_abstract && title(n).length < 55)
        .sort(
          (a, b) =>
            state.model.children.get(b.id).size -
            state.model.children.get(a.id).size,
        )
        .slice(0, 3);
      featured.forEach((n) => root.append(nodeButton(n)));
    }
    root.append(
      el("p", "wiki-footnote", "Topic grouping / editorial navigation"),
    );
  } else renderArticle(root);
  icons();
}
function renderArticle(root) {
  const node = state.model.byId.get(state.selected);
  const family = familyFor(node);
  const model = window.TrureturingConceptLensCore.createModel(
    state.graph,
    node.id,
    1,
  );
  const back = action(family.name, "article-family", () =>
    setFamily(family.id),
  );
  back.style.color = family.color;
  root.append(back, el("h2", "article-title", title(node)));
  const meta = el("div", "article-meta");
  const closed = String(node.state || node.status).toLowerCase() === "closed";
  meta.append(
    el(
      "span",
      closed ? "status-closed" : "status-open",
      isOpen(node)
        ? "Open question"
        : closed
          ? "Proven"
          : node.status || node.state || "Unspecified",
    ),
    el(
      "span",
      "",
      String(node.domain || "Other").replace(/([a-z])([A-Z])/g, "$1 $2"),
    ),
  );
  root.append(meta);
  const tabs = el("div", "wiki-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Concept detail");
  for (const [key, name] of [
    ["overview", "Overview"],
    ["connections", "Connections"],
    ...(node.kind === "truth" ? [["architecture", "Architecture"]] : []),
  ]) {
    const b = action(name, "", () => {
      state.tab = key;
      renderWiki();
    });
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(state.tab === key));
    tabs.append(b);
  }
  root.append(tabs);
  if (state.tab === "architecture") {
    renderArchitectureNode(root, node);
    return;
  }
  const relationshipControls = el("div", "relationship-controls");
  const depthLabel = el("label", "", "Relationships");
  const depthSelect = el("select");
  depthSelect.setAttribute("aria-label", "Relationship range");
  for (const [value, label] of [
    ["1", "Direct"],
    ["2", "Two hops"],
    ["all", "Full lineage"],
  ]) {
    const option = el("option", "", label);
    option.value = value;
    depthSelect.append(option);
  }
  depthSelect.value = state.depth;
  const refreshRelationships = () => {
    renderGraph();
    renderWiki();
    frameNodes(
      [...state.neighbors].map((id) => state.model.byId.get(id)),
      320,
    );
  };
  depthSelect.addEventListener("change", () => {
    state.depth = depthSelect.value;
    refreshRelationships();
  });
  depthLabel.append(depthSelect);
  relationshipControls.append(depthLabel);
  const contextLabel = el("label", "", "Keep context");
  const contextInput = el("input");
  contextInput.type = "checkbox";
  contextInput.checked = state.context;
  contextInput.addEventListener("change", () => {
    state.context = contextInput.checked;
    renderGraph();
  });
  contextLabel.prepend(contextInput);
  relationshipControls.append(contextLabel);
  for (const [category, name] of [
    ["proof", "Proof"],
    ["affinity", "Affinity"],
    ["document", "Documents"],
    ["advisory", "Advisory"],
    ["authored", "Authored"],
  ]) {
    if (
      ["advisory", "authored"].includes(category) &&
      !state.model.relationships.edges.some((e) => e.category === category)
    )
      continue;
    const label = el("label", "", name);
    const input = el("input");
    input.type = "checkbox";
    input.checked = state.types.includes(category);
    input.addEventListener("change", () => {
      state.types = input.checked
        ? [...state.types, category]
        : state.types.filter((type) => type !== category);
      refreshRelationships();
    });
    label.prepend(input);
    relationshipControls.append(label);
  }
  root.append(relationshipControls);
  if (state.tab === "overview") {
    root.append(
      el("h3", "section-label", "THE CONCEPT"),
      el("p", "article-copy", model.exposition.summary),
    );
    if (model.exposition.theorem)
      root.append(el("blockquote", "theorem", model.exposition.theorem));
    root.append(
      el(
        "p",
        "source-label",
        model.exposition.authority === "blueprint-authored"
          ? "From the authored Blueprint"
          : "Source description / no authored explanation available",
      ),
    );
    root.append(el("h3", "section-label spaced", "IN THE STRUCTURE"));
    const facts = el("div", "connection-counts");
    facts.append(
      action(
        `${state.model.parents.get(node.id).size} prerequisites`,
        "",
        () => {
          state.tab = "connections";
          renderWiki();
        },
      ),
      action(
        `${state.model.children.get(node.id).size} consequences`,
        "",
        () => {
          state.tab = "connections";
          renderWiki();
        },
      ),
    );
    root.append(facts);
    const usefulFacts = model.facts.slice(0, 2);
    usefulFacts.forEach((f) => root.append(el("p", "structural-fact", f.text)));
    if (model.documents.length) {
      root.append(el("h3", "section-label spaced", "FURTHER READING"));
      for (const document of model.documents.slice(0, 5)) {
        const link = el("a", "document-link", document.label);
        link.href = document.href;
        link.target = "_blank";
        link.rel = "noopener";
        link.append(icon("arrow-up-right"));
        root.append(link);
      }
    }
  } else {
    const mapHost = el("div", "wiki-relation-map");
    root.append(mapHost);
    wikiMap = window.TrureturingRelationMap.mount(mapHost, {
      compact: true,
      onSelect: selectNode,
    });
    wikiMap.update({
      nodes: state.related.nodes,
      edges: state.related.edges,
      selectedId: node.id,
    });
    const key = el("div", "relationship-key");
    for (const [name, category] of [
      ["Proof", "proof"],
      ["Affinity", "affinity"],
      ["Document", "document"],
    ]) {
      const item = el("span", "", name);
      item.prepend(el("i", category));
      key.append(item);
    }
    root.append(key);
    for (const [label, ids, className, empty] of [
      [
        "BUILT FROM",
        state.related.upstream,
        "upstream",
        "No direct prerequisites in this release.",
      ],
      [
        "ENABLES",
        state.related.downstream,
        "downstream",
        "No direct consequences in this release.",
      ],
    ]) {
      root.append(el("h3", `section-label spaced ${className}`, label));
      if (!ids.size) root.append(el("p", "muted", empty));
      [...ids].forEach((id) =>
        root.append(nodeButton(state.model.byId.get(id))),
      );
    }
    const additional = state.related.nodes.filter(
      (n) =>
        n.id !== node.id &&
        !state.related.upstream.has(n.id) &&
        !state.related.downstream.has(n.id),
    );
    for (const [label, list] of [
      ["RELATED CONCEPTS", additional.filter((n) => n.kind === "truth")],
      ["DOCUMENT CONNECTIONS", additional.filter((n) => n.kind !== "truth")],
    ]) {
      if (!list.length) continue;
      root.append(
        el("h3", "section-label spaced", `${label} / ${list.length}`),
      );
      list.forEach((n) =>
        root.append(
          nodeButton(
            n,
            n.kind === "truth"
              ? "Structural / authored relationship"
              : "Blueprint document",
          ),
        ),
      );
    }
  }
  const audit = el("details", "article-audit");
  audit.append(
    el("summary", "", "Source & provenance"),
    el("p", "", node.repo_path || node.id),
    el("p", "", state.graph.source_snapshot.truth_release_digest),
  );
  root.append(audit);
  const research = el("a", "research-link", "Related research questions");
  research.href = `research.html#node=${encodeURIComponent(node.id)}`;
  research.append(icon("arrow-up-right"));
  root.append(research);
}

function showSearch() {
  if (!state.model) return;
  const root = $("#search-results"),
    input = $("#concept-query");
  root.replaceChildren();
  const query = input.value.trim();
  root.hidden = !query;
  input.setAttribute("aria-expanded", String(Boolean(query)));
  if (!query) return;
  const matches = searchNodes(state.model, query);
  if (!matches.length)
    root.append(el("p", "no-results", "No matching concepts"));
  matches.forEach((node) => root.append(nodeButton(node)));
  icons();
}

async function load() {
  icons();
  const fetchText = async (path) => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  };
  const [graphText, manifestText] = await Promise.all([
    fetchText("data/pages-atlas-view.v1.json"),
    fetchText("data/pages-atlas-manifest.v1.json"),
  ]);
  const digest = async (text) =>
    "sha256:" +
    [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  state.graph = await verifyGraph(graphText, JSON.parse(manifestText), digest);
  state.model = createPublicModel(state.graph);
  state.architecture = analyzeArchitecture(state.graph);
  state.history = [
    snapshotFromGraph(state.graph, JSON.parse(manifestText).atlas_graph_digest),
  ];
  if (!state.model.nodes.length)
    throw new Error("This release has no mathematical concepts.");
  $("#loading-message").textContent = "Assembling the concept families";
  state.positions = await new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./atlas-public-worker.mjs", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({ data }) => {
      if (data.positions) {
        worker.terminate();
        resolve(data.positions);
      } else if (data.error) {
        worker.terminate();
        reject(new Error(data.error));
      } else
        $("#loading-detail").textContent =
          `${Math.round(data.progress * 100)}% / ${format(state.model.nodes.length)} concepts`;
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("The layout worker could not start."));
    };
    worker.postMessage(state.graph);
  });
  state.structurePositions = state.positions;
  state.architecturePositions = architectureLayout(
    state.model,
    state.positions,
    state.architecture,
  );
  $("#release-state").textContent = "Verified release";
  $("#release-state").classList.add("is-ready");
  $("#release-note").textContent =
    state.graph.source_snapshot.truth_release_digest;
  $("#atlas-counts").textContent =
    `${format(state.model.nodes.length)} concepts / ${state.model.families.length} families / ${format(state.model.edges.length)} proof connections`;
  state.renderer = window
    .ForceGraph3D({
      controlType: "orbit",
      rendererConfig: {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      },
    })($("#graph"))
    .backgroundColor("#090c10")
    .showNavInfo(false)
    .nodeLabel(() => "")
    .nodeRelSize(1.35)
    .nodeResolution(10)
    .nodeOpacity(0.94)
    .linkOpacity(0.36)
    .linkResolution(3)
    .linkDirectionalArrowRelPos(0.84)
    .linkDirectionalArrowColor(edgeColor)
    .linkDirectionalParticleWidth(1)
    .linkDirectionalParticleColor(edgeColor)
    .linkDirectionalParticleSpeed(0.003)
    .warmupTicks(0)
    .cooldownTicks(0)
    .onNodeClick((node) => selectNode(node.id))
    .onNodeHover((node) => {
      state.hover = node?.id || null;
      $("#graph").style.cursor = node ? "pointer" : "grab";
      updateLabels();
    })
    .onNodeDrag(() => {
      stopRotation();
    })
    .onNodeDragEnd((node) => {
      node.fx = node.x;
      node.fy = node.y;
      node.fz = node.z;
      state.positions[node.id] = { x: node.x, y: node.y, z: node.z };
      buildLabels();
    })
    .onBackgroundClick(() => {
      if (state.selected) setFamily(state.family);
    });
  state.renderer.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const controls = state.renderer.controls();
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.autoRotateSpeed = 0.35;
  controls.minDistance = 65;
  controls.maxDistance = 6500;
  controls.addEventListener("start", stopRotation);
  controls.addEventListener("change", positionLabels);
  const initial = new URLSearchParams(location.hash.slice(1));
  if (FAMILIES.some((f) => f.id === initial.get("family")))
    state.family = initial.get("family");
  if (["dependency", "frontier"].includes(initial.get("mode")))
    state.mode = initial.get("mode");
  if (Object.hasOwn(METRICS, initial.get("metric")))
    state.metric = initial.get("metric");
  $("#architecture-metric").value = state.metric;
  state.positions =
    state.mode === "dependency"
      ? state.architecturePositions
      : state.structurePositions;
  if (["1", "2", "all"].includes(initial.get("depth")))
    state.depth = initial.get("depth");
  state.context = initial.get("context") !== "0";
  if (initial.has("types"))
    state.types = initial
      .get("types")
      .split(",")
      .filter((type) => globalThis.TrureturingRelations.TYPES.includes(type));
  const resize = () => {
    document.documentElement.style.setProperty(
      "--atlas-header-height",
      `${$(".atlas-header").getBoundingClientRect().height}px`,
    );
    state.renderer
      .width($("#graph").clientWidth)
      .height($("#graph").clientHeight);
    positionLabels();
  };
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe($("#graph"));
  resizeObserver.observe($(".atlas-header"));
  resize();
  renderGraph();
  renderWiki();
  $("#loading").hidden = true;
  requestAnimationFrame(() => {
    frameNodes(currentNodes);
    if (initial.get("node")) selectNode(initial.get("node"));
  });
  const animateLabels = (time) => {
    if (time - lastLabelUpdate > 80) {
      positionLabels();
      lastLabelUpdate = time;
    }
    requestAnimationFrame(animateLabels);
  };
  requestAnimationFrame(animateLabels);
  // Read-only telemetry for local rendering and interaction verification.
  window.atlasDiagnostics = () => ({
    nodes: currentNodes.length,
    edges: state.renderer.graphData().links.length,
    selected: state.selected,
    family: state.family,
    mode: state.mode,
    relatedNodes: state.related?.ids.size || 0,
    relatedEdges: state.related?.edges.length || 0,
    metric: state.metric,
    architecture: state.selected
      ? state.architecture.metrics.get(state.selected)
      : null,
    historySnapshots: state.history.length,
    positions: Object.fromEntries(
      state.renderer.graphData().nodes.map((n) => [
        n.id,
        {
          x: n.x,
          y: n.y,
          z: n.z,
          screen: state.renderer.graph2ScreenCoords(n.x, n.y, n.z),
        },
      ]),
    ),
    camera: state.renderer.camera().position.toArray(),
  });
  loadHistory(
    new URL("./", location.href),
    state.graph.source_snapshot.truth_release_digest,
    JSON.parse(manifestText).atlas_graph_digest,
  )
    .then((snapshots) => {
      if (snapshots.length) state.history = snapshots;
      if (state.tab === "architecture" || state.mode === "dependency")
        renderWiki();
    })
    .catch((error) => {
      state.historyError = `History verification failed: ${error.message}`;
      if (state.tab === "architecture" || state.mode === "dependency")
        renderWiki();
    });
}

function renderArchitectureOverview(root) {
  root.append(
    el("p", "eyebrow", "ARCHITECTURE / CURRENT RELEASE"),
    el("h2", "", "What the structure rests on."),
    el(
      "p",
      "wiki-intro",
      `${state.architecture.nodeCount.toLocaleString()} modules / ${state.architecture.domainCount} domains`,
    ),
  );
  const history = el(
    "a",
    "research-link",
    `Evolution / ${state.history.length} recorded observations`,
  );
  history.href = "evolution.html";
  root.append(history);
  root.append(
    el("h3", "section-label spaced", METRICS[state.metric].toUpperCase()),
  );
  const ranking = el("div", "architecture-ranking");
  const nodes = rankedNodes(currentNodes, state.architecture, state.metric);
  const rest = el("details");
  rest.append(el("summary", "", `All ranked modules / ${nodes.length}`));
  nodes.forEach((node, index) => {
    const metrics = state.architecture.metrics.get(node.id);
    const button = action("", "architecture-rank", () => {
      selectNode(node.id);
      state.tab = "architecture";
      renderWiki();
    });
    const copy = el("span");
    copy.append(
      el("strong", "", title(node)),
      el(
        "small",
        "",
        `${metrics.reach} supported / ${metrics.coverage} domains`,
      ),
    );
    button.append(
      el("span", "", String(index + 1).padStart(2, "0")),
      copy,
      el("b", "", metrics[state.metric].toLocaleString()),
    );
    (index < 12 ? ranking : rest).append(button);
  });
  ranking.append(rest);
  root.append(
    ranking,
    el(
      "p",
      "architecture-provenance",
      "Module-import graph / Topology counters / domain coverage summarized from released dependencies",
    ),
  );
}

function renderArchitectureNode(root, node) {
  const metrics = state.architecture.metrics.get(node.id);
  metricFacts(root, metrics);
  const pathHost = el("div", "architecture-paths");
  domainDistribution(root, metrics, (domain) => {
    pathHost.replaceChildren(el("h3", "section-label", domain));
    const targets = [...state.architecture.descendants.get(node.id)].filter(
      (id) => (state.model.byId.get(id).domain || "Unclassified") === domain,
    );
    for (const id of targets) {
      const details = el("details");
      details.append(el("summary", "", title(state.model.byId.get(id))));
      details.addEventListener("toggle", () => {
        if (!details.open || details.querySelector("ol")) return;
        const previous = new Map([[node.id, null]]),
          queue = [node.id];
        for (let i = 0; i < queue.length && !previous.has(id); i++)
          for (const next of state.architecture.children.get(queue[i]))
            if (!previous.has(next)) {
              previous.set(next, queue[i]);
              queue.push(next);
            }
        const path = [];
        for (let next = id; next !== null; next = previous.get(next))
          path.unshift(next);
        const list = el("ol");
        for (const key of path) {
          const row = el("li");
          row.append(
            action(title(state.model.byId.get(key)), "", () => {
              selectNode(key);
              state.tab = "architecture";
              renderWiki();
            }),
          );
          list.append(row);
        }
        details.append(list);
      });
      pathHost.append(details);
    }
  });
  root.append(pathHost);
  evolutionPanel(root, state.history, node.id, {
    metric: state.metric,
    error: state.historyError,
  });
  const history = el("a", "research-link", "Open evolution workspace");
  history.href = `evolution.html#node=${encodeURIComponent(node.id)}&metric=${state.metric}`;
  const wiki = el("a", "research-link", "Open concept Wiki");
  wiki.href = node.knowledge_page;
  root.append(
    history,
    wiki,
    el(
      "p",
      "architecture-provenance",
      "Counts refer to distinct modules. Downstream support is deduplicated; affinity and document links are excluded.",
    ),
  );
}

$("#architecture-metric").addEventListener("change", (event) => {
  state.metric = event.target.value;
  renderGraph();
  renderWiki();
});

document
  .querySelectorAll("[data-mode]")
  .forEach((button) =>
    button.addEventListener("click", () => setMode(button.dataset.mode)),
  );
$("#zoom-in").addEventListener("click", () => zoom(0.76));
$("#zoom-out").addEventListener("click", () => zoom(1.3));
$("#reset-camera").addEventListener("click", () => setFamily(null));
$("#back-to-all").addEventListener("click", () => setFamily(null));
$("#close-wiki").addEventListener("click", () =>
  state.selected ? setFamily(state.family) : setFamily(null),
);
$("#rotate-camera").addEventListener("click", () => {
  if (!state.renderer) return;
  state.rotating = !state.rotating;
  state.renderer.controls().autoRotate = state.rotating;
  $("#rotate-camera").setAttribute("aria-pressed", String(state.rotating));
});
$("#about-atlas").addEventListener("click", () => {
  $("#map-note").hidden = !$("#map-note").hidden;
});
$("#close-note").addEventListener("click", () => {
  $("#map-note").hidden = true;
});
$("#concept-query").addEventListener("input", showSearch);
$("#concept-query").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    const first = $("#search-results button");
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }
});
$("#search-results").addEventListener("keydown", (event) => {
  const buttons = [...$("#search-results").querySelectorAll("button")],
    index = buttons.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    buttons[
      (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
        buttons.length
    ]?.focus();
  }
});
$("#concept-search").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.model) return;
  const result = searchNodes(state.model, $("#concept-query").value, 1)[0];
  if (result) selectNode(result.id);
  else showSearch();
});
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".search")) {
    $("#search-results").hidden = true;
    $("#concept-query").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("#search-results").hidden = true;
    $("#concept-query").setAttribute("aria-expanded", "false");
    $("#map-note").hidden = true;
    if (state.selected) setFamily(state.family);
  }
});
load().catch((error) => {
  $("#loading").classList.add("is-error");
  $("#loading-message").textContent = "The Atlas is unavailable";
  $("#loading-detail").textContent = error.message;
  const link = el("a", "", "Open the static Library");
  link.href = "knowledge/";
  $("#loading").append(link);
  $("#release-state").textContent = "Unavailable";
  $("#wiki-content").replaceChildren(
    el("h2", "", "Concept wiki unavailable"),
    el("p", "muted", "The published graph could not be loaded."),
  );
  console.error(error);
});
