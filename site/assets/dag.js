(function () {
  "use strict";

  const COLORS = {
    closed: "#42c47a",
    open: "#f2ad4a",
    tail: "#b69bff",
    selected: "#7ed8ff"
  };
  const LEGACY_LAYER_Y = {
    "D5/S0": -300,
    "D5/S1": -100,
    "D5/S3": 120,
    "D5/X_Frontier": 320,
    Root: 460
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

  function trueDepth(node) {
    const value = Number(node.true_depth ?? node.depth);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function verticalPosition(node) {
    if (sourceGraph.schema_version === "pages-certified-topology-view.v1") {
      return -trueDepth(node) * 62;
    }
    return LEGACY_LAYER_Y[node.layer] ?? 0;
  }

  function seedPosition(node) {
    const domainHash = hash(`${node.layer}/${node.domain}`);
    const nodeHash = hash(node.id);
    const angle = (domainHash % 360) * Math.PI / 180;
    const radius = 120 + (domainHash % 150);
    return {
      x: Math.cos(angle) * radius + (nodeHash % 51) - 25,
      y: verticalPosition(node),
      z: Math.sin(angle) * radius + ((nodeHash >>> 8) % 51) - 25
    };
  }

  function endpointId(endpoint) {
    return typeof endpoint === "object" ? endpoint.id : endpoint;
  }

  function metricRow(name, value) {
    return value === undefined || value === null
      ? ""
      : `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function renderDetail(node) {
    if (!node) {
      detailElement.innerHTML = '<p class="node-detail-empty">Select a node to inspect its certified topology metrics and provenance.</p>';
      return;
    }
    const axioms = Array.isArray(node.axiom_closure) && node.axiom_closure.length > 0
      ? node.axiom_closure.join(", ")
      : "none recorded";
    detailElement.innerHTML = `
      <p class="node-detail-state state-${escapeHtml(node.state)}">${escapeHtml(node.status)}</p>
      <h2>${escapeHtml(node.title)}</h2>
      <p class="node-detail-id">${escapeHtml(node.id)}</p>
      <dl>
        ${metricRow("Layer", node.layer)}
        ${metricRow("Domain", node.domain)}
        ${metricRow("True depth", trueDepth(node))}
        ${metricRow("Height", node.height)}
        ${metricRow("In / out degree", node.in_degree === undefined ? node.degree : `${node.in_degree} / ${node.out_degree}`)}
        ${metricRow("Ancestors / descendants", node.ancestor_count === undefined ? null : `${node.ancestor_count} / ${node.descendant_count}`)}
        ${metricRow("Structural blast radius", node.structural_blast_radius)}
        ${metricRow("Dominated nodes", node.dominated_node_count)}
        ${metricRow("Component", node.component_id)}
        ${metricRow("Axiom tier", node.axiom_tier ?? "unclassified")}
        ${metricRow("Axiom closure", axioms)}
      </dl>`;
  }

  function focusNode(node) {
    if (!node || !renderer) return;
    selectedId = node.id;
    renderDetail(node);
    renderer.nodeColor((candidate) => candidate.id === selectedId ? COLORS.selected : COLORS[candidate.state] || COLORS.tail);
    const distance = 115;
    const length = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
    const ratio = 1 + distance / length;
    renderer.cameraPosition(
      { x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio },
      node,
      900
    );
  }

  function visibleGraph() {
    const nodes = sourceGraph.nodes.filter((node) =>
      (activeState === "All" || node.status === activeState) &&
      (activeLayer === "All" || node.layer === activeLayer)
    );
    const ids = new Set(nodes.map((node) => node.id));
    const edges = sourceGraph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    return {
      nodes: nodes.map((node) => ({
        ...node,
        ...seedPosition(node),
        fy: verticalPosition(node),
        degree: degree.get(node.id) || 0
      })),
      links: edges.map((edge) => ({ ...edge }))
    };
  }

  function applyFilters() {
    if (!renderer) return;
    selectedId = null;
    renderDetail(null);
    const graph = visibleGraph();
    renderer.graphData(graph);
    statusElement.className = "graph-status graph-status-ready";
    statusElement.textContent = `${graph.nodes.length} nodes | ${graph.links.length} structural edges`;
    window.setTimeout(() => renderer.zoomToFit(700, 65), 350);
  }

  function nodeValue(node) {
    const blast = Number(node.structural_blast_radius);
    const dominated = Number(node.dominated_node_count);
    if (Number.isFinite(blast) && blast > 0) {
      return 1.5 + Math.log2(blast + 1) * 1.15 +
        (Number.isFinite(dominated) ? Math.log2(dominated + 1) * 0.35 : 0);
    }
    return 1.4 + Math.sqrt((node.degree || 0) + 1) * 0.9 + trueDepth(node) * 0.025;
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
          <strong>${escapeHtml(node.title)}</strong>
          <span>${escapeHtml(node.status)} | true depth ${escapeHtml(trueDepth(node))}</span>
          <span>blast ${escapeHtml(node.structural_blast_radius ?? "n/a")} | dominated ${escapeHtml(node.dominated_node_count ?? "n/a")}</span>
          <span>${escapeHtml(node.id)}</span>
        </div>`)
      .nodeColor((node) => node.id === selectedId ? COLORS.selected : COLORS[node.state] || COLORS.tail)
      .nodeVal(nodeValue)
      .nodeResolution(8)
      .linkColor((link) => link.layer === "intuition-candidate"
        ? "rgba(126, 216, 255, 0.68)"
        : "rgba(171, 205, 196, 0.34)")
      .linkWidth((link) => {
        if (endpointId(link.target) === selectedId || endpointId(link.source) === selectedId) return 1.8;
        return link.layer === "intuition-candidate" ? 1.05 : 0.45;
      })
      .linkDirectionalArrowLength(2.8)
      .linkDirectionalArrowRelPos(0.88)
      .linkDirectionalArrowColor((link) => link.layer === "intuition-candidate"
        ? "rgba(126, 216, 255, 0.9)"
        : "rgba(196, 224, 216, 0.72)")
      .onNodeClick(focusNode)
      .onNodeHover((node) => { graphElement.style.cursor = node ? "pointer" : "grab"; })
      .onBackgroundClick(() => {
        selectedId = null;
        renderDetail(null);
        renderer.nodeColor((node) => COLORS[node.state] || COLORS.tail);
      })
      .onEngineStop(() => {
        if (!initialFitDone) {
          initialFitDone = true;
          renderer.zoomToFit(900, 60);
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
      .sort((left, right) => {
        const leftKnown = LAYER_ORDER.indexOf(left);
        const rightKnown = LAYER_ORDER.indexOf(right);
        if (leftKnown >= 0 || rightKnown >= 0) {
          if (leftKnown < 0) return 1;
          if (rightKnown < 0) return -1;
          return leftKnown - rightKnown;
        }
        return left.localeCompare(right);
      });
    layerSelect.append(...layers.map((layer) => {
      const option = document.createElement("option");
      option.value = layer;
      option.textContent = layer;
      return option;
    }));

    const options = graph.nodes.map((node) => {
      const option = document.createElement("option");
      option.value = node.id;
      option.label = node.title;
      return option;
    });
    document.querySelector("#node-options").append(...options);
  }

  function updateProvenance(graph) {
    const snapshot = graph.source_snapshot || {};
    const counts = graph.counts || {};
    document.querySelector("#source-commit").textContent = snapshot.source_commit ? snapshot.source_commit.slice(0, 12) : "unknown";
    document.querySelector("#blessed-by").textContent = snapshot.topology_algorithm || snapshot.blessed_by || "unknown";
    document.querySelector("#closed-count").textContent = counts.nodes ?? counts.dag_closed ?? counts.shown_closed ?? "-";
    document.querySelector("#open-count").textContent = counts.advisory_edges ?? counts.dag_open ?? counts.shown_open ?? "-";
    document.querySelector("#edge-count").textContent = counts.edges ?? graph.edges.length;
  }

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
      statusElement.textContent = "Enter a node ID or declaration name.";
      return;
    }
    const nodes = renderer ? renderer.graphData().nodes : [];
    const node = nodes.find((candidate) => candidate.id.toLowerCase() === query)
      || nodes.find((candidate) => candidate.title.toLowerCase().includes(query) || candidate.id.toLowerCase().includes(query));
    if (node) {
      focusNode(node);
      statusElement.textContent = `Focused ${node.id}`;
    } else {
      statusElement.textContent = `No visible node matches "${queryInput.value.trim()}".`;
    }
  });

  fitButton.addEventListener("click", () => renderer && renderer.zoomToFit(700, 65));
  motionButton.addEventListener("click", () => {
    if (!renderer) return;
    paused = !paused;
    motionButton.setAttribute("aria-pressed", String(paused));
    motionButton.textContent = paused ? "Resume" : "Pause";
    if (paused) renderer.pauseAnimation();
    else renderer.resumeAnimation();
  });

  function fetchJson(path) {
    return fetch(path).then((response) => {
      if (!response.ok) {
        const error = new Error(`${path} returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    });
  }

  function loadGraph() {
    return fetchJson("data/certified-topology.v1.json")
      .catch((error) => {
        if (error.status !== 404) throw error;
        return fetchJson("data/truth-graph.v1.json");
      });
  }

  loadGraph()
    .then((graph) => {
      if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        throw new Error("graph data is missing its nodes or edges array");
      }
      sourceGraph = graph;
      populateControls(graph);
      updateProvenance(graph);
      const visible = visibleGraph();
      initializeRenderer(visible);
      statusElement.className = "graph-status graph-status-ready";
      statusElement.textContent = `${visible.nodes.length} nodes | ${visible.links.length} structural edges`;
    })
    .catch((error) => {
      statusElement.className = "graph-status graph-status-error";
      statusElement.textContent = `Unable to render the topology: ${error.message}`;
      detailElement.innerHTML = '<p class="node-detail-empty">The topology is temporarily unavailable. The overview and provenance remain readable.</p>';
    });
}());
