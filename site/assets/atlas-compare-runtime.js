(function () {
  "use strict";

  const Compare = window.TrureturingAtlasCompare;
  const Atlas = window.TrureturingAtlasStructure;
  const Semantic = window.TrureturingAtlasSemanticZoom;
  const originalFactory = window.ForceGraph3D;
  if (!Compare || !Atlas || !Semantic || typeof originalFactory !== "function") {
    return;
  }

  const state = {
    renderer: null,
    graph: null,
    conformation: null,
    model: null,
    positions: new Map(),
    comparison: null,
    anchorNodeId: null,
    anchorClusterId: null,
    armedKind: null,
    pathOnly: false,
    shiftDown: false,
    previousSelection: null,
    ready: false
  };

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function installRenderer(renderer) {
    if (!renderer || state.renderer) return;
    state.renderer = renderer;
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
    return new Map((conformation.nodes || []).map((record) => [
      record.node_id,
      {
        x: Number(record.aligned.x) / scale,
        y: Number(record.aligned.y) / scale,
        z: Number(record.aligned.z) / scale
      }
    ]));
  }

  function currentSelection() {
    const detail = document.querySelector("#node-detail");
    return detail && detail.dataset.nodeId || null;
  }

  function currentCluster() {
    const select = document.querySelector("#cluster-filter");
    return select && select.value !== "All" ? select.value : null;
  }

  function currentMode() {
    const button = document.querySelector("[data-atlas-mode][aria-pressed='true']");
    return button && button.dataset.atlasMode || "structure";
  }

  function currentStateFilter() {
    const button = document.querySelector("[data-state][aria-pressed='true']");
    return button && button.dataset.state || "All";
  }

  function nodeRecord(node) {
    const position = state.positions.get(node.id) || { x: 0, y: 0, z: 0 };
    return {
      ...node,
      x: position.x,
      y: position.y,
      z: position.z,
      fx: position.x,
      fy: position.y,
      fz: position.z
    };
  }

  function comparisonView() {
    if (!state.comparison) return null;
    const highlight = Compare.highlight(
      state.model,
      state.comparison,
      state.pathOnly
    );
    const nodeIds = new Set(highlight.nodeIds);

    if (state.comparison.kind === "node-pair") {
      nodeIds.add(state.comparison.left.id);
      nodeIds.add(state.comparison.right.id);
    } else {
      for (const id of state.comparison.left.representativeNodeIds || []) nodeIds.add(id);
      for (const id of state.comparison.right.representativeNodeIds || []) nodeIds.add(id);
    }

    const nodes = state.graph.nodes
      .filter((node) => nodeIds.has(node.id))
      .slice(0, 160)
      .map(nodeRecord);
    const kept = new Set(nodes.map((node) => node.id));
    const links = state.model.edges.filter((edge) => {
      if (!kept.has(edge.source) || !kept.has(edge.target)) return false;
      if (edge.authority === "certified") return true;
      if (state.comparison.kind !== "node-pair") return false;
      return (edge.source === state.comparison.left.id
        && edge.target === state.comparison.right.id)
        || (edge.source === state.comparison.right.id
          && edge.target === state.comparison.left.id);
    }).map((edge) => ({ ...edge }));
    return { nodes, links, highlight };
  }

  function applyComparisonView() {
    if (!state.renderer || !state.comparison) return;
    const view = comparisonView();
    if (!view) return;
    const pathEdges = view.highlight.edgeKeys;
    const comparisonNodes = view.highlight.nodeIds;
    const leftId = state.comparison.kind === "node-pair"
      ? state.comparison.left.id
      : null;
    const rightId = state.comparison.kind === "node-pair"
      ? state.comparison.right.id
      : null;

    state.renderer.graphData({ nodes: view.nodes, links: view.links })
      .nodeColor((node) => {
        if (node.id === leftId) return "#7ed8ff";
        if (node.id === rightId) return "#f4cf7b";
        if (comparisonNodes.has(node.id)) return "#a6c9bc";
        return Atlas.clusterColor(
          node.atlas_cluster_id,
          node.state || node.status,
          false
        );
      })
      .linkColor((link) => {
        const source = endpointId(link.source);
        const target = endpointId(link.target);
        const key = Compare.edgeKey(source, target);
        if (pathEdges.has(key)) return "rgba(126,216,255,0.96)";
        if (link.cluster_relation === "inter-cluster") {
          return "rgba(244,207,123,0.88)";
        }
        if (link.authority === "derived") return "rgba(202,166,255,0.76)";
        return "rgba(171,205,196,0.34)";
      })
      .linkWidth((link) => {
        const key = Compare.edgeKey(
          endpointId(link.source),
          endpointId(link.target)
        );
        if (pathEdges.has(key)) return 2.6;
        if (link.cluster_relation === "inter-cluster") return 1.8;
        return link.authority === "certified" ? 0.65 : 0.42;
      });
    window.setTimeout(() => state.renderer.zoomToFit(600, 85), 80);
    renderPanel();
    updateControls();
  }

  function restoreAtlasView() {
    const active = document.querySelector(
      "[data-atlas-mode][aria-pressed='true']"
    );
    if (active) active.click();
  }

  function clearComparison({ restore = true } = {}) {
    state.comparison = null;
    state.anchorNodeId = null;
    state.anchorClusterId = null;
    state.armedKind = null;
    state.pathOnly = false;
    const panel = document.querySelector("#atlas-compare-panel");
    if (panel) panel.hidden = true;
    if (restore) restoreAtlasView();
    updateControls();
  }

  function beginNodeComparison() {
    const selected = currentSelection();
    if (!selected) return;
    state.anchorNodeId = selected;
    state.anchorClusterId = null;
    state.armedKind = "node";
    state.comparison = null;
    setMessage(`Comparison anchored at ${Compare.title(state.model, selected)}. Select a second concept.`);
    updateControls();
  }

  function beginClusterComparison() {
    const cluster = currentCluster();
    if (!cluster) return;
    state.anchorClusterId = cluster;
    state.anchorNodeId = null;
    state.armedKind = "cluster";
    state.comparison = null;
    const value = state.model.clusterById.get(cluster);
    setMessage(`Comparison anchored at ${value && value.display_label || "selected community"}. Choose another community.`);
    updateControls();
  }

  function compareNodes(leftId, rightId) {
    if (!leftId || !rightId || leftId === rightId) return;
    try {
      state.comparison = Compare.nodeComparison(state.model, leftId, rightId);
      state.anchorNodeId = leftId;
      state.armedKind = null;
      state.pathOnly = false;
      applyComparisonView();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function compareClusters(leftId, rightId) {
    if (!leftId || !rightId || leftId === rightId) return;
    try {
      state.comparison = Compare.clusterComparison(state.model, leftId, rightId);
      state.anchorClusterId = leftId;
      state.armedKind = null;
      state.pathOnly = false;
      applyComparisonView();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function setMessage(text) {
    const status = document.querySelector("#graph-status");
    if (status) status.textContent = text;
  }

  function paragraph(text, className) {
    const value = document.createElement("p");
    if (className) value.className = className;
    value.textContent = text;
    return value;
  }

  function heading(level, text) {
    const value = document.createElement(`h${level}`);
    value.textContent = text;
    return value;
  }

  function nodeList(titleText, ids) {
    const section = document.createElement("section");
    section.className = "atlas-compare-list";
    section.append(heading(4, titleText));
    if (!ids.length) {
      section.append(paragraph("None in the bounded release graph.", "atlas-compare-empty"));
      return section;
    }
    const list = document.createElement("ol");
    for (const id of ids.slice(0, 16)) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = Compare.title(state.model, id);
      button.addEventListener("click", () => focusNode(id));
      item.append(button);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function focusNode(id) {
    const input = document.querySelector("#node-query");
    const form = document.querySelector("#node-search");
    if (!input || !form) return;
    input.value = id;
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    window.setTimeout(() => {
      if (state.comparison) applyComparisonView();
    }, 140);
  }

  function renderPath(container, comparison) {
    const path = comparison.certifiedPath;
    const section = document.createElement("section");
    section.className = "atlas-path-reader";
    section.append(heading(3, "Certified dependency path"));
    if (!path) {
      section.append(paragraph(
        "No directed certified dependency path exists between the selected concepts in either direction.",
        "atlas-compare-empty"
      ));
      return section;
    }
    const direction = path.direction === "left-to-right"
      ? `${comparison.left.title} feeds into ${comparison.right.title}`
      : `${comparison.right.title} feeds into ${comparison.left.title}`;
    section.append(paragraph(
      `${direction}. ${path.length} certified step${path.length === 1 ? "" : "s"}.`,
      "atlas-compare-summary"
    ));
    const list = document.createElement("ol");
    list.className = "atlas-path-steps";
    for (const step of Compare.pathSteps(state.model, path)) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${step.index}. ${step.title}`;
      button.addEventListener("click", () => focusNode(step.nodeId));
      const depth = document.createElement("small");
      depth.textContent = `Certified depth ${step.depth}`;
      item.append(button, depth);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function renderNodeComparison(body, comparison) {
    body.append(
      heading(2, `${comparison.left.title} ↔ ${comparison.right.title}`),
      paragraph(
        comparison.sameCluster
          ? "Both concepts belong to the same published structural community."
          : "The concepts belong to different published structural communities.",
        "atlas-compare-summary"
      ),
      renderPath(body, comparison)
    );

    if (comparison.derivedRelation) {
      body.append(paragraph(
        `A deterministic structural affinity is published for this pair${comparison.derivedRelation.rank ? ` at rank ${comparison.derivedRelation.rank}` : ""}. This is derived proximity and is not a proof dependency.`,
        "atlas-compare-derived"
      ));
    }

    const grid = document.createElement("div");
    grid.className = "atlas-compare-grid";
    grid.append(
      nodeList("Shared prerequisites", comparison.sharedPrerequisites),
      nodeList(`${comparison.left.title} only`, comparison.leftOnlyPrerequisites),
      nodeList(`${comparison.right.title} only`, comparison.rightOnlyPrerequisites),
      nodeList("Shared consequences", comparison.sharedDependents)
    );
    body.append(grid);
  }

  function renderClusterComparison(body, comparison) {
    body.append(
      heading(2, `${comparison.left.label} ↔ ${comparison.right.label}`),
      paragraph(
        comparison.certifiedInterfacePresent
          ? `${comparison.crossEdges.length} certified cross-community dependency${comparison.crossEdges.length === 1 ? "" : "ies"} form an existing interface.`
          : "No certified cross-community dependency currently forms an interface between these communities.",
        "atlas-compare-summary"
      )
    );
    const grid = document.createElement("div");
    grid.className = "atlas-compare-grid";
    grid.append(
      nodeList("Left boundary", comparison.leftBoundaryNodeIds),
      nodeList("Right boundary", comparison.rightBoundaryNodeIds),
      nodeList("Shared foundations", comparison.sharedFoundationNodeIds),
      nodeList("Shared consequences", comparison.sharedConsequenceNodeIds)
    );
    body.append(grid);

    const interfaceSection = document.createElement("section");
    interfaceSection.className = "atlas-interface-list";
    interfaceSection.append(heading(3, "Certified interface"));
    if (!comparison.crossEdges.length) {
      interfaceSection.append(paragraph(
        "No certified interface edge is present. Any proposed connection remains a future Intuition candidate.",
        "atlas-compare-empty"
      ));
    } else {
      const list = document.createElement("ol");
      for (const edge of comparison.crossEdges.slice(0, 24)) {
        const item = document.createElement("li");
        item.textContent = `${Compare.title(state.model, edge.source)} → ${Compare.title(state.model, edge.target)}${edge.isCutBridge ? " · cut bridge" : ""}`;
        list.append(item);
      }
      interfaceSection.append(list);
    }
    body.append(interfaceSection);
  }

  function renderPanel() {
    const panel = document.querySelector("#atlas-compare-panel");
    if (!panel || !state.comparison) return;
    panel.hidden = false;
    const body = panel.querySelector(".atlas-compare-body");
    body.replaceChildren();
    if (state.comparison.kind === "node-pair") {
      renderNodeComparison(body, state.comparison);
    } else {
      renderClusterComparison(body, state.comparison);
    }
  }

  function createButton(id, text, handler) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "atlas-compare-action";
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
  }

  function installUi() {
    const contextBar = document.querySelector("#atlas-context-bar");
    const stage = document.querySelector(".graph-stage");
    if (!contextBar || !stage || document.querySelector("#atlas-compare-actions")) return;

    const controls = document.createElement("div");
    controls.id = "atlas-compare-actions";
    controls.className = "atlas-compare-actions";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Compare Atlas structures");
    controls.append(
      createButton("compare-concept", "Compare concept", beginNodeComparison),
      createButton("compare-community", "Compare community", beginClusterComparison),
      createButton("compare-path-only", "Path only", () => {
        if (!state.comparison) return;
        state.pathOnly = !state.pathOnly;
        applyComparisonView();
      }),
      createButton("clear-comparison", "Clear compare", () => clearComparison())
    );
    contextBar.append(controls);

    const panel = document.createElement("aside");
    panel.id = "atlas-compare-panel";
    panel.className = "atlas-compare-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Atlas comparison and certified path");
    const header = document.createElement("header");
    header.append(
      paragraph("Release-bound comparison", "eyebrow"),
      createButton("close-comparison", "Close", () => clearComparison())
    );
    const body = document.createElement("div");
    body.className = "atlas-compare-body";
    panel.append(header, body);
    stage.append(panel);
    updateControls();
  }

  function updateControls() {
    const compareConcept = document.querySelector("#compare-concept");
    const compareCluster = document.querySelector("#compare-community");
    const pathOnly = document.querySelector("#compare-path-only");
    const clear = document.querySelector("#clear-comparison");
    if (compareConcept) {
      compareConcept.disabled = !currentSelection();
      compareConcept.setAttribute("aria-pressed", String(state.armedKind === "node"));
    }
    if (compareCluster) {
      compareCluster.disabled = !currentCluster();
      compareCluster.setAttribute("aria-pressed", String(state.armedKind === "cluster"));
    }
    if (pathOnly) {
      pathOnly.disabled = !state.comparison;
      pathOnly.setAttribute("aria-pressed", String(state.pathOnly));
    }
    if (clear) clear.disabled = !state.comparison && !state.armedKind;
  }

  function observeSelections() {
    const detail = document.querySelector("#node-detail");
    const cluster = document.querySelector("#cluster-filter");
    if (detail) {
      state.previousSelection = detail.dataset.nodeId || null;
      new MutationObserver(() => {
        const current = detail.dataset.nodeId || null;
        const previous = state.previousSelection;
        state.previousSelection = current;
        if (state.armedKind === "node" && state.anchorNodeId && current
            && current !== state.anchorNodeId) {
          compareNodes(state.anchorNodeId, current);
        } else if (state.shiftDown && previous && current && previous !== current) {
          compareNodes(previous, current);
        } else if (state.comparison) {
          window.setTimeout(applyComparisonView, 80);
        }
        updateControls();
      }).observe(detail, { attributes: true, attributeFilter: ["data-node-id"] });
    }
    if (cluster) {
      cluster.addEventListener("change", () => {
        const current = currentCluster();
        if (state.armedKind === "cluster" && state.anchorClusterId && current
            && current !== state.anchorClusterId) {
          window.setTimeout(() => compareClusters(
            state.anchorClusterId,
            current
          ), 100);
        }
        updateControls();
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Shift" || event.repeat) return;
      state.shiftDown = true;
      const selected = currentSelection();
      if (selected && !state.comparison) {
        state.anchorNodeId = selected;
        state.armedKind = "node";
        updateControls();
      }
    });
    document.addEventListener("keyup", (event) => {
      if (event.key === "Shift") state.shiftDown = false;
    });
  }

  Promise.all([
    fetchJson("data/pages-atlas-view.v1.json"),
    fetchJson("data/pages-conformation.v1.json")
  ]).then(([graph, conformation]) => {
    state.graph = graph;
    state.conformation = conformation;
    state.model = Atlas.createModel(graph, conformation);
    state.positions = canonicalPositions(conformation);
    state.ready = true;
    installUi();
    observeSelections();
  }).catch((error) => {
    console.warn("Atlas comparison is unavailable:", error);
  });
}());
