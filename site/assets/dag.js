(function () {
  "use strict";

  const Atlas = window.TrureturingAtlasStructure;
  const Semantic = window.TrureturingAtlasSemanticZoom;
  const graphElement = document.querySelector("#graph");
  const statusElement = document.querySelector("#graph-status");
  const detailElement = document.querySelector("#node-detail");
  const clusterSelect = document.querySelector("#cluster-filter");
  const queryInput = document.querySelector("#node-query");
  const searchForm = document.querySelector("#node-search");
  const fitButton = document.querySelector("#fit-graph");
  const resetButton = document.querySelector("#reset-view");
  const clusterOverlay = document.querySelector("#cluster-overlay");
  const contextBar = document.querySelector("#atlas-context-bar");
  const contextLabel = document.querySelector("#atlas-context-label");
  const lodIndicator = document.querySelector("#atlas-lod-indicator");
  const backButton = document.querySelector("#atlas-back");
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
  let automaticLod = "far";
  let effectiveLod = "far";
  let atlasRadius = 1;
  let currentNodeIds = new Set();
  let hullRecords = [];
  let clusterHistory = [];
  let initialFitDone = false;
  let semanticRefreshInProgress = false;

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
    if (!Semantic) throw new Error("The semantic zoom model did not load.");
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

  function viewOptions() {
    return {
      mode: activeMode,
      state: activeState,
      clusterId: activeCluster,
      selectedId
    };
  }

  function currentView() {
    effectiveLod = Semantic.effectiveLevel(
      automaticLod,
      selectedId,
      activeCluster
    );
    return Semantic.graphView(model, viewOptions(), effectiveLod);
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
    return `${data.nodes.length} concepts | ${data.links.length} visible relations | ${label} | ${Semantic.levelLabel(effectiveLod)}`;
  }

  function currentClusterLabel() {
    if (!model || activeCluster === "All") return "All communities";
    const cluster = model.clusterById.get(activeCluster);
    return cluster && cluster.display_label
      ? cluster.display_label
      : "Selected structural community";
  }

  function updateContextBar() {
    if (!contextBar) return;
    contextBar.dataset.lod = effectiveLod;
    graphElement.dataset.lod = effectiveLod;
    if (lodIndicator) lodIndicator.textContent = Semantic.levelLabel(effectiveLod);
    if (contextLabel) {
      if (selectedId && model && model.nodeById.has(selectedId)) {
        contextLabel.textContent = `Concept · ${Atlas.humanTitle(model.nodeById.get(selectedId))}`;
      } else {
        contextLabel.textContent = currentClusterLabel();
      }
    }
    if (backButton) {
      backButton.hidden = !selectedId && activeCluster === "All";
      backButton.textContent = selectedId ? "Back to structure" : "All communities";
    }
  }

  function syncUrl() {
    const params = new URLSearchParams();
    params.set("mode", activeMode);
    params.set("lod", automaticLod);
    if (activeCluster !== "All") params.set("cluster", activeCluster);
    if (selectedId) params.set("node", selectedId);
    window.history.replaceState(null, "", `#${params.toString()}`);
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
    updateContextBar();
    syncUrl();
    statusElement.className = "graph-status graph-status-ready";
    statusElement.textContent = statusText(data);
    if (fit) window.setTimeout(() => renderer.zoomToFit(500, 70), 80);
  }

  function publishSelection(node, refresh = true) {
    selectedId = node ? node.id : null;
    if (node) detailElement.dataset.nodeId = node.id;
    else delete detailElement.dataset.nodeId;
    // A selection change only alters highlighting, not the visible node/link set.
    // Re-apply the colour/width accessors so the selection restyles, but never
    // re-issue graphData(): setting graphData reheats the force engine and makes
    // the pinned conformation drift on every click. View changes (mode / cluster /
    // lod) still call refreshGraph(), because those actually change the node set.
    if (refresh && renderer) restyleGraph();
    else {
      updateContextBar();
      syncUrl();
    }
  }

  function restyleGraph() {
    if (!renderer || !model) return;
    renderer
      .nodeColor(nodeColor)
      .linkColor(linkColor)
      .linkWidth(linkWidth);
    updateContextBar();
    syncUrl();
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

  function setCluster(clusterId, { remember = true, fit = true } = {}) {
    const next = clusterId && clusterId !== "All" && model.clusterById.has(clusterId)
      ? clusterId
      : "All";
    if (remember && activeCluster !== next) clusterHistory.push(activeCluster);
    activeCluster = next;
    if (clusterSelect) clusterSelect.value = activeCluster;
    refreshGraph({ clearSelection: true, fit });
  }

  function focusById(id) {
    let node = liveNode(id);
    if (!node) {
      activeState = "All";
      activeCluster = "All";
      clusterHistory = [];
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
    automaticLod = "far";
    const scale = Number(conformation.coordinate_encoding.scale);
    const preset = Array.isArray(conformation.camera_presets)
      ? conformation.camera_presets.find((item) => item.name === "overview")
      : null;
    if (!preset) {
      renderer.zoomToFit(700, 70);
      refreshGraph();
      return;
    }
    renderer.cameraPosition(
      scalePoint(preset.position, scale),
      scalePoint(preset.look_at, scale),
      reduceMotion ? 0 : 700
    );
    refreshGraph();
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
    clusterOverlay.dataset.lod = effectiveLod;
    const structuralNodeIds = Semantic.baseNodeIds(model, viewOptions());
    const descriptors = Atlas.clusterDescriptors(model, structuralNodeIds);
    descriptors.forEach((descriptor, index) => {
      if (descriptor.memberCount < 2 && activeCluster !== descriptor.cluster_id) return;
      const hull = document.createElement("div");
      hull.className = "atlas-cluster-hull";
      hull.dataset.clusterId = descriptor.cluster_id;
      hull.style.setProperty("--cluster-hue", Atlas.clusterHue(descriptor.cluster_id).toFixed(1));
      if (descriptor.cluster_id === activeCluster) hull.classList.add("is-active");
      if (activeCluster !== "All" && descriptor.cluster_id !== activeCluster) {
        hull.classList.add("is-muted");
      }

      const label = document.createElement("button");
      label.type = "button";
      label.className = "atlas-cluster-label";
      if (index >= 24 && descriptor.cluster_id !== activeCluster) {
        label.classList.add("is-secondary");
      }
      label.textContent = `${descriptor.display_label || "Structural community"} · ${descriptor.memberCount}`;
      label.addEventListener("click", (event) => {
        event.stopPropagation();
        setCluster(descriptor.cluster_id);
      });
      hull.append(label);
      clusterOverlay.append(hull);
      hullRecords.push({ descriptor, hull });
    });
    updateClusterOverlay();
  }

  function updateClusterOverlay() {
    if (!clusterOverlay || !renderer) return;
    const visible = activeMode === "structure"
      && hullRecords.length > 0
      && (effectiveLod === "far"
        || effectiveLod === "medium"
        || activeCluster !== "All");
    clusterOverlay.hidden = !visible;
    if (!visible) return;

    for (const { descriptor, hull } of hullRecords) {
      const points = descriptor.members
        .map((id) => positionById.get(id))
        .filter(Boolean)
        .map((point) => renderer.graph2ScreenCoords(point.x, point.y, point.z))
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

  function cameraDistance() {
    if (!renderer || typeof renderer.camera !== "function"
        || typeof renderer.controls !== "function") return null;
    const camera = renderer.camera();
    const controls = renderer.controls();
    if (!camera || !camera.position || !controls || !controls.target) return null;
    return Math.hypot(
      camera.position.x - controls.target.x,
      camera.position.y - controls.target.y,
      camera.position.z - controls.target.z
    );
  }

  function updateSemanticZoom() {
    if (!renderer || !model || semanticRefreshInProgress || selectedId) {
      updateClusterOverlay();
      return;
    }
    const distance = cameraDistance();
    if (distance === null) {
      updateClusterOverlay();
      return;
    }
    const next = Semantic.levelFromCamera(
      distance,
      atlasRadius,
      automaticLod
    );
    if (next !== automaticLod) {
      automaticLod = next;
      semanticRefreshInProgress = true;
      refreshGraph();
      window.setTimeout(() => {
        semanticRefreshInProgress = false;
      }, 120);
    } else {
      updateClusterOverlay();
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
      setCluster(clusterSelect.value);
    });
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      if (selectedId) {
        publishSelection(null);
        return;
      }
      const previous = clusterHistory.length
        ? clusterHistory.pop()
        : "All";
      setCluster(previous, { remember: false });
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
      atlasRadius = Semantic.canonicalRadius(positionById);
      populateControls();
      updateSummary();

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const requestedMode = hash.get("mode");
      if (requestedMode && Atlas.MODES.has(requestedMode)) activeMode = requestedMode;
      const requestedLod = hash.get("lod");
      if (["far", "medium", "near"].includes(requestedLod)) {
        automaticLod = requestedLod;
      }
      const requestedCluster = hash.get("cluster");
      if (requestedCluster && model.clusterById.has(requestedCluster)) {
        activeCluster = requestedCluster;
        if (clusterSelect) clusterSelect.value = requestedCluster;
      }
      modeButtons.forEach((button) => button.setAttribute(
        "aria-pressed",
        String(button.dataset.atlasMode === activeMode)
      ));

      const data = rendererData();
      initializeRenderer(data);
      rebuildClusterOverlay();
      window.setInterval(updateSemanticZoom, 160);
      statusElement.className = "graph-status graph-status-ready";
      statusElement.textContent = `${statusText(data)} | ${structureSourceLabel()}`;
      updateContextBar();
      syncUrl();

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
