(function () {
  "use strict";

  const Core = window.TrureturingCounterfactualPreviewCore;
  const originalFactory = window.ForceGraph3D;
  if (!Core || typeof originalFactory !== "function") return;

  const state = {
    renderer: null,
    manifest: null,
    graph: null,
    conformation: null,
    canonicalPositions: new Map(),
    clusterCentroids: new Map(),
    preview: null,
    projection: null,
    svg: null,
    layer: null,
    panel: null,
    endpoint: null,
    animation: null
  };

  function scalePoint(point, scale) {
    return {
      x: Number(point.x) / scale,
      y: Number(point.y) / scale,
      z: Number(point.z) / scale
    };
  }

  function installRenderer(renderer) {
    state.renderer = renderer;
    ensureSurface();
    redraw();
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

  async function fetchJson(path, options) {
    const response = await fetch(path, {
      cache: "no-store",
      credentials: "omit",
      ...options
    });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }

  function svgElement(name, attributes) {
    const value = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, item] of Object.entries(attributes || {})) {
      value.setAttribute(key, String(item));
    }
    return value;
  }

  function ensureSurface() {
    if (state.svg) return;
    const stage = document.querySelector(".graph-stage");
    if (!stage) return;
    const svg = svgElement("svg", {
      id: "counterfactual-preview-overlay",
      class: "counterfactual-preview-overlay",
      "aria-hidden": "true"
    });
    const layer = svgElement("g", { class: "counterfactual-preview-layer" });
    svg.append(layer);
    stage.append(svg);
    state.svg = svg;
    state.layer = layer;

    const panel = document.createElement("section");
    panel.id = "counterfactual-preview-panel";
    panel.className = "counterfactual-preview-panel";
    panel.hidden = true;
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">Advisory counterfactual</p>
          <h2>Structural preview</h2>
        </div>
        <button type="button" data-preview-clear>Clear preview</button>
      </header>
      <p data-preview-classification class="counterfactual-preview-classification"></p>
      <dl data-preview-summary class="counterfactual-preview-summary"></dl>
      <p class="counterfactual-preview-boundary">Ghost geometry and predicted deltas are advisory. This preview does not change the release conformation or certify a dependency.</p>`;
    panel.querySelector("[data-preview-clear]").addEventListener("click", clear);
    stage.append(panel);
    state.panel = panel;
  }

  function screen(point) {
    if (!state.renderer || !point) return null;
    const value = state.renderer.graph2ScreenCoords(point.x, point.y, point.z);
    return value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? value
      : null;
  }

  function line(source, target, className) {
    const left = screen(source);
    const right = screen(target);
    if (!left || !right) return null;
    return svgElement("line", {
      x1: left.x,
      y1: left.y,
      x2: right.x,
      y2: right.y,
      class: className
    });
  }

  function label(point, text, className) {
    const location = screen(point);
    if (!location) return null;
    const value = svgElement("text", {
      x: location.x + 9,
      y: location.y - 9,
      class: className
    });
    value.textContent = text;
    return value;
  }

  function renderPanel() {
    ensureSurface();
    if (!state.panel) return;
    if (!state.preview) {
      state.panel.hidden = true;
      return;
    }
    const summary = Core.summary(state.preview);
    state.panel.hidden = false;
    state.panel.dataset.classification = summary.classification;
    const classification = state.panel.querySelector("[data-preview-classification]");
    classification.textContent = summary.cycleRisk
      ? "Cycle risk. Topology rejected this graph edit."
      : `${summary.classification.replaceAll("-", " ")}. ${summary.accepted ? "Topology accepted the graph edit for analysis." : "Topology did not accept the graph edit."}`;
    const metrics = state.preview.metrics;
    const rows = [
      ["Nodes", `+${summary.addedNodes}`],
      ["Edges", `+${summary.addedEdges} / −${summary.removedEdges}`],
      ["Reachability", `+${metrics.reachability_gain} / −${metrics.reachability_loss}`],
      ["Path compression", metrics.path_compression],
      ["Cut bridges", `+${metrics.new_cut_bridge_count} / −${metrics.removed_cut_bridge_count}`],
      ["Interfaces", `+${metrics.new_interface_count} / −${metrics.removed_interface_count}`]
    ];
    const container = state.panel.querySelector("[data-preview-summary]");
    container.replaceChildren(...rows.flatMap(([term, description]) => {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = description;
      return [dt, dd];
    }));
  }

  function redraw() {
    ensureSurface();
    if (!state.layer) return;
    state.layer.replaceChildren();
    if (!state.preview || !state.projection || !state.renderer) return;

    const fragments = [];
    for (const change of state.projection.interfaces) {
      const value = line(
        change.source,
        change.target,
        `counterfactual-interface counterfactual-${change.relation}`
      );
      if (value) fragments.push(value);
    }
    for (const change of state.projection.paths) {
      const value = line(
        change.source,
        change.target,
        "counterfactual-path-change"
      );
      if (value) fragments.push(value);
      const text = change.before_distance != null && change.after_distance != null
        ? `${change.before_distance} → ${change.after_distance}`
        : "path change";
      const caption = label(change.target, text, "counterfactual-path-label");
      if (caption) fragments.push(caption);
    }
    for (const edge of state.projection.edges) {
      const value = line(
        edge.source,
        edge.target,
        `counterfactual-edge counterfactual-${edge.operation}`
      );
      if (value) fragments.push(value);
      if (edge.operation === "remove-edge") {
        const midpoint = {
          x: (edge.source.x + edge.target.x) / 2,
          y: (edge.source.y + edge.target.y) / 2,
          z: (edge.source.z + edge.target.z) / 2
        };
        const cross = label(midpoint, "×", "counterfactual-remove-label");
        if (cross) fragments.push(cross);
      }
    }
    for (const node of state.projection.nodes) {
      const location = screen(node.position);
      if (!location) continue;
      fragments.push(svgElement("circle", {
        cx: location.x,
        cy: location.y,
        r: 7,
        class: "counterfactual-ghost-node"
      }));
      const caption = label(
        node.position,
        node.id,
        "counterfactual-ghost-label"
      );
      if (caption) fragments.push(caption);
    }
    state.layer.append(...fragments);
  }

  function animate() {
    if (!state.preview) {
      state.animation = null;
      return;
    }
    redraw();
    state.animation = window.requestAnimationFrame(animate);
  }

  function show(payload) {
    if (!state.manifest || !state.conformation) {
      throw new Error("The release-bound Atlas has not finished loading.");
    }
    const preview = Core.validate(payload, state.manifest);
    state.preview = preview;
    state.projection = Core.project(
      preview,
      state.canonicalPositions,
      state.clusterCentroids
    );
    renderPanel();
    redraw();
    if (!state.animation) state.animation = window.requestAnimationFrame(animate);
    window.dispatchEvent(new CustomEvent(
      "trureturing:counterfactual-preview-changed",
      { detail: snapshot() }
    ));
    return snapshot();
  }

  function clear() {
    state.preview = null;
    state.projection = null;
    if (state.animation) {
      window.cancelAnimationFrame(state.animation);
      state.animation = null;
    }
    if (state.layer) state.layer.replaceChildren();
    renderPanel();
    window.dispatchEvent(new CustomEvent(
      "trureturing:counterfactual-preview-changed",
      { detail: null }
    ));
  }

  function snapshot() {
    if (!state.preview) return null;
    return {
      candidate_ref: state.preview.candidate_ref,
      valuation_ref: state.preview.valuation_ref,
      counterfactual_ref: state.preview.counterfactual_ref,
      classification: state.preview.classification,
      accepted: state.preview.accepted,
      cycle_risk: state.preview.cycle_risk,
      authority: "advisory"
    };
  }

  async function load(valuationRef) {
    if (!Core.DIGEST.test(String(valuationRef || ""))) {
      throw new TypeError("valuationRef must be sha256:<64 lowercase hex>");
    }
    if (!state.endpoint) {
      throw new Error("The release does not publish a counterfactual preview endpoint.");
    }
    const endpoint = state.endpoint.includes("{valuation_ref}")
      ? state.endpoint.replace("{valuation_ref}", encodeURIComponent(valuationRef))
      : `${state.endpoint}${state.endpoint.includes("?") ? "&" : "?"}valuation_ref=${encodeURIComponent(valuationRef)}`;
    return show(await fetchJson(endpoint));
  }

  window.TrureturingCounterfactualPreview = Object.freeze({
    clear,
    load,
    show,
    snapshot
  });

  window.addEventListener("trureturing:counterfactual-preview", (event) => {
    try {
      show(event.detail);
    } catch (error) {
      console.warn("Counterfactual preview was rejected:", error);
    }
  });

  Promise.all([
    fetchJson("data/pages-atlas-view.v1.json"),
    fetchJson("data/pages-atlas-manifest.v1.json"),
    fetchJson("data/pages-conformation.v1.json"),
    fetchJson("data/research-agent.v1.json").catch(() => ({}))
  ]).then(([graph, manifest, conformation, agent]) => {
    state.graph = graph;
    state.manifest = manifest;
    state.conformation = conformation;
    state.endpoint = agent.counterfactual_preview_endpoint || null;
    const scale = Number(conformation.coordinate_encoding.scale);
    for (const value of conformation.nodes || []) {
      state.canonicalPositions.set(
        value.node_id,
        scalePoint(value.aligned, scale)
      );
    }
    for (const region of conformation.regions || []) {
      if (region.aligned_centroid) {
        state.clusterCentroids.set(
          region.region_id,
          scalePoint(region.aligned_centroid, scale)
        );
      }
    }
    ensureSurface();
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const requested = hash.get("counterfactual");
    if (requested) load(requested).catch((error) => {
      console.warn("Counterfactual preview could not be loaded:", error);
    });
  }).catch((error) => {
    console.warn("Counterfactual preview is unavailable:", error);
  });
}());
