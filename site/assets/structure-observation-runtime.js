(function () {
  "use strict";

  const Observation = window.TrureturingStructureObservation;
  if (!Observation) return;

  const state = {
    graph: null,
    manifest: null,
    conformation: null,
    selectedNodeIds: [],
    selectedClusterIds: [],
    selectedEdges: [],
    selectedPathRef: null,
    gesture: "selection",
    sourceNodeIds: [],
    targetNodeIds: [],
    sourceClusterIds: [],
    targetClusterIds: [],
    endpoint: null,
    atlasReceiptRef: null,
    actor: "",
    dialog: null,
    status: null
  };

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }

  function exactSelection() {
    const detail = document.querySelector("#node-detail");
    const selected = detail && detail.dataset.nodeId;
    const comparison = window.TrureturingAtlasComparisonState;
    if (comparison && typeof comparison.snapshot === "function") {
      const snapshot = comparison.snapshot();
      if (snapshot && Array.isArray(snapshot.selected_node_ids)
          && snapshot.selected_node_ids.length) {
        return {
          nodeIds: snapshot.selected_node_ids,
          clusterIds: snapshot.selected_cluster_ids || [],
          edges: snapshot.selected_edges || [],
          pathRef: snapshot.selected_path_ref || null,
          gesture: snapshot.gesture_kind || "compare",
          sourceNodeIds: snapshot.source_node_ids || [],
          targetNodeIds: snapshot.target_node_ids || [],
          sourceClusterIds: snapshot.source_cluster_ids || [],
          targetClusterIds: snapshot.target_cluster_ids || []
        };
      }
    }
    const cluster = document.querySelector("#cluster-filter");
    const clusterId = cluster && cluster.value && cluster.value !== "All"
      ? cluster.value
      : null;
    const nodeIds = selected ? [selected] : [];
    const clusterIds = clusterId ? [clusterId] : [];
    return {
      nodeIds,
      clusterIds,
      edges: Observation.selectedCertifiedEdges(state.graph, nodeIds),
      pathRef: null,
      gesture: clusterId && !selected ? "cluster-peel" : "selection",
      sourceNodeIds: nodeIds,
      targetNodeIds: [],
      sourceClusterIds: clusterIds,
      targetClusterIds: []
    };
  }

  function refreshSelection() {
    const snapshot = exactSelection();
    state.selectedNodeIds = snapshot.nodeIds;
    state.selectedClusterIds = snapshot.clusterIds;
    state.selectedEdges = snapshot.edges;
    state.selectedPathRef = snapshot.pathRef;
    state.gesture = snapshot.gesture;
    state.sourceNodeIds = snapshot.sourceNodeIds;
    state.targetNodeIds = snapshot.targetNodeIds;
    state.sourceClusterIds = snapshot.sourceClusterIds;
    state.targetClusterIds = snapshot.targetClusterIds;
    updateButton();
    updatePreview();
  }

  function canSave() {
    return Boolean(
      state.atlasReceiptRef
      && (state.selectedNodeIds.length
        || state.selectedClusterIds.length
        || state.selectedEdges.length
        || state.selectedPathRef)
    );
  }

  function updateButton() {
    const button = document.querySelector("#save-structure-observation");
    if (!button) return;
    button.disabled = !canSave();
    button.title = canSave()
      ? "Save the current structural selection as an explicit human observation"
      : "Select a concept, community, comparison, or certified path first";
  }

  function updatePreview() {
    const preview = document.querySelector("#structure-observation-preview");
    if (!preview) return;
    const parts = [];
    if (state.selectedNodeIds.length) {
      parts.push(`${state.selectedNodeIds.length} concept${state.selectedNodeIds.length === 1 ? "" : "s"}`);
    }
    if (state.selectedClusterIds.length) {
      parts.push(`${state.selectedClusterIds.length} communit${state.selectedClusterIds.length === 1 ? "y" : "ies"}`);
    }
    if (state.selectedEdges.length) {
      parts.push(`${state.selectedEdges.length} certified edge${state.selectedEdges.length === 1 ? "" : "s"}`);
    }
    if (state.selectedPathRef) parts.push("one certified path");
    preview.textContent = parts.length
      ? `${state.gesture}: ${parts.join(", ")}`
      : "No structural selection is ready to save.";
  }

  function field(label, element) {
    const wrapper = document.createElement("label");
    wrapper.className = "structure-observation-field";
    const title = document.createElement("span");
    title.textContent = label;
    wrapper.append(title, element);
    return wrapper;
  }

  function createDialog() {
    if (state.dialog) return state.dialog;
    const dialog = document.createElement("dialog");
    dialog.id = "structure-observation-dialog";
    dialog.className = "structure-observation-dialog";
    dialog.setAttribute("aria-labelledby", "structure-observation-title");

    const form = document.createElement("form");
    form.method = "dialog";
    form.className = "structure-observation-form";
    const heading = document.createElement("div");
    heading.className = "structure-observation-heading";
    heading.innerHTML = `
      <div>
        <p class="eyebrow">Explicit human evidence</p>
        <h2 id="structure-observation-title">Save structural observation</h2>
      </div>
      <button type="button" data-observation-close aria-label="Close">Close</button>`;

    const preview = document.createElement("p");
    preview.id = "structure-observation-preview";
    preview.className = "structure-observation-preview";

    const actor = document.createElement("input");
    actor.id = "structure-observation-actor";
    actor.name = "actor";
    actor.type = "text";
    actor.maxLength = 256;
    actor.required = true;
    actor.autocomplete = "name";
    actor.placeholder = "human:your-id";
    actor.value = state.actor;

    const privacy = document.createElement("select");
    privacy.id = "structure-observation-privacy";
    privacy.name = "privacy";
    for (const [value, text] of [
      ["private-research", "Private research"],
      ["team-research", "Team research"],
      ["public-candidate", "Public candidate evidence"]
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      privacy.append(option);
    }

    const note = document.createElement("textarea");
    note.id = "structure-observation-note";
    note.name = "note";
    note.maxLength = 8000;
    note.rows = 6;
    note.required = true;
    note.placeholder = "What structural relation, mismatch, bridge, or missing abstraction did you observe?";

    const status = document.createElement("p");
    status.id = "structure-observation-status";
    status.className = "structure-observation-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Nothing is sent until Save observation is pressed.";
    state.status = status;

    const actions = document.createElement("div");
    actions.className = "structure-observation-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dialog.close());
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "structure-observation-primary";
    save.textContent = "Save observation";
    actions.append(cancel, save);

    form.append(
      heading,
      preview,
      field("Human actor", actor),
      field("Privacy", privacy),
      field("Observation", note),
      status,
      actions
    );
    dialog.append(form);
    document.body.append(dialog);
    heading.querySelector("[data-observation-close]").addEventListener(
      "click",
      () => dialog.close()
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        state.actor = actor.value.trim();
        sessionStorage.setItem("trureturing.pages.human_actor", state.actor);
        const request = Observation.buildRequest({
          topology_atlas_input_receipt_ref: state.atlasReceiptRef,
          truth_release_digest: state.manifest.truth_release_digest,
          certified_topology_digest: state.manifest.certified_topology_digest,
          topology_atlas_digest: state.manifest.topology_atlas_digest,
          pages_conformation_digest: state.manifest.conformation_digest,
          research_context_digest: null,
          source_commit: state.graph.source_snapshot.source_commit,
          source_tree: state.graph.source_snapshot.source_tree,
          human_actor: state.actor,
          privacy_class: privacy.value,
          human_note: note.value,
          selection: {
            selected_node_ids: state.selectedNodeIds,
            selected_cluster_ids: state.selectedClusterIds,
            selected_edges: state.selectedEdges,
            selected_path_ref: state.selectedPathRef
          },
          gesture: {
            kind: state.gesture,
            source_node_ids: state.sourceNodeIds,
            target_node_ids: state.targetNodeIds,
            source_cluster_ids: state.sourceClusterIds,
            target_cluster_ids: state.targetClusterIds
          },
          created_at: new Date().toISOString()
        });
        if (!state.endpoint) {
          throw new Error("The release does not publish a structural observation endpoint.");
        }
        state.status.dataset.tone = "waiting";
        state.status.textContent = "Saving the explicit observation…";
        const response = await fetch(state.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "omit",
          body: JSON.stringify(request)
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || `Observation endpoint returned HTTP ${response.status}`);
        }
        state.status.dataset.tone = "ready";
        state.status.textContent = body.observation_ref
          ? `Saved as ${body.observation_ref}.`
          : "Observation accepted by Intuition intake.";
        note.value = "";
      } catch (error) {
        state.status.dataset.tone = "error";
        state.status.textContent = error.message;
      } finally {
        save.disabled = false;
      }
    });
    state.dialog = dialog;
    return dialog;
  }

  function installButton() {
    if (document.querySelector("#save-structure-observation")) return;
    const actions = document.querySelector(".graph-actions")
      || document.querySelector("#atlas-context-bar");
    if (!actions) return;
    const button = document.createElement("button");
    button.id = "save-structure-observation";
    button.type = "button";
    button.className = "save-structure-observation";
    button.textContent = "Save observation";
    button.disabled = true;
    button.addEventListener("click", () => {
      refreshSelection();
      if (!canSave()) return;
      const dialog = createDialog();
      dialog.showModal();
      updatePreview();
      window.setTimeout(() => {
        dialog.querySelector("#structure-observation-note").focus();
      }, 0);
    });
    actions.append(button);
    updateButton();
  }

  function observeSelection() {
    const detail = document.querySelector("#node-detail");
    if (detail) {
      new MutationObserver(refreshSelection).observe(detail, {
        attributes: true,
        attributeFilter: ["data-node-id"]
      });
    }
    const cluster = document.querySelector("#cluster-filter");
    if (cluster) cluster.addEventListener("change", refreshSelection);
    window.addEventListener("trureturing:atlas-comparison-changed", refreshSelection);
    window.addEventListener("trureturing:certified-path-selected", (event) => {
      const detailValue = event.detail || {};
      state.selectedPathRef = detailValue.path_ref || null;
      state.gesture = "path-inspection";
      refreshSelection();
    });
  }

  Promise.all([
    fetchJson("data/pages-atlas-view.v1.json"),
    fetchJson("data/pages-atlas-manifest.v1.json"),
    fetchJson("data/pages-conformation.v1.json"),
    fetchJson("data/research-agent.v1.json").catch(() => ({}))
  ]).then(([graph, manifest, conformation, agent]) => {
    state.graph = graph;
    state.manifest = manifest;
    state.conformation = conformation;
    state.endpoint = agent.structure_observation_endpoint
      || agent.human_observation_endpoint
      || null;
    state.atlasReceiptRef = agent.topology_atlas_input_receipt_ref
      || manifest.topology_atlas_input_receipt_ref
      || null;
    state.actor = sessionStorage.getItem("trureturing.pages.human_actor") || "";
    installButton();
    observeSelection();
    refreshSelection();
  }).catch((error) => {
    console.warn("Explicit structural observation is unavailable:", error);
  });
}());
