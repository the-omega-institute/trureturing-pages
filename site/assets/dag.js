(function () {
  "use strict";

  const Atlas = window.TrureturingAtlasStructure;
  const graphElement = document.querySelector("#graph");
  const statusElement = document.querySelector("#graph-status");
  const detailElement = document.querySelector("#node-detail");
  const clusterSelect = document.querySelector("#cluster-filter");
  const queryInput = document.querySelector("#node-query");
  const searchForm = document.querySelector("#node-search");
  const fitButton = document.querySelector("#fit-graph");
  const resetButton = document.querySelector("#reset-view");
  const clusterOverlay = document.querySelector("#cluster-overlay");
  const stateButtons = [...document.querySelectorAll("[data-state]")];
  const modeButtons = [...document.querySelectorAll("[data-atlas-mode]")];
  const reduceMotion = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer = null;
  let sourceGraph = null;
  let manifest = null;
  let conformation = null;
  let model = null;
  let positionById = new Map();
  let activeMode = "structure";
  let activeState = "All";
  let activeCluster = "All";
  let selectedId = null;
  let currentNodeIds = new Set();
  let hullRecords = [];
  let initialFitDone = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
      throw new Error("This browser cannot verify the Atlas digests.");
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

  async function validateBoundState(
    graphText,
    graph,
    atlasManifest,
    conformationText,
    layout
  ) {
    if (!Atlas) throw new Error("The Atlas structure model did not load.");
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new Error("Atlas data is missing its nodes or edges array.");
    }
    if (!atlasManifest || atlasManifest.schema_version !== "pages-atlas-manifest.v1") {
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
    if (layout.truth_release_digest !== atlasManifest.truth_release_digest
        || layout.atlas_graph_digest !== atlasManifest.atlas_graph_digest
        || layout.certified_topology_digest !== atlasManifest.certified_topology_digest) {
      throw new Error("Conformation and Atlas manifest use different release bindings.");
    }
    const release = graph.source_snapshot && graph.source_snapshot.truth_release_digest;
    if (release !== layout.truth_release_digest) {
      throw new Error("Conformation is bound to a different truth release.");
    }

    const topologyDigest = atlasManifest.topology_atlas_digest;
    if (topologyDigest) {
      if (!graph.topology_atlas || graph.topology_atlas.digest !== topologyDigest) {
        throw new Error("The graph does not carry the manifest-bound Topology Atlas.");
      }
      if (layout.topology_atlas_digest !== topologyDigest
          || layout.structure_source !== "topology-atlas.v1") {
        throw new Error("The conformation does not use the manifest-bound Topology Atlas.");
      }
    }

    const [graphDigest, layoutDigest] = await Promise.all([
      sha256Digest(graphText),
      sha256Digest(conformationText)
    ]);
    if (graphDigest !== atlasManifest.atlas_graph_digest) {
      throw new Error("Atlas graph bytes do not match the manifest digest.");
    }
    if (layoutDigest !== atlasManifest.conformation_digest) {
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
  }

  async function loadBoundState() {
    const [graphText, manifestText, conformationText] = await Promise.all([
      fetchText("data/pages-atlas-view.v1.json"),
      fetchText("data/pages-atlas-manifest.v1.json"),
      fetchText("data/pages-conformation.v1.json")
    ]);
    const graph = JSON.parse(graphText);
    const atlasManifest = JSON.parse(manifestText);
    const layout = JSON.parse(conformationText);
    const positions = await validateBoundState(
      graphText,
      graph,
      atlasManifest,
      conformationText,
      layout
    );
    return { graph, atlasManifest, layout, positions };
  }

  function nodeColor(node) {
    return Atlas.clusterColor(
      node.atlas_cluster_id,
      node.state || node.status,
      node.id === selectedId
    );
  }

  function linkColor(link) {
    return Atlas.linkColor({
      ...link,
      source: Atlas.endpointId(link.source),
      target: Atlas.endpointId(link.target)
    }, selectedId);
  }

  function linkWidth(link) {
    return Atlas.linkWidth({
      ...link,
      source: Atlas.endpointId(link.source),
      target: Atlas.endpointId(link.target)
    }, selectedId);
  }

  function currentView() {
    return Atlas.graphView(model, {
      mode: activeMode,
      state: activeState,
      clusterId: activeCluster,
      selectedId
    });
  }

  function rendererData() {
    const view = currentView();
    currentNodeIds = view.nodeIds;
    return {
      nodes: view.nodes.map((node) => {
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
      links: view.edges.map((edge) => ({ ...edge }))
    };
  }

  function structureSourceLabel() {
    return model && model.hasTopologyAtlas
      ? "Topology Atlas structure"
      : "Pages fallback regions";
  }

  function statusText(data) {
    const label = activeMode === "structure"
      ? "structure backbone"
      : activeMode === "dependency"
        ? "certified dependencies"
        : "formalization frontier";
    return `${data.nodes.length} concepts | ${data.links.length} visible relations | ${label}`;
  }

  function refreshGraph({ clearSelection = false, fit = false } = {}) {
    if (!renderer || !model) return;
    if (clearSelection) publishSelection(null, false);
    const data = rendererData();
    renderer.graphData(data)
      .nodeColor(nodeColor)
      .nodeVal(Atlas.nodeValue)
      .linkColor(linkColor)
      .linkWidth(linkWidth);
    rebuildClusterOverlay();
    statusElement.className = "graph-status graph-status-ready";
    statusElement.textContent = statusText(data);
    if (fit) window.setTimeout(() => renderer.zoomToFit(500, 70), 80);
  }

  function publishSelection(node, refresh = true) {
    selectedId = node ? node.id : null;
    if (node) {
      detailElement.dataset.nodeId = node.id;
      const params = new URLSearchParams({ node: node.id, mode: activeMode });
      window.history.replaceState(null, "", `#${params.toString()}`);
    } else {
      delete detailElement.dataset.nodeId;
      const params = new URLSearchParams({ mode: activeMode });
      window.history.replaceState(null, "", `#${params.toString()}`);
    }
    if (refresh && renderer) refreshGraph();
  }

  function liveNode(id) {
    if (!renderer) return null;
    return renderer.graphData().nodes.find((candidate) => candidate.id === id) || null;
  }

  function focusNode(node) {
    if (!node || !renderer) return;
    publishSelection(node);
    const focused = liveNode(node.id) || node;
    const distance = 150;
    const length = Math.hypot(focused.x || 0, focused.y || 0, focused.z || 0) || 1;
    const ratio = 1 + distance / length;
    renderer.cameraPosition(
      {
        x: (focused.x || 0) * ratio,
        y: (focused.y || 0) * ratio,
        z: (focused.z || 0) * ratio
      },
      focused,
      reduceMotion ? 0 : 700
    );
  }

  function setMode(mode, fit) {
    if (!Atlas.MODES.has(mode)) return;
    activeMode = mode;
    modeButtons.forEach((button) => button.setAttribute(
      "aria-pressed",
      String(button.dataset.atlasMode === activeMode)
    ));
    refreshGraph({ clearSelection: true, fit });
  }

  function focusById(id) {
    let node = liveNode(id);
    if (!node) {
      activeState = "All";
      activeCluster = "All";
      stateButtons.forEach((button) => button.setAttribute(
        "aria-pressed",
        String(button.dataset.state === "All")
      ));
      if (clusterSelect) clusterSelect.value = "All";
      if (activeMode === "frontier") {
        activeMode = "structure";
        modeButtons.forEach((button) => button.setAttribute(
          "aria-pressed",
          String(button.dataset.atlasMode === activeMode)
        ));
      }
      refreshGraph();
      node = liveNode(id);
    }
    if (node) {
      focusNode(node);
      statusElement.textContent = `Focused ${Atlas.humanTitle(node)} in ${structureSourceLabel()}.`;
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
      reduceMotion ? 0 : 700
    );
  }

  function initializeRenderer(data) {
    if (typeof window.ForceGraph3D !== "function") {
      throw new Error("The 3D renderer could not be loaded. Use the static Library while it is unavailable.");
    }

    renderer = window.ForceGraph3D()(graphElement)
      .backgroundColor("#07100e")
      .showNavInfo(false)
      .nodeLabel((node) => {
        const cluster = node.atlas_cluster_label || "Unclassified structure";
        const role = node.structural_role
          ? node.structural_role.replaceAll("-", " ")
          : "concept";
        return `
          <div class="graph-tooltip">
            <strong>${escapeHtml(Atlas.humanTitle(node))}</strong>
            <span>${escapeHtml(node.status || node.state)} · ${escapeHtml(role)}</span>
            <span>${escapeHtml(cluster)} · depth ${escapeHtml(Atlas.trueDepth(node))}</span>
          </div>`;
      })
      .nodeColor(nodeColor)
      .nodeVal(Atlas.nodeValue)
      .nodeResolution(12)
      .linkColor(linkColor)
      .linkWidth(linkWidth)
      .linkCurvature((link) => link.cluster_relation === "inter-cluster" ? 0.12 : 0)
      .linkDirectionalArrowLength((link) => link.authority === "certified" ? 2.8 : 0)
      .linkDirectionalArrowRelPos(0.9)
      .linkDirectionalArrowColor(linkColor)
      .linkDirectionalParticles((link) =>
        !reduceMotion
        && selectedId
        && link.authority === "certified"
        && (Atlas.endpointId(link.source) === selectedId
          || Atlas.endpointId(link.target) === selectedId)
          ? 2
          : 0)
      .linkDirectionalParticleWidth(1.2)
      .linkDirectionalParticleColor(() => "rgba(126,216,255,0.92)")
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
      updateClusterOverlay();
    };
    new ResizeObserver(resize).observe(graphElement);
    resize();
    renderer.graphData(data);
  }

  function rebuildClusterOverlay() {
    if (!clusterOverlay || !model) return;
    clusterOverlay.replaceChildren();
    hullRecords = [];
    const descriptors = Atlas.clusterDescriptors(model, currentNodeIds);
    descriptors.forEach((descriptor, index) => {
      if (descriptor.memberCount < 2 && activeCluster !== descriptor.cluster_id) return;
      const hull = document.createElement("div");
      hull.className = "atlas-cluster-hull";
      hull.dataset.clusterId = descriptor.cluster_id;
      hull.style.setProperty("--cluster-hue", Atlas.clusterHue(descriptor.cluster_id).toFixed(1));
      if (descriptor.cluster_id === activeCluster) hull.classList.add("is-active");

      const label = document.createElement("button");
      label.type = "button";
      label.className = "atlas-cluster-label";
      if (index >= 24 && descriptor.cluster_id !== activeCluster) {
        label.classList.add("is-secondary");
      }
      label.textContent = `${descriptor.display_label || "Structural community"} · ${descriptor.memberCount}`;
      label.addEventListener("click", (event) => {
        event.stopPropagation();
        activeCluster = descriptor.cluster_id;
        if (clusterSelect) clusterSelect.value = activeCluster;
        refreshGraph({ clearSelection: true, fit: true });
      });
      hull.append(label);
      clusterOverlay.append(hull);
      hullRecords.push({ descriptor, hull });
    });
    updateClusterOverlay();
  }

  function updateClusterOverlay() {
    if (!clusterOverlay || !renderer) return;
    const visible = activeMode === "structure" && hullRecords.length > 0;
    clusterOverlay.hidden = !visible;
    if (!visible) return;

    const live = new Map(renderer.graphData().nodes.map((node) => [node.id, node]));
    for (const { descriptor, hull } of hullRecords) {
      const points = descriptor.members
        .map((id) => live.get(id))
        .filter(Boolean)
        .map((node) => renderer.graph2ScreenCoords(node.x, node.y, node.z))
        .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
      if (!points.length) {
        hull.hidden = true;
        continue;
      }
      hull.hidden = false;
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      const padding = 24 + Math.min(34, Math.sqrt(points.length) * 3);
      hull.style.left = `${minX - padding}px`;
      hull.style.top = `${minY - padding}px`;
      hull.style.width = `${Math.max(64, maxX - minX + 2 * padding)}px`;
      hull.style.height = `${Math.max(54, maxY - minY + 2 * padding)}px`;
    }
  }

  function populateControls() {
    if (clusterSelect) {
      const descriptors = Atlas.clusterDescriptors(
        model,
        new Set(sourceGraph.nodes.map((node) => node.id))
      );
      clusterSelect.append(...descriptors.map((cluster) => {
        const option = document.createElement("option");
        option.value = cluster.cluster_id;
        option.textContent = `${cluster.display_label || "Structural community"} (${cluster.memberCount})`;
        return option;
      }));
    }

    const options = sourceGraph.nodes
      .slice()
      .sort((left, right) => Atlas.humanTitle(left).localeCompare(Atlas.humanTitle(right)))
      .map((node) => {
        const option = document.createElement("option");
        option.value = node.id;
        option.label = Atlas.humanTitle(node);
        return option;
      });
    document.querySelector("#node-options").append(...options);
  }

  function updateSummary() {
    const summary = Atlas.structuralSummary(model);
    const counts = sourceGraph.counts || {};
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = String(value);
    };
    setText("#release-status", model.hasTopologyAtlas ? "Verified structure" : "Fallback structure");
    setText("#concept-count", counts.truth_nodes
      ?? sourceGraph.nodes.filter((node) => node.kind === "truth").length);
    setText("#cluster-count", summary.clusters);
    setText("#bridge-count", summary.cutBridges);
    setText("#frontier-count", sourceGraph.nodes.filter((node) =>
      String(node.state || node.status || "").toLowerCase() === "open").length);
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
      refreshGraph({ clearSelection: true, fit: true });
    });
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.atlasMode, true));
  });

  if (clusterSelect) {
    clusterSelect.addEventListener("change", () => {
      activeCluster = clusterSelect.value;
      refreshGraph({ clearSelection: true, fit: true });
    });
  }

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = queryInput.value.trim().toLowerCase();
    if (!query) {
      statusElement.textContent = "Enter a concept or theorem name.";
      return;
    }
    const node = sourceGraph.nodes.find((candidate) => candidate.id.toLowerCase() === query)
      || sourceGraph.nodes.find((candidate) =>
        Atlas.humanTitle(candidate).toLowerCase().includes(query)
        || candidate.id.toLowerCase().includes(query)
        || String(candidate.structural_role || "").includes(query));
    if (node) focusById(node.id);
    else statusElement.textContent = `No concept matches "${queryInput.value.trim()}".`;
  });

  fitButton.addEventListener("click", () => renderer && renderer.zoomToFit(500, 70));
  if (resetButton) resetButton.addEventListener("click", resetCamera);

  loadBoundState()
    .then((state) => {
      sourceGraph = state.graph;
      manifest = state.atlasManifest;
      conformation = state.layout;
      positionById = state.positions;
      model = Atlas.createModel(sourceGraph, conformation);
      populateControls();
      updateSummary();

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const requestedMode = hash.get("mode");
      if (requestedMode && Atlas.MODES.has(requestedMode)) activeMode = requestedMode;
      modeButtons.forEach((button) => button.setAttribute(
        "aria-pressed",
        String(button.dataset.atlasMode === activeMode)
      ));

      const data = rendererData();
      initializeRenderer(data);
      rebuildClusterOverlay();
      window.setInterval(updateClusterOverlay, 120);
      statusElement.className = "graph-status graph-status-ready";
      statusElement.textContent = `${statusText(data)} | ${structureSourceLabel()}`;

      const requestedNode = hash.get("node");
      if (requestedNode) window.setTimeout(() => focusById(requestedNode), 100);
    })
    .catch((error) => {
      statusElement.className = "graph-status graph-status-error";
      statusElement.textContent = `Unable to verify the Mathematical Atlas: ${error.message}`;
      const fallback = document.createElement("p");
      fallback.className = "node-detail-empty";
      fallback.textContent = "The interactive structure is unavailable. The static Library remains readable and release-bound.";
      detailElement.replaceChildren(fallback);
    });
}());
