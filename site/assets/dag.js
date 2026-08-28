(function () {
  "use strict";

  const COLORS = { Closed: "#3ea86b", Open: "#8b9691", Tail: "#d39432", Semantic: "#4b91b8", selected: "#f1f7f3" };
  const LAYER_ORDER = ["D5/S0", "D5/S1", "D5/S3", "D5/X_Frontier", "Root"];
  const graphElement = document.querySelector("#graph");
  const statusElement = document.querySelector("#graph-status");
  const detailElement = document.querySelector("#node-detail");
  const layerSelect = document.querySelector("#layer-filter");
  const queryInput = document.querySelector("#node-query");
  const searchForm = document.querySelector("#node-search");
  const fitButton = document.querySelector("#fit-graph");
  const stateButtons = [...document.querySelectorAll("[data-state]")];
  let sourceGraph = { nodes: [], edges: [] };
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

  function depth(node) {
    const value = Number(node.true_depth ?? node.depth);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function statusColor(node) { return COLORS[node.status] || COLORS.Semantic; }
  function endpointId(endpoint) { return typeof endpoint === "object" ? endpoint.id : endpoint; }
  function layerRank(layer) { const known = LAYER_ORDER.indexOf(layer); return known < 0 ? LAYER_ORDER.length : known; }
  function metricRow(name, value) {
    return value === undefined || value === null || value === "" ? "" : `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function renderDetail(node) {
    if (!node) {
      detailElement.innerHTML = '<p class="node-detail-empty">Select a node to inspect its human description, proof state, and source path.</p>';
      return;
    }
    const description = node.human_abstract || node.human_theorem || "No Blueprint description is available for this node.";
    detailElement.innerHTML = `<p class="node-detail-state" style="color:${statusColor(node)}">${escapeHtml(node.status)}</p>
      <h2>${escapeHtml(humanTitle(node))}</h2><p class="node-detail-summary">${escapeHtml(description)}</p>
      <p class="node-detail-id">${escapeHtml(node.id)}</p><dl>
        ${metricRow("Layer", node.layer)}${metricRow("Domain", node.domain)}${metricRow("Depth", depth(node))}
        ${metricRow("Repository path", node.repo_path)}${metricRow("Theorem", node.human_theorem)}
        ${metricRow("In / out degree", node.in_degree === undefined ? null : `${node.in_degree} / ${node.out_degree}`)}</dl>`;
  }

  function showTooltip(node, event) {
    let tooltip = graphElement.querySelector(".graph-tooltip");
    if (!tooltip) { tooltip = document.createElement("div"); tooltip.className = "graph-tooltip"; graphElement.appendChild(tooltip); }
    const description = node.human_abstract || node.human_theorem || "No Blueprint description available.";
    tooltip.innerHTML = `<strong>${escapeHtml(humanTitle(node))}</strong><span>${escapeHtml(description)}</span><span>${escapeHtml(node.status)} | depth ${escapeHtml(depth(node))}</span><span>${escapeHtml(node.repo_path || "source path unavailable")}</span>`;
    tooltip.hidden = false;
    const bounds = graphElement.getBoundingClientRect();
    tooltip.style.left = `${Math.min(event.clientX - bounds.left + 14, bounds.width - tooltip.offsetWidth - 12)}px`;
    tooltip.style.top = `${Math.max(event.clientY - bounds.top - tooltip.offsetHeight - 14, 12)}px`;
  }
  function hideTooltip() { const tooltip = graphElement.querySelector(".graph-tooltip"); if (tooltip) tooltip.hidden = true; }

  function buildLayout(nodes, edges) {
    const groups = new Map();
    for (const node of nodes) {
      const key = `${node.layer || "Root"}\u0000${node.domain || "Other"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    }
    const groupList = [...groups.entries()].sort(([left], [right]) => {
      const [ll, ld] = left.split("\u0000"); const [rl, rd] = right.split("\u0000");
      return layerRank(ll) - layerRank(rl) || ll.localeCompare(rl) || ld.localeCompare(rd);
    });
    const positions = new Map(); const bands = []; let y = 76;
    for (const [groupKey, members] of groupList) {
      const byDepth = new Map();
      for (const node of members) { if (!byDepth.has(depth(node))) byDepth.set(depth(node), []); byDepth.get(depth(node)).push(node); }
      const height = Math.max(...[...byDepth.values()].map((items) => items.length), 1) * 34 + 38;
      const [layer, domain] = groupKey.split("\u0000");
      bands.push({ label: `${layer.replace("\u0000", "")} / ${domain}`, y, height });
      for (const [nodeDepth, atDepth] of byDepth) {
        atDepth.sort((a, b) => humanTitle(a).localeCompare(humanTitle(b)) || a.id.localeCompare(b.id));
        atDepth.forEach((node, index) => positions.set(node.id, { x: 90 + nodeDepth * 260, y: y + 30 + index * 34 }));
      }
      y += height;
    }
    const maxDepth = Math.max(...nodes.map(depth), 0);
    return { positions, bands, width: 260 * maxDepth + 380, height: Math.max(y + 40, 520), edges };
  }

  function setView(next) { view = next; if (svg) svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`); }
  function fitView() {
    if (!layout) return;
    const bounds = graphElement.getBoundingClientRect(); const scale = Math.min(bounds.width / layout.width, bounds.height / layout.height) || 1;
    const width = bounds.width / scale; const height = bounds.height / scale;
    setView({ x: (layout.width - width) / 2, y: (layout.height - height) / 2, width, height });
  }

  function renderNodes() {
    if (!nodeGroup) return;
    nodeGroup.querySelectorAll("g.dag-node").forEach((element) => {
      const node = sourceGraph.nodes.find((candidate) => candidate.id === element.dataset.id); const circle = element.querySelector("circle");
      if (!node || !circle) return;
      circle.setAttribute("fill", node.id === selectedId ? COLORS.selected : statusColor(node));
      circle.setAttribute("stroke", node.id === selectedId ? statusColor(node) : "#dce9e1");
      circle.setAttribute("stroke-width", node.id === selectedId ? "3" : "1.2");
    });
  }

  function focusNode(node) {
    const point = layout && layout.positions.get(node.id); if (!point) return;
    selectedId = node.id; renderDetail(node);
    const bounds = graphElement.getBoundingClientRect(); const width = Math.min(layout.width, Math.max(420, bounds.width / 1.25)); const height = Math.min(layout.height, Math.max(260, bounds.height / 1.25));
    setView({ x: point.x - width * 0.35, y: point.y - height * 0.5, width, height }); renderNodes();
  }

  function visibleGraph() {
    const query = queryInput.value.trim().toLowerCase();
    const nodes = sourceGraph.nodes.filter((node) => {
      const searchable = `${humanTitle(node)} ${node.domain || ""} ${node.id}`.toLowerCase();
      return (activeState === "All" || node.status === activeState) && (activeLayer === "All" || node.layer === activeLayer) && (!query || searchable.includes(query));
    });
    const ids = new Set(nodes.map((node) => node.id));
    return { nodes, edges: sourceGraph.edges.filter((edge) => ids.has(endpointId(edge.source)) && ids.has(endpointId(edge.target))) };
  }

  function renderGraph() {
    const graph = visibleGraph(); layout = buildLayout(graph.nodes, graph.edges); edgeGroup.replaceChildren(); nodeGroup.replaceChildren();
    for (const band of layout.bands) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "dag-group-label"); label.setAttribute("x", "18"); label.setAttribute("y", String(band.y + 18)); label.textContent = band.label; edgeGroup.appendChild(label);
    }
    for (const depthValue of [...new Set(graph.nodes.map(depth))].sort((a, b) => a - b)) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "dag-depth-label"); label.setAttribute("x", String(90 + depthValue * 260)); label.setAttribute("y", "28"); label.textContent = `Depth ${depthValue}`; edgeGroup.appendChild(label);
    }
    for (const edge of graph.edges) {
      const source = layout.positions.get(endpointId(edge.source)); const target = layout.positions.get(endpointId(edge.target)); if (!source || !target) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); const bend = Math.max(42, (target.x - source.x) * 0.42);
      path.setAttribute("d", `M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`); path.setAttribute("class", "dag-edge"); path.setAttribute("marker-end", "url(#dag-arrow)"); edgeGroup.appendChild(path);
    }
    for (const node of graph.nodes) {
      const point = layout.positions.get(node.id); const group = document.createElementNS("http://www.w3.org/2000/svg", "g"); group.setAttribute("class", "dag-node"); group.dataset.id = node.id; group.setAttribute("transform", `translate(${point.x} ${point.y})`);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle"); circle.setAttribute("r", "8"); circle.setAttribute("fill", node.id === selectedId ? COLORS.selected : statusColor(node)); circle.setAttribute("stroke", node.id === selectedId ? statusColor(node) : "#dce9e1"); circle.setAttribute("stroke-width", node.id === selectedId ? "3" : "1.2");
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text"); label.setAttribute("class", "dag-node-label"); label.textContent = humanTitle(node); group.append(circle, label);
      group.addEventListener("pointerenter", (event) => showTooltip(node, event)); group.addEventListener("pointermove", (event) => showTooltip(node, event)); group.addEventListener("pointerleave", hideTooltip); group.addEventListener("click", (event) => { event.stopPropagation(); focusNode(node); }); nodeGroup.appendChild(group);
    }
    statusElement.className = "graph-status graph-status-ready"; statusElement.textContent = `${graph.nodes.length} nodes | ${graph.edges.length} dependency edges${queryInput.value.trim() ? " | filter active" : ""}`;
    if (!selectedId || !graph.nodes.some((node) => node.id === selectedId)) { selectedId = null; renderDetail(null); }
    fitView();
  }

  function initializeRenderer() {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Directed truth DAG grouped by tower layer, domain, and depth");
    svg.innerHTML = '<defs><marker id="dag-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#9bb9aa"></path></marker></defs>';
    const viewport = document.createElementNS("http://www.w3.org/2000/svg", "g"); edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g"); nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g"); edgeGroup.setAttribute("aria-hidden", "true"); viewport.append(edgeGroup, nodeGroup); svg.appendChild(viewport); graphElement.replaceChildren(svg);
    graphElement.addEventListener("wheel", (event) => { event.preventDefault(); const factor = event.deltaY > 0 ? 1.12 : 0.89; const rect = graphElement.getBoundingClientRect(); const px = view.x + ((event.clientX - rect.left) / rect.width) * view.width; const py = view.y + ((event.clientY - rect.top) / rect.height) * view.height; setView({ x: px - (px - view.x) * factor, y: py - (py - view.y) * factor, width: view.width * factor, height: view.height * factor }); }, { passive: false });
    svg.addEventListener("pointerdown", (event) => { if (event.target.closest(".dag-node")) return; drag = { x: event.clientX, y: event.clientY, view: { ...view } }; svg.setPointerCapture(event.pointerId); });
    svg.addEventListener("pointermove", (event) => { if (!drag) return; const rect = graphElement.getBoundingClientRect(); const dx = (event.clientX - drag.x) * drag.view.width / rect.width; const dy = (event.clientY - drag.y) * drag.view.height / rect.height; setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy }); });
    svg.addEventListener("pointerup", () => { drag = null; }); svg.addEventListener("click", () => { selectedId = null; renderDetail(null); renderNodes(); }); new ResizeObserver(fitView).observe(graphElement);
  }

  function populateControls(graph) {
    const layers = [...new Set(graph.nodes.map((node) => node.layer).filter(Boolean))].sort((a, b) => layerRank(a) - layerRank(b) || a.localeCompare(b));
    layerSelect.append(...layers.map((layer) => { const option = document.createElement("option"); option.value = layer; option.textContent = layer; return option; }));
    const datalist = document.querySelector("#node-options"); datalist.append(...graph.nodes.map((node) => { const option = document.createElement("option"); option.value = humanTitle(node); option.label = node.domain || node.id; return option; }));
  }
  function updateProvenance(graph) { const snapshot = graph.source_snapshot || {}; const counts = graph.counts || {}; document.querySelector("#source-commit").textContent = snapshot.source_commit ? snapshot.source_commit.slice(0, 12) : "unknown"; document.querySelector("#blessed-by").textContent = snapshot.blessed_by || "unknown"; document.querySelector("#closed-count").textContent = counts.dag_closed ?? counts.shown_closed ?? "-"; document.querySelector("#open-count").textContent = counts.dag_open ?? counts.shown_open ?? "-"; document.querySelector("#edge-count").textContent = counts.edges ?? graph.edges.length; }
  stateButtons.forEach((button) => button.addEventListener("click", () => { activeState = button.dataset.state; stateButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button))); renderGraph(); }));
  layerSelect.addEventListener("change", () => { activeLayer = layerSelect.value; renderGraph(); }); queryInput.addEventListener("input", renderGraph); searchForm.addEventListener("submit", (event) => { event.preventDefault(); const query = queryInput.value.trim().toLowerCase(); const node = sourceGraph.nodes.find((candidate) => candidate.id.toLowerCase() === query || humanTitle(candidate).toLowerCase() === query); if (node) focusNode(node); }); fitButton.addEventListener("click", fitView);
  fetch("data/truth-graph.v1.json").then((response) => { if (!response.ok) throw new Error(`graph data returned HTTP ${response.status}`); return response.json(); }).then((graph) => { if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("graph data is missing its nodes or edges array"); sourceGraph = graph; populateControls(graph); updateProvenance(graph); initializeRenderer(); renderGraph(); }).catch((error) => { statusElement.className = "graph-status graph-status-error"; statusElement.textContent = `Unable to render the topology: ${error.message}`; detailElement.innerHTML = '<p class="node-detail-empty">The topology is temporarily unavailable.</p>'; });
}());
