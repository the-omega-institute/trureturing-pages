(function () {
  "use strict";

  const COLORS = {
    closed: "#42c47a",
    open: "#f2ad4a",
    tail: "#b69bff",
    semantic: "#8aa0b4",
    selected: "#7ed8ff"
  };
  const LAYER_ORDER = ["D5/S0", "D5/S1", "D5/S3", "D5/X_Frontier", "Root", "Blueprint"];
  const CERTIFIED_LAYERS = new Set([
    "truth-dependency",
    "module-import",
    "frozen-prerequisite"
  ]);

  const graphElement = document.querySelector("#graph");
  const statusElement = document.querySelector("#graph-status");
  const detailElement = document.querySelector("#node-detail");
  const layerSelect = document.querySelector("#layer-filter");
  const queryInput = document.querySelector("#node-query");
  const searchForm = document.querySelector("#node-search");
  const fitButton = document.querySelector("#fit-graph");
  const resetButton = document.querySelector("#reset-view");
  const stateButtons = [...document.querySelectorAll("[data-state]")];

  let renderer = null;
  let sourceGraph = { nodes: [], edges: [] };
  let conformation = null;
  let positionById = new Map();
  let activeState = "All";
  let activeLayer = "All";
  let selectedId = null;
  let initialFitDone = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function humanTitle(node) {
    if (node.human_title && node.human_title !== "None") return node.human_title;
    const leaf = String(node.repo_path || node.title || node.id || "Concept")
      .replace(/\.lean$/, "")
      .split("/")
      .pop();
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

  function trueDepth(node) {
    for (const value of [node.true_depth, node.max_depth, node.depth]) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  }

  function nodeColor(node) {
    if (node.id === selectedId) return COLORS.selected;
    return COLORS[node.state] || COLORS.semantic;
  }

  function nodeValue(node) {
    if (node.kind !== "truth") return 1.35;
    const cost = Number(node.descendant_cost);
    const structuralCost = Number.isFinite(cost) && cost >= 0 ? cost : 0;
    return 1.7 + Math.log1p(structuralCost) * 1.12;
  }

  function edgeAuthority(edge) {
    const layer = String(edge.layer || "");
    const status = String(edge.status || "");
    if (layer === "intuition-candidate" || status === "proposed" || status === "advisory") {
      return "advisory";
    }
    if (CERTIFIED_LAYERS.has(layer) || status === "certified") return "certified";
    if (layer.startsWith("blueprint-")) return "authored";
    if (layer.includes("affinity") || layer.includes("structural")) return "derived";
    return "authored";
  }

  function linkColor(link) {
    const selected = endpointId(link.source) === selectedId || endpointId(link.target) === selectedId;
    if (selected) return "rgba(126, 216, 255, 0.72)";
    const authority = link.authority || edgeAuthority(link);
    if (authority === "advisory") return "rgba(202, 166, 255, 0.42)";
    if (authority === "authored") return "rgba(222, 190, 116, 0.34)";
    if (authority === "derived") return "rgba(139, 166, 202, 0.24)";
    return "rgba(171, 205, 196, 0.34)";
  }

  function linkWidth(link) {
    if (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId) return 1.9;
    return (link.authority || edgeAuthority(link)) === "certified" ? 0.52 : 0.3;
  }

  function scalePoint(point, scale) {
    return {
      x: Number(point.x) / scale,
      y: Number(point.y) / scale,
      z: Number(point.z) / scale
    };
  }

  async function sha256Digest(text) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder !== "function") {
      throw new Error("This browser cannot verify the conformation digest.");
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${[...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  async function fetchText(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.text();
  }

  function validateBoundState(graphText, graph, manifest, conformationText, layout) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new Error("Atlas data is missing its nodes or edges array.");
    }
    if (!manifest || manifest.schema_version !== "pages-atlas-manifest.v1") {
      throw new Error("Atlas manifest has an unsupported schema.");
    }
    if (!layout || layout.schema_version !== "pages-conformation.v1") {
      throw new Error("Conformation has an unsupported schema.");
    }
    if (!layout.coordinate_encoding || layout.coordinate_encoding.type !== "signed-fixed-point") {
      throw new Error("Conformation coordinate encoding is unsupported.");
    }
    const scale = Number(layout.coordinate_encoding.scale);
    if (!Number.isInteger(scale) || scale <= 0) {
      throw new Error("Conformation coordinate scale is invalid.");
    }
    if (layout.truth_release_digest !== manifest.truth_release_digest
        || layout.atlas_graph_digest !== manifest.atlas_graph_digest
        || layout.certified_topology_digest !== manifest.certified_topology_digest) {
      throw new Error("Conformation and Atlas manifest use different release bindings.");
    }
    const release = graph.source_snapshot && graph.source_snapshot.truth_release_digest;
    if (release !== layout.truth_release_digest) {
      throw new Error("Conformation is bound to a different truth release.");
    }

    return Promise.all([
      sha256Digest(graphText),
      sha256Digest(conformationText)
    ]).then(([graphDigest, layoutDigest]) => {
      if (graphDigest !== manifest.atlas_graph_digest) {
        throw new Error("Atlas graph bytes do not match the manifest digest.");
      }
      if (layoutDigest !== manifest.conformation_digest) {
        throw new Error("Conformation bytes do not match the manifest digest.");
      }
      if (!Array.isArray(layout.nodes) || layout.nodes.length !== graph.nodes.length) {
        throw new Error("Conformation does not close over every displayed node.");
      }

      const positions = new Map();
      for (const record of layout.nodes) {
        if (!record || typeof record.node_id !== "string" || positions.has(record.node_id)) {
          throw new Error("Conformation contains an invalid or duplicate node coordinate.");
        }
        const point = scalePoint(record.aligned, scale);
        if (![point.x, point.y, point.z].every(Number.isFinite)) {
          throw new Error(`Conformation coordinate is invalid for ${record.node_id}.`);
        }
        positions.set(record.node_id, point);
      }
      for (const node of graph.nodes) {
        if (!positions.has(node.id)) {
          throw new Error(`Conformation has no coordinate for ${node.id}.`);
        }
      }
      return positions;
    });
  }

  async function loadBoundState() {
    const [graphText, manifestText, conformationText] = await Promise.all([
      fetchText("data/pages-atlas-view.v1.json"),
      fetchText("data/pages-atlas-manifest.v1.json"),
      fetchText("data/pages-conformation.v1.json")
    ]);
    const graph = JSON.parse(graphText);
    const manifest = JSON.parse(manifestText);
    const layout = JSON.parse(conformationText);
    const positions = await validateBoundState(
      graphText,
      graph,
      manifest,
      conformationText,
      layout
    );
    return { graph, manifest, layout, positions };
  }

  function visibleGraph() {
    const nodes = sourceGraph.nodes.filter((node) =>
      (activeState === "All" || node.status === activeState)
      && (activeLayer === "All" || node.layer === activeLayer));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = sourceGraph.edges.filter((edge) =>
      ids.has(endpointId(edge.source)) && ids.has(endpointId(edge.target)));
    return {
      nodes: nodes.map((node) => {
        const position = positionById.get(node.id);
        return {
          ...node,
          x: position.x,
          y: position.y,
          z: position.z,
          fx: position.x,
          fy: position.y,
          fz: position.z
        };
      }),
      links: edges.map((edge) => ({
        ...edge,
        source: endpointId(edge.source),
        target: endpointId(edge.target),
        authority: edgeAuthority(edge)
      }))
    };
  }

  function publishSelection(node) {
    selectedId = node ? node.id : null;
    if (node) {
      detailElement.dataset.nodeId = node.id;
      const params = new URLSearchParams({ node: node.id });
      window.history.replaceState(null, "", `#${params.toString()}`);
    } else {
      delete detailElement.dataset.nodeId;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (renderer) {
      renderer
        .nodeColor(nodeColor)
        .linkColor(linkColor)
        .linkWidth(linkWidth);
    }
  }

  function liveNode(id) {
    if (!renderer) return null;
    return renderer.graphData().nodes.find((candidate) => candidate.id === id) || null;
  }

  function focusNode(node) {
    if (!node || !renderer) return;
    publishSelection(node);
    const distance = 145;
    const length = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
    const ratio = 1 + distance / length;
    renderer.cameraPosition(
      {
        x: (node.x || 0) * ratio,
        y: (node.y || 0) * ratio,
        z: (node.z || 0) * ratio
      },
      node,
      700
    );
  }

  function focusById(id) {
    let node = liveNode(id);
    if (!node) {
      activeState = "All";
      activeLayer = "All";
      stateButtons.forEach((button) => button.setAttribute(
        "aria-pressed",
        String(button.dataset.state === "All")
      ));
      layerSelect.value = "All";
      renderer.graphData(visibleGraph());
      node = liveNode(id);
    }
    if (node) {
      focusNode(node);
      statusElement.textContent = `Focused ${humanTitle(node)} in the stable release conformation.`;
    }
  }

  function resetCamera() {
    if (!renderer || !conformation) return;
    const scale = Number(conformation.coordinate_encoding.scale);
    const preset = Array.isArray(conformation.camera_presets)
      ? conformation.camera_presets.find((item) => item.name === "overview")
      : null;
    if (!preset) {
      renderer.zoomToFit(700, 70);
      return;
    }
    renderer.cameraPosition(
      scalePoint(preset.position, scale),
      scalePoint(preset.look_at, scale),
      700
    );
  }

  function applyFilters() {
    if (!renderer) return;
    publishSelection(null);
    const graph = visibleGraph();
    renderer.graphData(graph);
    statusElement.className = "graph-status graph-status-ready";
    statusElement.textContent = `${graph.nodes.length} concepts | ${graph.links.length} relations | fixed release conformation`;
    window.setTimeout(() => renderer.zoomToFit(500, 70), 80);
  }

  function initializeRenderer(graph) {
    if (typeof window.ForceGraph3D !== "function") {
      throw new Error("The 3D renderer could not be loaded. Use the static Library while the renderer is unavailable.");
    }

    renderer = window.ForceGraph3D()(graphElement)
      .backgroundColor("#07100e")
      .showNavInfo(false)
      .nodeLabel((node) => `
        <div class="graph-tooltip">
          <strong>${escapeHtml(humanTitle(node))}</strong>
          <span>${escapeHtml(node.status)} &middot; certified depth ${escapeHtml(trueDepth(node))}</span>
          <span>Stable release conformation</span>
        </div>`)
      .nodeColor(nodeColor)
      .nodeVal(nodeValue)
      .nodeResolution(10)
      .linkColor(linkColor)
      .linkWidth(linkWidth)
      .linkDirectionalArrowLength((link) => (link.authority === "certified" ? 2.8 : 1.8))
      .linkDirectionalArrowRelPos(0.9)
      .linkDirectionalArrowColor(linkColor)
      .onNodeClick(focusNode)
      .onNodeHover((node) => {
        graphElement.style.cursor = node ? "pointer" : "grab";
      })
      .onBackgroundClick(() => publishSelection(null))
      .onEngineStop(() => {
        if (!initialFitDone) {
          initialFitDone = true;
          resetCamera();
        }
      })
      .warmupTicks(0)
      .cooldownTicks(0);

    const resize = () => {
      renderer.width(graphElement.clientWidth);
      renderer.height(graphElement.clientHeight);
    };
    new ResizeObserver(resize).observe(graphElement);
    resize();
    renderer.graphData(graph);
  }

  function populateControls(graph) {
    const layers = [...new Set(graph.nodes.map((node) => node.layer).filter(Boolean))]
      .sort((left, right) => {
        const leftIndex = LAYER_ORDER.indexOf(left);
        const rightIndex = LAYER_ORDER.indexOf(right);
        return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
          - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
          || left.localeCompare(right);
      });
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

  function updateSummary(graph) {
    const counts = graph.counts || {};
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    };
    setText("#closed-count", counts.dag_closed ?? counts.closed ?? "-");
    setText("#open-count", counts.dag_open ?? counts.open ?? "-");
    setText("#edge-count", counts.edges ?? graph.edges.length);
  }

  detailElement.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-node-id]")
      : null;
    if (target && target.dataset.nodeId) focusById(target.dataset.nodeId);
  });

  stateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeState = button.dataset.state;
      stateButtons.forEach((candidate) => candidate.setAttribute(
        "aria-pressed",
        String(candidate === button)
      ));
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
      statusElement.textContent = "Enter a concept or theorem name.";
      return;
    }
    const node = sourceGraph.nodes.find((candidate) => candidate.id.toLowerCase() === query)
      || sourceGraph.nodes.find((candidate) =>
        humanTitle(candidate).toLowerCase().includes(query)
        || candidate.id.toLowerCase().includes(query));
    if (node) {
      focusById(node.id);
    } else {
      statusElement.textContent = `No concept matches "${queryInput.value.trim()}".`;
    }
  });

  fitButton.addEventListener("click", () => renderer && renderer.zoomToFit(500, 70));
  if (resetButton) resetButton.addEventListener("click", resetCamera);

  loadBoundState()
    .then((state) => {
      sourceGraph = state.graph;
      conformation = state.layout;
      positionById = state.positions;
      populateControls(sourceGraph);
      updateSummary(sourceGraph);
      const visible = visibleGraph();
      initializeRenderer(visible);
      statusElement.className = "graph-status graph-status-ready";
      statusElement.textContent = `${visible.nodes.length} concepts | ${visible.links.length} relations | fixed release conformation`;
    })
    .catch((error) => {
      statusElement.className = "graph-status graph-status-error";
      statusElement.textContent = `Unable to verify the Mathematical Atlas: ${error.message}`;
      const fallback = document.createElement("p");
      fallback.className = "node-detail-empty";
      fallback.textContent = "The interactive conformation is unavailable. The static Library remains readable and release-bound.";
      detailElement.replaceChildren(fallback);
    });
}());
