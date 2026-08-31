(function () {
  "use strict";

  const Exploration = window.TrureturingAtlasExploration;
  const Atlas = window.TrureturingAtlasStructure;
  const Semantic = window.TrureturingAtlasSemanticZoom;
  const originalFactory = window.ForceGraph3D;
  if (!Exploration || !Atlas || !Semantic || typeof originalFactory !== "function") {
    return;
  }

  const state = {
    renderer: null,
    originalGraphData: null,
    baseData: { nodes: [], links: [] },
    customFocus: false,
    graph: null,
    manifest: null,
    conformation: null,
    model: null,
    canonicalById: new Map(),
    nodeOffsets: new Map(),
    clusterOffsets: new Map(),
    expansion: {
      upstreamHops: 2,
      downstreamHops: 2,
      includeRelated: false
    },
    releaseKey: null,
    sessionKey: null,
    ready: false,
    rendering: false
  };

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function cloneData(data) {
    return {
      nodes: (data && Array.isArray(data.nodes) ? data.nodes : []).map((node) => ({
        ...node
      })),
      links: (data && Array.isArray(data.links) ? data.links : []).map((link) => ({
        ...link,
        source: endpointId(link.source),
        target: endpointId(link.target)
      }))
    };
  }

  function nodeById() {
    return state.model ? state.model.nodeById : new Map();
  }

  function displayPositions() {
    return Exploration.composePositions(
      state.canonicalById,
      state.nodeOffsets,
      state.clusterOffsets,
      nodeById()
    );
  }

  function applyOffsets(data) {
    const positions = displayPositions();
    return {
      nodes: data.nodes.map((node) => {
        const position = positions.get(node.id)
          || state.canonicalById.get(node.id)
          || { x: Number(node.x) || 0, y: Number(node.y) || 0, z: Number(node.z) || 0 };
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
      links: data.links.map((link) => ({ ...link }))
    };
  }

  function installRenderer(renderer) {
    if (!renderer || state.renderer) return;
    state.renderer = renderer;
    state.originalGraphData = renderer.graphData.bind(renderer);

    renderer.graphData = function (data) {
      if (arguments.length === 0) return state.originalGraphData();
      const canonical = cloneData(data);
      if (!state.rendering) {
        state.baseData = canonical;
        state.customFocus = false;
      }
      return state.originalGraphData(applyOffsets(canonical));
    };

    if (typeof renderer.enableNodeDrag === "function") {
      renderer.enableNodeDrag(true);
    }
    if (typeof renderer.onNodeDragEnd === "function") {
      renderer.onNodeDragEnd((node) => {
        if (!state.ready || !node || !state.canonicalById.has(node.id)) return;
        const offset = Exploration.nodeOffsetFromDrag(
          node.id,
          { x: node.x, y: node.y, z: node.z },
          state.canonicalById,
          state.clusterOffsets,
          nodeById()
        );
        state.nodeOffsets.set(node.id, offset);
        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.z;
        persist();
        updateControls();
      });
    }
  }

  function wrappedFactory() {
    const mount = originalFactory.apply(this, arguments);
    return function () {
      const renderer = mount.apply(this, arguments);
      installRenderer(renderer);
      return renderer;
    };
  }
  Object.assign(wrappedFactory, originalFactory);
  window.ForceGraph3D = wrappedFactory;

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }

  function canonicalPositions(conformation) {
    const scale = Number(conformation.coordinate_encoding.scale);
    const result = new Map();
    for (const record of conformation.nodes || []) {
      if (!record || typeof record.node_id !== "string") continue;
      result.set(record.node_id, {
        x: Number(record.aligned.x) / scale,
        y: Number(record.aligned.y) / scale,
        z: Number(record.aligned.z) / scale
      });
    }
    return result;
  }

  function storageKey() {
    return `trureturing.pages.exploration.${state.releaseKey}`;
  }

  function loadSession() {
    if (!state.sessionKey) return;
    const validNodes = new Set(state.graph.nodes.map((node) => node.id));
    const validClusters = new Set(
      (state.graph.clusters || []).map((cluster) => cluster.cluster_id)
    );
    const restored = Exploration.decodeSession(
      sessionStorage.getItem(state.sessionKey),
      state.releaseKey,
      validNodes,
      validClusters
    );
    if (!restored) return;
    state.nodeOffsets = restored.nodeOffsets;
    state.clusterOffsets = restored.clusterOffsets;
    state.expansion = restored.expansion;
  }

  function persist() {
    if (!state.sessionKey) return;
    if (!state.nodeOffsets.size && !state.clusterOffsets.size
        && state.expansion.upstreamHops === 2
        && state.expansion.downstreamHops === 2
        && !state.expansion.includeRelated) {
      sessionStorage.removeItem(state.sessionKey);
      return;
    }
    sessionStorage.setItem(
      state.sessionKey,
      Exploration.encodeSession(
        state.releaseKey,
        state.nodeOffsets,
        state.clusterOffsets,
        state.expansion
      )
    );
  }

  function currentSelection() {
    const detail = document.querySelector("#node-detail");
    return detail && detail.dataset.nodeId || null;
  }

  function activeMode() {
    const button = document.querySelector("[data-atlas-mode][aria-pressed='true']");
    return button && button.dataset.atlasMode || "structure";
  }

  function activeState() {
    const button = document.querySelector("[data-state][aria-pressed='true']");
    return button && button.dataset.state || "All";
  }

  function activeCluster() {
    const select = document.querySelector("#cluster-filter");
    return select && select.value || "All";
  }

  function baseOptions(selectedId) {
    return {
      mode: activeMode(),
      state: activeState(),
      clusterId: activeCluster(),
      selectedId
    };
  }

  function expandedFocusData() {
    const selectedId = currentSelection();
    if (!selectedId || !state.model) return null;
    const options = baseOptions(selectedId);
    const near = Semantic.graphView(state.model, options, "near");
    const focus = Exploration.focusGraphView(
      state.model,
      {
        ...options,
        upstreamHops: state.expansion.upstreamHops,
        downstreamHops: state.expansion.downstreamHops,
        includeRelated: state.expansion.includeRelated,
        allowedNodeIds: near.nodeIds
      },
      { ...near, level: "focus" }
    );
    return {
      nodes: focus.nodes.map((node) => {
        const position = state.canonicalById.get(node.id);
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
      links: focus.edges.map((edge) => ({ ...edge }))
    };
  }

  function render(data, customFocus) {
    if (!state.renderer || !state.originalGraphData) return;
    state.rendering = true;
    try {
      state.customFocus = Boolean(customFocus);
      state.originalGraphData(applyOffsets(cloneData(data)));
    } finally {
      state.rendering = false;
    }
    updateControls();
  }

  function renderCurrent() {
    const focus = state.customFocus ? expandedFocusData() : null;
    render(focus || state.baseData, Boolean(focus));
  }

  function renderExpandedFocus() {
    const focus = expandedFocusData();
    if (!focus) return;
    render(focus, true);
    persist();
  }

  function selectedClusterId() {
    const selectedId = currentSelection();
    if (selectedId && state.model && state.model.nodeById.has(selectedId)) {
      return state.model.nodeById.get(selectedId).atlas_cluster_id || null;
    }
    const cluster = activeCluster();
    return cluster === "All" ? null : cluster;
  }

  function peelCluster() {
    const clusterId = selectedClusterId();
    if (!clusterId || !state.model || !state.model.clusterById.has(clusterId)) return;
    const cluster = state.model.clusterById.get(clusterId);
    const positions = displayPositions();
    const offset = Exploration.peelOffset(
      clusterId,
      cluster.member_node_ids || [],
      [...state.canonicalById.keys()],
      positions,
      280
    );
    state.clusterOffsets.set(clusterId, offset);
    persist();
    renderCurrent();
  }

  function returnSelectedNode() {
    const selectedId = currentSelection();
    if (!selectedId) return;
    state.nodeOffsets.delete(selectedId);
    persist();
    renderCurrent();
  }

  function resetExploration() {
    state.nodeOffsets.clear();
    state.clusterOffsets.clear();
    state.expansion = {
      upstreamHops: 2,
      downstreamHops: 2,
      includeRelated: false
    };
    state.customFocus = false;
    if (state.sessionKey) sessionStorage.removeItem(state.sessionKey);
    render(state.baseData, false);
  }

  function button(id, label, handler) {
    const value = document.createElement("button");
    value.id = id;
    value.type = "button";
    value.className = "atlas-exploration-action";
    value.textContent = label;
    value.addEventListener("click", handler);
    return value;
  }

  function installControls() {
    const contextBar = document.querySelector("#atlas-context-bar");
    if (!contextBar || document.querySelector("#atlas-exploration-actions")) return;
    const group = document.createElement("div");
    group.id = "atlas-exploration-actions";
    group.className = "atlas-exploration-actions";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Local spatial exploration");

    group.append(
      button("expand-foundations", "Foundations +", () => {
        state.expansion.upstreamHops = Math.min(
          Exploration.MAX_HOPS,
          state.expansion.upstreamHops + 1
        );
        renderExpandedFocus();
      }),
      button("expand-consequences", "Consequences +", () => {
        state.expansion.downstreamHops = Math.min(
          Exploration.MAX_HOPS,
          state.expansion.downstreamHops + 1
        );
        renderExpandedFocus();
      }),
      button("expand-related", "Related", () => {
        state.expansion.includeRelated = !state.expansion.includeRelated;
        renderExpandedFocus();
      }),
      button("atlas-peel", "Peel community", peelCluster),
      button("return-node", "Return node", returnSelectedNode),
      button("reset-exploration", "Reset exploration", resetExploration)
    );
    contextBar.append(group);
    updateControls();
  }

  function updateControls() {
    const selectedId = currentSelection();
    const selected = Boolean(selectedId);
    const cluster = Boolean(selectedClusterId());
    const foundations = document.querySelector("#expand-foundations");
    const consequences = document.querySelector("#expand-consequences");
    const related = document.querySelector("#expand-related");
    const peel = document.querySelector("#atlas-peel");
    const returnNode = document.querySelector("#return-node");
    const reset = document.querySelector("#reset-exploration");
    if (foundations) {
      foundations.disabled = !selected || state.expansion.upstreamHops >= Exploration.MAX_HOPS;
      foundations.textContent = `Foundations ${state.expansion.upstreamHops}`;
    }
    if (consequences) {
      consequences.disabled = !selected || state.expansion.downstreamHops >= Exploration.MAX_HOPS;
      consequences.textContent = `Consequences ${state.expansion.downstreamHops}`;
    }
    if (related) {
      related.disabled = !selected;
      related.setAttribute("aria-pressed", String(state.expansion.includeRelated));
    }
    if (peel) peel.disabled = !cluster;
    if (returnNode) {
      returnNode.disabled = !selected || !state.nodeOffsets.has(selectedId);
    }
    if (reset) {
      reset.disabled = !state.nodeOffsets.size
        && !state.clusterOffsets.size
        && !state.customFocus;
    }
  }

  function observeSelection() {
    const detail = document.querySelector("#node-detail");
    if (!detail) return;
    let previous = detail.dataset.nodeId || null;
    new MutationObserver(() => {
      const current = detail.dataset.nodeId || null;
      if (current !== previous) {
        previous = current;
        state.expansion = {
          upstreamHops: 2,
          downstreamHops: 2,
          includeRelated: false
        };
        state.customFocus = false;
      }
      updateControls();
    }).observe(detail, { attributes: true, attributeFilter: ["data-node-id"] });
  }

  Promise.all([
    fetchJson("data/pages-atlas-view.v1.json"),
    fetchJson("data/pages-atlas-manifest.v1.json"),
    fetchJson("data/pages-conformation.v1.json")
  ]).then(([graph, manifest, conformation]) => {
    state.graph = graph;
    state.manifest = manifest;
    state.conformation = conformation;
    state.model = Atlas.createModel(graph, conformation);
    state.canonicalById = canonicalPositions(conformation);
    state.releaseKey = manifest.conformation_digest
      || manifest.topology_atlas_digest
      || manifest.truth_release_digest;
    state.sessionKey = storageKey();
    loadSession();
    state.ready = true;
    installControls();
    observeSelection();
    if (state.renderer && state.baseData.nodes.length) renderCurrent();
  }).catch((error) => {
    console.warn("Local Atlas exploration is unavailable:", error);
  });
}());
