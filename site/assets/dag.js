(function () {
  "use strict";

  // Vertical bands place each trust layer at a fixed height, so the 3D tower reads
  // bottom-up exactly like the frozen Lean stratification: foundation below, frontier above.
  const COLORS = {
    closed: "#42c47a",
    open: "#f2ad4a",
    tail: "#b69bff",
    semantic: "#8aa0b4",
    selected: "#7ed8ff"
  };
  const LAYER_Y = {
    "D5/S0": -320,
    "D5/S1": -110,
    "D5/S3": 110,
    "D5/X_Frontier": 320,
    Root: 470
  };
  const LAYER_ORDER = ["D5/S0", "D5/S1", "D5/S3", "D5/X_Frontier", "Root"];

  const graphElement = document.querySelector("#graph");
  const statusElement = document.querySelector("#graph-status");
  const detailElement = document.querySelector("#node-detail");
  const layerSelect = document.querySelector("#layer-filter");
  const queryInput = document.querySelector("#node-query");
  const searchForm = document.querySelector("#node-search");
  const fitButton = document.querySelector("#fit-graph");
  const motionButton = document.querySelector("#toggle-motion");
  const stateButtons = [...document.querySelectorAll("[data-state]")];

  let renderer = null;
  let sourceGraph = { nodes: [], edges: [] };
  let activeState = "All";
  let activeLayer = "All";
  let selectedId = null;
  let paused = false;
  let initialFitDone = false;

  let nodeById = new Map();
  let parentsById = new Map();
  let childrenById = new Map();
  let rankById = new Map();

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hash(value) {
    let result = 2166136261;
    for (const character of value) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  // Human-readable name for a node: the Blueprint title if present, otherwise a
  // de-camel-cased leaf of the Lean module path so raw filenames never surface.
  function humanTitle(node) {
    if (node.human_title && node.human_title !== "None") return node.human_title;
    const leaf = String(node.repo_path || node.id || "Node").replace(/\.lean$/, "").split("/").pop();
    const words = leaf
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
    return node.domain && node.domain.toLowerCase() !== words.toLowerCase()
      ? `${node.domain}: ${words}`
      : words;
  }

  function endpointId(endpoint) {
    return typeof endpoint === "object" ? endpoint.id : endpoint;
  }

  function topologicalRank(node) {
    if (!node) return 0;
    const ranked = rankById.get(node.id);
    if (ranked !== undefined) return ranked;
    const depth = Number(node.depth);
    return Number.isFinite(depth) ? depth : 0;
  }

  function nodeColor(node) {
    if (node.id === selectedId) return COLORS.selected;
    return COLORS[node.state] || COLORS.semantic;
  }

  function seedPosition(node) {
    const domainHash = hash(`${node.layer}/${node.domain}`);
    const nodeHash = hash(node.id);
    const angle = (domainHash % 360) * Math.PI / 180;
    const radius = 130 + (domainHash % 170);
    return {
      x: Math.cos(angle) * radius + (nodeHash % 51) - 25,
      y: LAYER_Y[node.layer] ?? 0,
      z: Math.sin(angle) * radius + ((nodeHash >>> 8) % 51) - 25
    };
  }

  function relatedNodes(ids) {
    return (ids || [])
      .map((id) => nodeById.get(id))
      .filter(Boolean)
      .sort((left, right) =>
        topologicalRank(left) - topologicalRank(right)
        || humanTitle(left).localeCompare(humanTitle(right)));
  }

  function relationList(nodes, emptyMessage) {
    if (nodes.length === 0) {
      return `<p class="node-relation-empty">${escapeHtml(emptyMessage)}</p>`;
    }
    return `<ul class="node-relations">${nodes.map((node) => `
      <li><button type="button" data-node-id="${escapeHtml(node.id)}">
        <span>${escapeHtml(humanTitle(node))}</span>
        <small>Depth ${escapeHtml(topologicalRank(node))} &middot; ${escapeHtml(node.status)}</small>
      </button></li>`).join("")}</ul>`;
  }

  function metricRow(name, value) {
    return value === undefined || value === null || value === ""
      ? ""
      : `<div><dt>${escapeHtml(name)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`;
  }

  function renderDetail(node) {
    if (!node) {
      detailElement.innerHTML = '<p class="node-detail-empty">Select a node to reveal its interpretation and the dependencies it rests on.</p>';
      return;
    }
    const parents = relatedNodes(parentsById.get(node.id));
    const children = relatedNodes(childrenById.get(node.id));
    const abstract = node.human_abstract && node.human_abstract !== "None"
      ? node.human_abstract
      : "No Blueprint interpretation is recorded for this node yet.";
    const theorem = node.human_theorem && node.human_theorem !== "None"
      ? `<p class="node-detail-theorem"><strong>Theorem</strong>${escapeHtml(node.human_theorem)}</p>`
      : "";
    detailElement.innerHTML = `
      <p class="node-detail-state" style="color:${nodeColor(node)}">${escapeHtml(node.status)}</p>
      <h2>${escapeHtml(humanTitle(node))}</h2>
      <section class="node-detail-section" aria-labelledby="node-interpretation">
        <h3 id="node-interpretation">Interpretation</h3>
        <p class="node-detail-summary">${escapeHtml(abstract)}</p>${theorem}
      </section>
      <dl>
        ${metricRow("Depth", topologicalRank(node))}
        ${metricRow("Layer", node.layer)}
        ${metricRow("Domain", node.domain)}
        ${metricRow("Repository path", node.repo_path)}
        ${metricRow("Node ID", node.id)}
      </dl>
      <section class="node-detail-section">
        <h3>Depends on <span>${parents.length}</span></h3>
        ${relationList(parents, "This is a foundation node with no upstream dependencies.")}
      </section>
      <section class="node-detail-section">
        <h3>Feeds into <span>${children.length}</span></h3>
        ${relationList(children, "No direct dependents are recorded.")}
      </section>`;
  }

  function liveNode(id) {
    if (!renderer) return null;
    return renderer.graphData().nodes.find((candidate) => candidate.id === id) || null;
  }

  function focusNode(node) {
    if (!node || !renderer) return;
    selectedId = node.id;
    renderDetail(node);
    renderer
      .nodeColor(nodeColor)
      .linkWidth((link) =>
        endpointId(link.target) === selectedId || endpointId(link.source) === selectedId ? 1.9 : 0.4)
      .linkColor((link) =>
        endpointId(link.target) === selectedId || endpointId(link.source) === selectedId
          ? "rgba(126, 216, 255, 0.6)"
          : "rgba(171, 205, 196, 0.28)");
    const distance = 130;
    const length = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
    const ratio = 1 + distance / length;
    renderer.cameraPosition(
      { x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio },
      node,
      900
    );
  }

  function focusById(id) {
    const node = liveNode(id);
    if (node) {
      focusNode(node);
      statusElement.textContent = `Focused ${humanTitle(node)}`;
    }
  }

  function clearSelection() {
    selectedId = null;
    renderDetail(null);
    if (renderer) {
      renderer
        .nodeColor(nodeColor)
        .linkWidth(0.45)
        .linkColor(() => "rgba(171, 205, 196, 0.32)");
    }
  }

  function indexGraph(graph) {
    nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    parentsById = new Map(graph.nodes.map((node) => [node.id, []]));
    childrenById = new Map(graph.nodes.map((node) => [node.id, []]));
    const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
    const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.edges) {
      const sourceId = endpointId(edge.source);
      const targetId = endpointId(edge.target);
      if (!nodeById.has(sourceId) || !nodeById.has(targetId)) continue;
      parentsById.get(targetId).push(sourceId);
      childrenById.get(sourceId).push(targetId);
      outgoing.get(sourceId).push(targetId);
      indegree.set(targetId, indegree.get(targetId) + 1);
    }
    // Kahn longest-path rank: the true proof depth of each node in the frozen DAG.
    rankById = new Map(graph.nodes.map((node) => [node.id, 0]));
    const ready = graph.nodes
      .filter((node) => indegree.get(node.id) === 0)
      .map((node) => node.id)
      .sort();
    while (ready.length > 0) {
      const sourceId = ready.shift();
      for (const targetId of outgoing.get(sourceId)) {
        rankById.set(targetId, Math.max(rankById.get(targetId), rankById.get(sourceId) + 1));
        indegree.set(targetId, indegree.get(targetId) - 1);
        if (indegree.get(targetId) === 0) ready.push(targetId);
      }
    }
  }

  function visibleGraph() {
    const nodes = sourceGraph.nodes.filter((node) =>
      (activeState === "All" || node.status === activeState)
      && (activeLayer === "All" || node.layer === activeLayer));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = sourceGraph.edges.filter((edge) =>
      ids.has(endpointId(edge.source)) && ids.has(endpointId(edge.target)));
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) {
      degree.set(endpointId(edge.source), (degree.get(endpointId(edge.source)) || 0) + 1);
      degree.set(endpointId(edge.target), (degree.get(endpointId(edge.target)) || 0) + 1);
    }
    return {
      nodes: nodes.map((node) => ({
        ...node,
        ...seedPosition(node),
        fy: LAYER_Y[node.layer] ?? 0,
        degree: degree.get(node.id) || 0
      })),
      links: edges.map((edge) => ({ source: endpointId(edge.source), target: endpointId(edge.target) }))
    };
  }

  function applyFilters() {
    if (!renderer) return;
    clearSelection();
    const graph = visibleGraph();
    renderer.graphData(graph);
    statusElement.className = "graph-status graph-status-ready";
    statusElement.textContent = `${graph.nodes.length} nodes | ${graph.links.length} dependency edges`;
    window.setTimeout(() => renderer.zoomToFit(700, 70), 350);
  }

  function initializeRenderer(graph) {
    if (typeof window.ForceGraph3D !== "function") {
      throw new Error("The 3D renderer could not be loaded from the CDN. Check the network connection and reload.");
    }

    renderer = window.ForceGraph3D()(graphElement)
      .backgroundColor("#07100e")
      .showNavInfo(false)
      .nodeLabel((node) => `
        <div class="graph-tooltip">
          <strong>${escapeHtml(humanTitle(node))}</strong>
          <span>${escapeHtml(node.status)} &middot; depth ${escapeHtml(topologicalRank(node))}</span>
          <span>${escapeHtml(node.layer)} / ${escapeHtml(node.domain)}</span>
        </div>`)
      .nodeColor(nodeColor)
      .nodeVal((node) => 1.4 + Math.sqrt((node.degree || 0) + 1) * 0.9 + Math.max(0, topologicalRank(node)) * 0.02)
      .nodeResolution(9)
      .linkColor(() => "rgba(171, 205, 196, 0.32)")
      .linkWidth(0.45)
      .linkDirectionalArrowLength(2.8)
      .linkDirectionalArrowRelPos(0.9)
      .linkDirectionalArrowColor(() => "rgba(196, 224, 216, 0.7)")
      .onNodeClick(focusNode)
      .onNodeHover((node) => { graphElement.style.cursor = node ? "pointer" : "grab"; })
      .onBackgroundClick(clearSelection)
      .onEngineStop(() => {
        if (!initialFitDone) {
          initialFitDone = true;
          renderer.zoomToFit(900, 65);
        }
      })
      .d3AlphaDecay(0.035)
      .d3VelocityDecay(0.38)
      .cooldownTime(9000);

    const resize = () => {
      renderer.width(graphElement.clientWidth);
      renderer.height(graphElement.clientHeight);
    };
    new ResizeObserver(resize).observe(graphElement);
    resize();
    renderer.graphData(graph);
  }

  function populateControls(graph) {
    const layers = [...new Set(graph.nodes.map((node) => node.layer))]
      .sort((left, right) => LAYER_ORDER.indexOf(left) - LAYER_ORDER.indexOf(right));
    layerSelect.append(...layers.map((layer) => {
      const option = document.createElement("option");
      option.value = layer;
      option.textContent = layer;
      return option;
    }));

    const options = graph.nodes
      .slice()
      .sort((left, right) => humanTitle(left).localeCompare(humanTitle(right)))
      .map((node) => {
        const option = document.createElement("option");
        option.value = node.id;
        option.label = humanTitle(node);
        return option;
      });
    document.querySelector("#node-options").append(...options);
  }

  function updateProvenance(graph) {
    const snapshot = graph.source_snapshot || {};
    const counts = graph.counts || {};
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    };
    setText("#source-commit", snapshot.source_commit ? String(snapshot.source_commit).slice(0, 12) : "unknown");
    setText("#blessed-by", snapshot.blessed_by || "unknown");
    setText("#closed-count", counts.dag_closed ?? counts.closed ?? counts.shown_closed ?? "-");
    setText("#open-count", counts.dag_open ?? counts.open ?? counts.shown_open ?? "-");
    setText("#edge-count", counts.edges ?? graph.edges.length);
  }

  // Clicking a dependency in the detail panel flies the camera to that node.
  detailElement.addEventListener("click", (event) => {
    const button = event.target.closest("[data-node-id]");
    if (button) focusById(button.dataset.nodeId);
  });

  stateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeState = button.dataset.state;
      stateButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      applyFilters();
    });
  });

  layerSelect.addEventListener("change", () => {
    activeLayer = layerSelect.value;
    applyFilters();
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = queryInput.value.trim().toLowerCase();
    if (!query) {
      statusElement.textContent = "Enter a node id or a Blueprint title.";
      return;
    }
    const nodes = renderer ? renderer.graphData().nodes : [];
    const node = nodes.find((candidate) => candidate.id.toLowerCase() === query)
      || nodes.find((candidate) =>
        humanTitle(candidate).toLowerCase().includes(query) || candidate.id.toLowerCase().includes(query));
    if (node) {
      focusNode(node);
      statusElement.textContent = `Focused ${humanTitle(node)}`;
    } else {
      statusElement.textContent = `No visible node matches "${queryInput.value.trim()}".`;
    }
  });

  fitButton.addEventListener("click", () => renderer && renderer.zoomToFit(700, 70));
  motionButton.addEventListener("click", () => {
    if (!renderer) return;
    paused = !paused;
    motionButton.setAttribute("aria-pressed", String(paused));
    motionButton.textContent = paused ? "Resume" : "Pause";
    if (paused) renderer.pauseAnimation();
    else renderer.resumeAnimation();
  });

  fetch("data/truth-graph.v1.json")
    .then((response) => {
      if (!response.ok) throw new Error(`graph data returned HTTP ${response.status}`);
      return response.json();
    })
    .then((graph) => {
      if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        throw new Error("graph data is missing its nodes or edges array");
      }
      sourceGraph = graph;
      indexGraph(graph);
      populateControls(graph);
      updateProvenance(graph);
      const visible = visibleGraph();
      initializeRenderer(visible);
      statusElement.className = "graph-status graph-status-ready";
      statusElement.textContent = `${visible.nodes.length} nodes | ${visible.links.length} dependency edges`;
    })
    .catch((error) => {
      statusElement.className = "graph-status graph-status-error";
      statusElement.textContent = `Unable to render the truth DAG: ${error.message}`;
      detailElement.innerHTML = '<p class="node-detail-empty">The graph is temporarily unavailable. The overview and provenance remain readable.</p>';
    });
}());
