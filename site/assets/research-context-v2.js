(function () {
  "use strict";

  const Core = window.TrureturingResearchContextV2Core;
  if (!Core) return;
  const originalFetch = window.fetch.bind(window);
  const state = {
    graph: null,
    manifest: null,
    conformation: null,
    evidence: null,
    model: null,
    agent: null,
    endpoint: null,
    selectedPathRef: null,
    current: null,
    badge: null
  };

  async function fetchJson(path) {
    const response = await originalFetch(path, {
      cache: "no-store",
      credentials: "omit"
    });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }

  async function sha256(value) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder !== "function") {
      throw new Error("This browser cannot bind structural research context.");
    }
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${[...new Uint8Array(digest)]
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function comparisonSnapshot() {
    const comparison = window.TrureturingAtlasComparisonState;
    return comparison && typeof comparison.snapshot === "function"
      ? comparison.snapshot()
      : null;
  }

  function currentSelection() {
    const comparison = comparisonSnapshot();
    if (comparison && Array.isArray(comparison.selected_node_ids)
        && comparison.selected_node_ids.length) {
      return {
        selected_node_ids: comparison.selected_node_ids,
        selected_cluster_ids: comparison.selected_cluster_ids || [],
        selected_path_ref: comparison.selected_path_ref || state.selectedPathRef,
        counterfactual_preview: window.TrureturingCounterfactualPreview
          && window.TrureturingCounterfactualPreview.snapshot()
      };
    }
    const detail = document.querySelector("#node-detail");
    const nodeId = detail && detail.dataset.nodeId;
    const cluster = document.querySelector("#cluster-filter");
    const clusterId = cluster && cluster.value !== "All" ? cluster.value : null;
    return {
      selected_node_ids: nodeId ? [nodeId] : [],
      selected_cluster_ids: clusterId ? [clusterId] : [],
      selected_path_ref: state.selectedPathRef,
      counterfactual_preview: window.TrureturingCounterfactualPreview
        && window.TrureturingCounterfactualPreview.snapshot()
    };
  }

  function coordinates() {
    return {
      truth_release_digest: state.manifest.truth_release_digest,
      certified_topology_digest: state.manifest.certified_topology_digest,
      topology_atlas_digest: state.manifest.topology_atlas_digest,
      pages_conformation_digest: state.manifest.conformation_digest,
      topology_atlas_evidence_digest:
        state.agent.topology_atlas_evidence_digest
        || state.manifest.topology_atlas_evidence_digest
        || null
    };
  }

  async function build() {
    if (!state.model || !state.manifest || !state.agent) {
      throw new Error("Structural research context has not finished loading.");
    }
    const content = Core.buildContent(
      state.model,
      coordinates(),
      currentSelection()
    );
    const contextId = await sha256(Core.canonical(content));
    const context = {
      schema: Core.SCHEMA,
      context_id: contextId,
      context_content: content
    };
    state.current = context;
    updateBadge("ready", content.evidence_status);
    window.dispatchEvent(new CustomEvent(
      "trureturing:research-context-v2-changed",
      { detail: context }
    ));
    return context;
  }

  function endpointFromAgent(agent) {
    return agent.research_endpoint
      || agent.endpoint
      || agent.invoke_endpoint
      || agent.api_url
      || null;
  }

  function comparableUrl(value) {
    try {
      return new URL(value, window.location.href).href;
    } catch (_) {
      return String(value || "");
    }
  }

  function isResearchRequest(input, init) {
    if (!state.endpoint || !state.agent
        || state.agent.research_context_schema !== Core.SCHEMA) {
      return false;
    }
    const method = String(init && init.method || "GET").toUpperCase();
    if (method !== "POST") return false;
    const url = typeof input === "string" || input instanceof URL
      ? String(input)
      : input && input.url;
    return comparableUrl(url) === comparableUrl(state.endpoint);
  }

  window.fetch = async function (input, init) {
    if (!isResearchRequest(input, init) || !init || typeof init.body !== "string") {
      return originalFetch(input, init);
    }
    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch (_) {
      return originalFetch(input, init);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return originalFetch(input, init);
    }
    if (!payload.research_context_v2) {
      payload.research_context_v2 = await build();
    }
    const headers = new Headers(init.headers || {});
    headers.set("content-type", "application/json");
    return originalFetch(input, {
      ...init,
      headers,
      body: JSON.stringify(payload)
    });
  };

  function installBadge() {
    if (state.badge) return;
    const context = document.querySelector("#research-node-context")
      || document.querySelector("#research-form-status");
    if (!context) return;
    const badge = document.createElement("p");
    badge.id = "research-context-v2-status";
    badge.className = "research-context-v2-status";
    badge.dataset.tone = "waiting";
    badge.textContent = "Structural context v2 is loading.";
    context.append(badge);
    state.badge = badge;
  }

  function updateBadge(tone, detail) {
    installBadge();
    if (!state.badge) return;
    state.badge.dataset.tone = tone;
    if (tone === "ready") {
      state.badge.textContent = detail === "topology-atlas-evidence-bound"
        ? "Research request will include exact Atlas structure and evidence witnesses."
        : "Research request will include exact Atlas structure. Atlas evidence is unavailable.";
    } else if (tone === "disabled") {
      state.badge.textContent = "This release endpoint has not enabled pages-research-context.v2.";
    } else if (tone === "error") {
      state.badge.textContent = detail;
    } else {
      state.badge.textContent = "Structural context v2 is loading.";
    }
  }

  async function refresh() {
    if (!state.agent || state.agent.research_context_schema !== Core.SCHEMA) {
      updateBadge("disabled");
      return null;
    }
    try {
      return await build();
    } catch (error) {
      updateBadge("error", error.message);
      return null;
    }
  }

  window.TrureturingResearchContextV2 = Object.freeze({
    build,
    refresh,
    snapshot: () => state.current
  });

  const detail = document.querySelector("#node-detail");
  if (detail) {
    new MutationObserver(refresh).observe(detail, {
      attributes: true,
      attributeFilter: ["data-node-id"]
    });
  }
  const cluster = document.querySelector("#cluster-filter");
  if (cluster) cluster.addEventListener("change", refresh);
  window.addEventListener("trureturing:atlas-comparison-changed", refresh);
  window.addEventListener("trureturing:counterfactual-preview-changed", refresh);
  window.addEventListener("trureturing:certified-path-selected", (event) => {
    state.selectedPathRef = event.detail && event.detail.path_ref || null;
    refresh();
  });

  Promise.all([
    fetchJson("data/pages-atlas-view.v1.json"),
    fetchJson("data/pages-atlas-manifest.v1.json"),
    fetchJson("data/pages-conformation.v1.json"),
    fetchJson("data/research-agent.v1.json"),
    fetchJson("data/topology-atlas-evidence.v1.json").catch(() => null)
  ]).then(([graph, manifest, conformation, agent, evidence]) => {
    state.graph = graph;
    state.manifest = manifest;
    state.conformation = conformation;
    state.agent = agent;
    state.endpoint = endpointFromAgent(agent);
    state.evidence = evidence;
    state.model = Core.createModel(graph, evidence);
    installBadge();
    refresh();
  }).catch((error) => {
    updateBadge("error", `Structural context v2 is unavailable: ${error.message}`);
  });
}());
