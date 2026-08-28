(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const COLORS = { Closed: "#3ea86b", Open: "#8b9691", Tail: "#d39432", Semantic: "#4b91b8" };
  const LAYER_ORDER = ["D5/S0", "D5/S1", "D5/S3", "D5/X_Frontier", "Root"];
  const NODE_GAP = 34;
  const RANK_GAP = 146;
  const graphElement = document.querySelector("#graph");
  const statusElement = document.querySelector("#graph-status");
  const detailElement = document.querySelector("#node-detail");
  const layerSelect = document.querySelector("#layer-filter");
  const queryInput = document.querySelector("#node-query");
  const searchForm = document.querySelector("#node-search");
  const fitButton = document.querySelector("#fit-graph");
  const stateButtons = [...document.querySelectorAll("[data-state]")];
  let sourceGraph = { nodes: [], edges: [] };
  let nodeById = new Map();
  let parentsById = new Map();
  let childrenById = new Map();
  let rankById = new Map();
  let activeState = "All";
  let activeLayer = "All";
  let selectedId = null;
  let svg = null;
  let edgeGroup = null;
  let nodeGroup = null;
  let layout = null;
  let view = { x: 0, y: 0, width: 1000, height: 700 };
  let drag = null;

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function humanTitle(node) {
    if (node.human_title) return node.human_title;
    const leaf = String(node.repo_path || node.id || "Node").replace(/\.lean$/, "").split("/").pop();
    const words = leaf.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
    return node.domain && node.domain.toLowerCase() !== words.toLowerCase() ? `${node.domain}: ${words}` : words;
  }

  function endpointId(endpoint) { return typeof endpoint === "object" ? endpoint.id : endpoint; }
  function statusColor(node) { return COLORS[node.status] || COLORS.Semantic; }
  function layerRank(layer) { const known = LAYER_ORDER.indexOf(layer); return known < 0 ? LAYER_ORDER.length : known; }
  function topologicalRank(node) { return rankById.get(node.id) ?? Number(node.true_depth ?? node.depth) ?? 0; }
  function nodeSort(left, right) {
    return layerRank(left.layer) - layerRank(right.layer) || String(left.domain || "").localeCompare(String(right.domain || "")) || humanTitle(left).localeCompare(humanTitle(right)) || left.id.localeCompare(right.id);
  }
  function metricRow(name, value) {
    return value === undefined || value === null || value === "" ? "" : `<div><dt>${escapeHtml(name)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`;
  }

  function relatedNodes(ids) {
    return (ids || []).map((id) => nodeById.get(id)).filter(Boolean).sort((left, right) => topologicalRank(left) - topologicalRank(right) || nodeSort(left, right));
  }

  function relationList(nodes, emptyMessage) {
    if (nodes.length === 0) return `<p class="node-relation-empty">${escapeHtml(emptyMessage)}</p>`;
    return `<ul class="node-relations">${nodes.map((node) => `<li><button type="button" data-node-id="${escapeHtml(node.id)}"><span>${escapeHtml(humanTitle(node))}</span><small>Depth ${escapeHtml(topologicalRank(node))} | ${escapeHtml(node.status)}</small></button></li>`).join("")}</ul>`;
  }

  function renderDetail(node) {
    if (!node) {
      detailElement.innerHTML = '<p class="node-detail-empty">Select a node to reveal its interpretation and upstream dependencies.</p>';
      return;
    }
    const parents = relatedNodes(parentsById.get(node.id));
    const children = relatedNodes(childrenById.get(node.id));
    const abstract = node.human_abstract || "No Blueprint interpretation is available for this node.";
    const theorem = node.human_theorem ? `<p class="node-detail-theorem"><strong>Theorem</strong>${escapeHtml(node.human_theorem)}</p>` : "";
    const commentary = node.human_commentary || node.commentary;
    const commentaryMarkup = commentary ? `<p class="node-detail-commentary">${escapeHtml(commentary)}</p>` : "";
    detailElement.innerHTML = `<p class="node-detail-state" style="color:${statusColor(node)}">${escapeHtml(node.status)}</p>
      <h2>${escapeHtml(humanTitle(node))}</h2>
      <section class="node-detail-section" aria-labelledby="node-interpretation"><h3 id="node-interpretation">Interpretation</h3>
        <p class="node-detail-summary">${escapeHtml(abstract)}</p>${theorem}${commentaryMarkup}</section>
      <dl>${metricRow("Depth", topologicalRank(node))}${metricRow("Layer", node.layer)}${metricRow("Domain", node.domain)}${metricRow("Repository path", node.repo_path)}${metricRow("Node ID", node.id)}</dl>
      <section class="node-detail-section"><h3>Depends on <span>${parents.length}</span></h3>${relationList(parents, "This is a foundation node with no upstream dependencies.")}</section>
      <section class="node-detail-section"><h3>Feeds into <span>${children.length}</span></h3>${relationList(children, "No direct dependents are recorded.")}</section>`;
  }

  function showTooltip(node, event) {
    let tooltip = graphElement.querySelector(".graph-tooltip");
    if (!tooltip) { tooltip = document.createElement("div"); tooltip.className = "graph-tooltip"; graphElement.appendChild(tooltip); }
    tooltip.innerHTML = `<strong>${escapeHtml(humanTitle(node))}</strong><span>${escapeHtml(node.status)} | depth ${escapeHtml(topologicalRank(node))}</span><span>${escapeHtml(node.repo_path || node.id)}</span>`;
    tooltip.hidden = false;
    const bounds = graphElement.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(event.clientX - bounds.left + 14, bounds.width - tooltip.offsetWidth - 12))}px`;
    tooltip.style.top = `${Math.max(event.clientY - bounds.top - tooltip.offsetHeight - 14, 12)}px`;
  }
  function hideTooltip() { const tooltip = graphElement.querySelector(".graph-tooltip"); if (tooltip) tooltip.hidden = true; }

  function indexGraph(graph) {
    nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    parentsById = new Map(graph.nodes.map((node) => [node.id, []]));
    childrenById = new Map(graph.nodes.map((node) => [node.id, []]));
    const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
    const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.edges) {
      const sourceId = endpointId(edge.source); const targetId = endpointId(edge.target);
      if (!nodeById.has(sourceId) || !nodeById.has(targetId)) continue;
      parentsById.get(targetId).push(sourceId); childrenById.get(sourceId).push(targetId);
      outgoing.get(sourceId).push(targetId); indegree.set(targetId, indegree.get(targetId) + 1);
    }
    rankById = new Map(graph.nodes.map((node) => [node.id, 0]));
    const ready = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort();
    let visited = 0;
    while (ready.length > 0) {
      const sourceId = ready.shift(); visited += 1;
      for (const targetId of outgoing.get(sourceId)) {
        rankById.set(targetId, Math.max(rankById.get(targetId), rankById.get(sourceId) + 1));
        indegree.set(targetId, indegree.get(targetId) - 1);
        if (indegree.get(targetId) === 0) ready.push(targetId);
      }
    }
    if (visited !== graph.nodes.length) throw new Error("graph data contains a dependency cycle");
  }

  function neighborScore(node, neighborMap, order) {
    const values = (neighborMap.get(node.id) || []).map((id) => order.get(id)).filter(Number.isFinite);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function buildLayout(nodes, edges) {
    if (nodes.length === 0) return { positions: new Map(), rows: [], width: 1200, height: 700, edges };
    const rowsByRank = new Map();
    for (const node of nodes) {
      const rank = topologicalRank(node);
      if (!rowsByRank.has(rank)) rowsByRank.set(rank, []);
      rowsByRank.get(rank).push(node);
    }
    const ranks = [...rowsByRank.keys()].sort((left, right) => left - right);
    for (const rank of ranks) rowsByRank.get(rank).sort(nodeSort);
    const order = new Map();
    const refreshOrder = (rank) => {
      const row = rowsByRank.get(rank); const divisor = Math.max(row.length - 1, 1);
      row.forEach((node, index) => order.set(node.id, row.length === 1 ? 0.5 : index / divisor));
    };
    ranks.forEach(refreshOrder);
    const sortByNeighbors = (rank, neighbors) => {
      const row = rowsByRank.get(rank);
      row.sort((left, right) => {
        const leftScore = neighborScore(left, neighbors, order); const rightScore = neighborScore(right, neighbors, order);
        if (leftScore !== null && rightScore !== null && leftScore !== rightScore) return leftScore - rightScore;
        if (leftScore !== null && rightScore === null) return -1;
        if (leftScore === null && rightScore !== null) return 1;
        return nodeSort(left, right);
      });
      refreshOrder(rank);
    };
    for (let pass = 0; pass < 5; pass += 1) {
      for (const rank of ranks.slice(1)) sortByNeighbors(rank, parentsById);
      for (const rank of ranks.slice(0, -1).reverse()) sortByNeighbors(rank, childrenById);
    }
    const maxCount = Math.max(...ranks.map((rank) => rowsByRank.get(rank).length));
    const width = Math.max(1200, (maxCount - 1) * NODE_GAP + 360);
    const graphSpan = width - 360;
    const maxRank = Math.max(...ranks);
    const positions = new Map(); const rows = [];
    for (const rank of ranks) {
      const row = rowsByRank.get(rank); const y = 104 + rank * RANK_GAP;
      rows.push({ rank, y, count: row.length });
      row.forEach((node, index) => {
        const normalized = row.length === 1 ? 0.5 : index / (row.length - 1);
        positions.set(node.id, { x: 180 + normalized * graphSpan, y });
      });
    }
    return { positions, rows, width, height: Math.max(700, 104 + maxRank * RANK_GAP + 110), edges };
  }

  function setView(next) { view = next; if (svg) svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`); }
  function fitView() {
    if (!layout) return;
    const bounds = graphElement.getBoundingClientRect(); const scale = Math.min(bounds.width / layout.width, bounds.height / layout.height) || 1;
    const width = bounds.width / scale; const height = bounds.height / scale;
    setView({ x: (layout.width - width) / 2, y: (layout.height - height) / 2, width, height });
  }

  function setSelectionStyles() {
    if (!edgeGroup || !nodeGroup) return;
    const parentIds = new Set(selectedId ? parentsById.get(selectedId) || [] : []);
    edgeGroup.querySelectorAll(".dag-edge").forEach((edge) => {
      const upstream = Boolean(selectedId && edge.dataset.target === selectedId);
      edge.classList.toggle("is-upstream", upstream);
      edge.classList.toggle("is-muted", Boolean(selectedId && !upstream));
      edge.setAttribute("marker-end", upstream ? "url(#dag-arrow-selected)" : "url(#dag-arrow)");
    });
    nodeGroup.querySelectorAll(".dag-node").forEach((element) => {
      const isSelected = element.dataset.id === selectedId; const isParent = parentIds.has(element.dataset.id);
      element.classList.toggle("is-selected", isSelected);
      element.classList.toggle("is-parent", isParent);
      element.classList.toggle("is-muted", Boolean(selectedId && !isSelected && !isParent));
      element.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function focusNeighborhood(node) {
    const selectedPoint = layout && layout.positions.get(node.id); if (!selectedPoint) return;
    const points = [selectedPoint, ...(parentsById.get(node.id) || []).map((id) => layout.positions.get(id)).filter(Boolean)];
    const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y));
    const bounds = graphElement.getBoundingClientRect(); const aspect = bounds.width / Math.max(bounds.height, 1);
    let width = Math.max(560, maxX - minX + 280); let height = Math.max(380, maxY - minY + 240);
    if (width / height < aspect) width = height * aspect; else height = width / aspect;
    width = Math.min(layout.width, width); height = Math.min(layout.height, height);
    const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
    const x = Math.max(-60, Math.min(centerX - width / 2, layout.width - width + 60));
    const y = Math.max(-50, Math.min(centerY - height / 2, layout.height - height + 50));
    setView({ x, y, width, height });
  }

  function focusNode(node) {
    if (!node) return;
    const requiredIds = [node.id, ...(parentsById.get(node.id) || [])];
    if (!layout || requiredIds.some((id) => !layout.positions.has(id))) {
      activeState = "All"; activeLayer = "All"; queryInput.value = humanTitle(node); layerSelect.value = "All";
      stateButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.state === "All")));
      renderGraph();
    }
    selectedId = node.id; renderDetail(node); setSelectionStyles(); focusNeighborhood(node);
  }

  function searchableText(node) { return `${humanTitle(node)} ${node.domain || ""} ${node.id} ${node.repo_path || ""}`.toLowerCase(); }
  function visibleGraph() {
    const query = queryInput.value.trim().toLowerCase();
    const facetNodes = sourceGraph.nodes.filter((node) => (activeState === "All" || node.status === activeState) && (activeLayer === "All" || node.layer === activeLayer));
    if (!query) {
      const ids = new Set(facetNodes.map((node) => node.id));
      return { nodes: facetNodes, edges: sourceGraph.edges.filter((edge) => ids.has(endpointId(edge.source)) && ids.has(endpointId(edge.target))) };
    }
    const matches = facetNodes.filter((node) => searchableText(node).includes(query));
    const ids = new Set(matches.map((node) => node.id));
    for (const node of matches) {
      for (const id of parentsById.get(node.id) || []) ids.add(id);
      for (const id of childrenById.get(node.id) || []) ids.add(id);
    }
    return { nodes: sourceGraph.nodes.filter((node) => ids.has(node.id)), edges: sourceGraph.edges.filter((edge) => ids.has(endpointId(edge.source)) && ids.has(endpointId(edge.target))) };
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  }

  function renderGraph() {
    const graph = visibleGraph(); layout = buildLayout(graph.nodes, graph.edges); edgeGroup.replaceChildren(); nodeGroup.replaceChildren();
    for (const row of layout.rows) {
      const band = createSvgElement("rect", { class: `dag-rank-band rank-${row.rank % 2}`, x: 24, y: row.y - 43, width: layout.width - 48, height: 86 });
      const label = createSvgElement("text", { class: "dag-depth-label", x: 48, y: row.y - 18 });
      label.textContent = `Depth ${row.rank} | ${row.count} ${row.count === 1 ? "node" : "nodes"}`;
      edgeGroup.append(band, label);
    }
    for (const edge of graph.edges) {
      const sourceId = endpointId(edge.source); const targetId = endpointId(edge.target);
      const source = layout.positions.get(sourceId); const target = layout.positions.get(targetId); if (!source || !target) continue;
      const startY = source.y + 8; const endY = target.y - 12; const middleY = startY + (endY - startY) * 0.5;
      const path = createSvgElement("path", { d: `M ${source.x} ${startY} C ${source.x} ${middleY}, ${target.x} ${middleY}, ${target.x} ${endY}`, class: "dag-edge", "marker-end": "url(#dag-arrow)" });
      path.dataset.source = sourceId; path.dataset.target = targetId; edgeGroup.appendChild(path);
    }
    for (const node of graph.nodes) {
      const point = layout.positions.get(node.id); const group = createSvgElement("g", { class: "dag-node", transform: `translate(${point.x} ${point.y})`, tabindex: 0, role: "button", "aria-label": `${humanTitle(node)}, ${node.status}, depth ${topologicalRank(node)}`, "aria-pressed": "false" });
      group.dataset.id = node.id;
      const hitArea = createSvgElement("circle", { class: "dag-node-hit", r: 14 });
      const circle = createSvgElement("circle", { class: "dag-node-dot", r: 7, fill: statusColor(node) });
      const label = createSvgElement("text", { class: "dag-node-label", x: 13, y: 0 }); label.textContent = humanTitle(node);
      const title = createSvgElement("title"); title.textContent = humanTitle(node);
      group.append(hitArea, circle, label, title);
      group.addEventListener("pointerenter", (event) => showTooltip(node, event));
      group.addEventListener("pointermove", (event) => showTooltip(node, event));
      group.addEventListener("pointerleave", hideTooltip);
      group.addEventListener("click", (event) => { event.stopPropagation(); focusNode(node); });
      group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focusNode(node); } });
      nodeGroup.appendChild(group);
    }
    statusElement.className = "graph-status graph-status-ready";
    statusElement.textContent = `${graph.nodes.length} nodes | ${graph.edges.length} directed edges | dependencies flow down`;
    if (!selectedId || !graph.nodes.some((node) => node.id === selectedId)) { selectedId = null; renderDetail(null); }
    setSelectionStyles(); fitView();
  }

  function initializeRenderer() {
    svg = createSvgElement("svg", { role: "img", "aria-label": "Directed acyclic truth graph. Dependencies are above the nodes that depend on them." });
    svg.innerHTML = '<defs><marker id="dag-arrow" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#9bb9aa"></path></marker><marker id="dag-arrow-selected" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="#7ed8ff"></path></marker></defs>';
    const viewport = createSvgElement("g"); edgeGroup = createSvgElement("g"); nodeGroup = createSvgElement("g"); edgeGroup.setAttribute("aria-hidden", "true");
    viewport.append(edgeGroup, nodeGroup); svg.appendChild(viewport); graphElement.replaceChildren(svg);
    graphElement.addEventListener("wheel", (event) => {
      event.preventDefault(); const factor = event.deltaY > 0 ? 1.12 : 0.89; const rect = graphElement.getBoundingClientRect();
      const px = view.x + ((event.clientX - rect.left) / rect.width) * view.width; const py = view.y + ((event.clientY - rect.top) / rect.height) * view.height;
      setView({ x: px - (px - view.x) * factor, y: py - (py - view.y) * factor, width: view.width * factor, height: view.height * factor });
    }, { passive: false });
    svg.addEventListener("pointerdown", (event) => { if (event.target.closest(".dag-node")) return; drag = { x: event.clientX, y: event.clientY, view: { ...view } }; svg.setPointerCapture(event.pointerId); });
    svg.addEventListener("pointermove", (event) => { if (!drag) return; const rect = graphElement.getBoundingClientRect(); const dx = (event.clientX - drag.x) * drag.view.width / rect.width; const dy = (event.clientY - drag.y) * drag.view.height / rect.height; setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy }); });
    svg.addEventListener("pointerup", () => { drag = null; });
    svg.addEventListener("click", () => { selectedId = null; renderDetail(null); setSelectionStyles(); });
    new ResizeObserver(fitView).observe(graphElement);
  }

  function populateControls(graph) {
    const layers = [...new Set(graph.nodes.map((node) => node.layer).filter(Boolean))].sort((left, right) => layerRank(left) - layerRank(right) || left.localeCompare(right));
    layerSelect.append(...layers.map((layer) => { const option = document.createElement("option"); option.value = layer; option.textContent = layer; return option; }));
    const datalist = document.querySelector("#node-options");
    datalist.append(...graph.nodes.slice().sort(nodeSort).map((node) => { const option = document.createElement("option"); option.value = humanTitle(node); option.label = node.domain || node.id; return option; }));
  }

  function updateProvenance(graph) {
    const snapshot = graph.source_snapshot || {}; const counts = graph.counts || {};
    document.querySelector("#source-commit").textContent = snapshot.source_commit ? snapshot.source_commit.slice(0, 12) : "unknown";
    document.querySelector("#blessed-by").textContent = snapshot.blessed_by || "unknown";
    document.querySelector("#closed-count").textContent = counts.dag_closed ?? counts.shown_closed ?? "-";
    document.querySelector("#open-count").textContent = counts.dag_open ?? counts.shown_open ?? "-";
    document.querySelector("#edge-count").textContent = counts.edges ?? graph.edges.length;
  }

  detailElement.addEventListener("click", (event) => { const button = event.target.closest("[data-node-id]"); if (button) focusNode(nodeById.get(button.dataset.nodeId)); });
  stateButtons.forEach((button) => button.addEventListener("click", () => { activeState = button.dataset.state; stateButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button))); renderGraph(); }));
  layerSelect.addEventListener("change", () => { activeLayer = layerSelect.value; renderGraph(); });
  queryInput.addEventListener("input", renderGraph);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault(); const query = queryInput.value.trim().toLowerCase(); if (!query) return;
    const exact = sourceGraph.nodes.find((node) => node.id.toLowerCase() === query || humanTitle(node).toLowerCase() === query);
    const match = exact || sourceGraph.nodes.find((node) => searchableText(node).includes(query));
    if (match) focusNode(match);
  });
  fitButton.addEventListener("click", fitView);

  fetch("data/truth-graph.v1.json").then((response) => {
    if (!response.ok) throw new Error(`graph data returned HTTP ${response.status}`); return response.json();
  }).then((graph) => {
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("graph data is missing its nodes or edges array");
    sourceGraph = graph; indexGraph(graph); populateControls(graph); updateProvenance(graph); initializeRenderer(); renderGraph();
  }).catch((error) => {
    statusElement.className = "graph-status graph-status-error"; statusElement.textContent = `Unable to render the topology: ${error.message}`;
    detailElement.innerHTML = '<p class="node-detail-empty">The topology is temporarily unavailable.</p>';
  });
}());
