(function () {
  "use strict";

  const Atlas = window.TrureturingAtlasStructure;
  const Compare = window.TrureturingAtlasCompare;
  const Observation = window.TrureturingAtlasObservation;
  const Context = window.TrureturingResearchContext;
  const Writeback = window.TrureturingResearchWriteback;
  if (!Atlas || !Compare || !Observation || !Context || !Writeback) return;

  const state = {
    graph: null,
    manifest: null,
    conformation: null,
    config: null,
    model: null,
    comparison: null,
    nodeAnchor: null,
    clusterAnchor: null,
    previousNodeId: null,
    shiftDown: false,
    peeledClusterId: null,
    capture: null,
    prepared: null,
    busy: false,
    ready: false
  };

  function element(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined && text !== null) value.textContent = String(text);
    return value;
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }

  function currentNodeId() {
    const detail = document.querySelector("#node-detail");
    return detail && detail.dataset.nodeId || null;
  }

  function activeMode() {
    const button = document.querySelector(
      "[data-atlas-mode][aria-pressed='true']"
    );
    return button && button.dataset.atlasMode || "structure";
  }

  function activeClusterId() {
    const selected = currentNodeId();
    if (selected && state.model && state.model.nodeById.has(selected)) {
      return state.model.nodeById.get(selected).atlas_cluster_id || null;
    }
    const select = document.querySelector("#cluster-filter");
    const value = select && select.value;
    return value && value !== "All" ? value : null;
  }

  function comparisonForNodes(leftId, rightId) {
    if (!state.model || !leftId || !rightId || leftId === rightId) return null;
    return Compare.nodeComparison(state.model, leftId, rightId);
  }

  function comparisonForClusters(leftId, rightId) {
    if (!state.model || !leftId || !rightId || leftId === rightId) return null;
    return Compare.clusterComparison(state.model, leftId, rightId);
  }

  function rawCapture(gestureKind) {
    return {
      selected_node_id: currentNodeId(),
      active_cluster_id: activeClusterId(),
      peeled_cluster_id: state.comparison ? null : state.peeledClusterId,
      comparison: state.comparison,
      active_mode: activeMode(),
      gesture_kind: gestureKind || null,
      selected_path_ref: null
    };
  }

  function deriveCapture(gestureKind) {
    if (!state.graph) throw new Error("The release-bound Atlas is unavailable");
    return Observation.deriveCapture(state.graph, rawCapture(gestureKind));
  }

  function allowedGestures() {
    if (state.comparison) {
      return [
        ["compare", "Compare the selected structures"],
        ["bring-together", "Bring the selected structures together"],
        ["selection", "Save the selected structures only"]
      ];
    }
    if (state.peeledClusterId) {
      return [
        ["cluster-peel", "Record the peeled community"],
        ["selection", "Save the community selection only"]
      ];
    }
    return [
      ["selection", "Save the current selection"],
      ["frontier-mark", "Mark the current frontier region"]
    ];
  }

  function selectionSummary(capture) {
    const selection = capture.selection;
    return [
      capture.summary,
      `${selection.selected_node_ids.length} node${selection.selected_node_ids.length === 1 ? "" : "s"}`,
      `${selection.selected_cluster_ids.length} communit${selection.selected_cluster_ids.length === 1 ? "y" : "ies"}`,
      `${selection.selected_edges.length} certified edge${selection.selected_edges.length === 1 ? "" : "s"}`
    ].join(" · ");
  }

  function installUi() {
    const contextBar = document.querySelector("#atlas-context-bar");
    const stage = document.querySelector(".graph-stage");
    if (!contextBar || !stage || document.querySelector("#atlas-observation-actions")) {
      return;
    }

    const actions = element("div", "atlas-observation-actions");
    actions.id = "atlas-observation-actions";
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", "Save a human structural observation");
    const openButton = element(
      "button",
      "atlas-observation-action",
      "Save observation"
    );
    openButton.id = "save-atlas-observation";
    openButton.type = "button";
    actions.append(openButton);
    contextBar.append(actions);

    const panel = element("aside", "atlas-observation-panel");
    panel.id = "atlas-observation-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "atlas-observation-title");

    const header = element("header", "atlas-observation-header");
    const heading = element("div");
    heading.append(
      element("p", "eyebrow", "Explicit human evidence"),
      element("h2", null, "Save structural observation")
    );
    heading.querySelector("h2").id = "atlas-observation-title";
    const closeButton = element(
      "button",
      "atlas-observation-close",
      "Close"
    );
    closeButton.id = "close-atlas-observation";
    closeButton.type = "button";
    header.append(heading, closeButton);

    const summary = element("p", "atlas-observation-summary");
    summary.id = "atlas-observation-summary";

    const form = element("form", "atlas-observation-form");
    form.id = "atlas-observation-form";

    function field(labelText, control, hintText) {
      const label = element("label", "atlas-observation-field");
      label.append(element("span", null, labelText), control);
      if (hintText) label.append(element("small", null, hintText));
      return label;
    }

    const gesture = document.createElement("select");
    gesture.id = "atlas-observation-gesture";
    gesture.required = true;

    const actor = document.createElement("input");
    actor.id = "atlas-observation-actor";
    actor.type = "text";
    actor.maxLength = 256;
    actor.required = true;
    actor.placeholder = "human:your-name";

    const receiptRef = document.createElement("input");
    receiptRef.id = "atlas-observation-atlas-receipt";
    receiptRef.type = "text";
    receiptRef.required = true;
    receiptRef.pattern = "sha256:[0-9a-f]{64}";
    receiptRef.placeholder = "sha256:<registered Topology Atlas input receipt>";
    receiptRef.spellcheck = false;

    const privacy = document.createElement("select");
    privacy.id = "atlas-observation-privacy";
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
    note.id = "atlas-observation-note";
    note.required = true;
    note.maxLength = 8000;
    note.placeholder = "Describe what you noticed and why this structure may matter.";

    const confirm = document.createElement("input");
    confirm.id = "atlas-observation-confirm";
    confirm.type = "checkbox";
    confirm.required = true;
    const confirmLabel = element("label", "atlas-observation-confirm");
    confirmLabel.append(
      confirm,
      element(
        "span",
        null,
        "I explicitly save this exact release-bound observation."
      )
    );

    const submit = element(
      "button",
      "atlas-observation-primary",
      "Prepare observation"
    );
    submit.id = "submit-atlas-observation";
    submit.type = "submit";
    const cancel = element(
      "button",
      "atlas-observation-secondary",
      "Cancel"
    );
    cancel.type = "button";
    cancel.id = "cancel-atlas-observation";
    const formActions = element("div", "atlas-observation-form-actions");
    formActions.append(submit, cancel);

    const status = element("p", "atlas-observation-status");
    status.id = "atlas-observation-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const receipt = element("section", "atlas-observation-receipt");
    receipt.id = "atlas-observation-receipt";
    receipt.hidden = true;

    form.append(
      field("Observation gesture", gesture),
      field(
        "Human actor",
        actor,
        "Resolved from the configured provider when available."
      ),
      field(
        "Registered Topology Atlas receipt",
        receiptRef,
        "The Intuition receipt that binds this exact Atlas release."
      ),
      field("Privacy", privacy),
      field("Observation note", note),
      confirmLabel,
      formActions,
      status
    );
    panel.append(header, summary, form, receipt);
    stage.append(panel);

    openButton.addEventListener("click", openPanel);
    closeButton.addEventListener("click", closePanel);
    cancel.addEventListener("click", closePanel);
    gesture.addEventListener("change", refreshCaptureFromForm);
    form.addEventListener("submit", submitObservation);
    updateAvailability();
  }

  function observationElements() {
    return {
      panel: document.querySelector("#atlas-observation-panel"),
      open: document.querySelector("#save-atlas-observation"),
      summary: document.querySelector("#atlas-observation-summary"),
      form: document.querySelector("#atlas-observation-form"),
      gesture: document.querySelector("#atlas-observation-gesture"),
      actor: document.querySelector("#atlas-observation-actor"),
      receiptRef: document.querySelector("#atlas-observation-atlas-receipt"),
      privacy: document.querySelector("#atlas-observation-privacy"),
      note: document.querySelector("#atlas-observation-note"),
      confirm: document.querySelector("#atlas-observation-confirm"),
      submit: document.querySelector("#submit-atlas-observation"),
      status: document.querySelector("#atlas-observation-status"),
      receipt: document.querySelector("#atlas-observation-receipt")
    };
  }

  async function providerValue(name) {
    if (typeof name !== "string" || !name) return null;
    const provider = window[name];
    if (typeof provider !== "function") return null;
    const value = await provider();
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  async function openPanel() {
    const ui = observationElements();
    if (!ui.panel) return;
    try {
      state.capture = deriveCapture();
      ui.gesture.replaceChildren();
      for (const [value, text] of allowedGestures()) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        if (value === state.capture.default_gesture_kind) option.selected = true;
        ui.gesture.append(option);
      }
      state.capture = deriveCapture(ui.gesture.value);
      ui.summary.textContent = selectionSummary(state.capture);
      ui.status.textContent = state.config
        && state.config.structure_observation_submit_enabled
        ? "The explicit observation will be content-addressed and submitted through the configured Intuition capability."
        : "The exact observation can be prepared locally. Runtime submission is disabled in this deployment.";
      ui.submit.textContent = state.config
        && state.config.structure_observation_submit_enabled
        ? "Register observation once"
        : "Prepare observation";
      ui.confirm.checked = false;
      ui.receipt.hidden = true;
      ui.panel.hidden = false;

      if (!ui.actor.value) {
        const resolvedActor = await providerValue(
          state.config && state.config.human_actor_provider
        );
        if (resolvedActor) ui.actor.value = resolvedActor;
      }
      if (!ui.receiptRef.value) {
        const configured = state.config
          && state.config.topology_atlas_input_receipt_ref;
        const provided = configured || await providerValue(
          state.config && state.config.topology_atlas_input_receipt_provider
        );
        if (provided) ui.receiptRef.value = provided;
      }
      ui.note.focus();
    } catch (error) {
      ui.status.textContent = error.message;
      ui.panel.hidden = false;
    }
  }

  function closePanel() {
    const ui = observationElements();
    if (ui.panel) ui.panel.hidden = true;
  }

  function refreshCaptureFromForm() {
    const ui = observationElements();
    try {
      state.capture = deriveCapture(ui.gesture.value);
      ui.summary.textContent = selectionSummary(state.capture);
      ui.status.textContent = "The gesture remains advisory human evidence until explicitly submitted and later evaluated.";
    } catch (error) {
      ui.status.textContent = error.message;
    }
  }

  function runEndpoint() {
    const origin = String(state.config.cma_origin || "").replace(/\/+$/, "");
    const path = String(state.config.run_path || "/api/v1/agui/run");
    const endpoint = new URL(`${origin}${path}`, window.location.origin);
    if (endpoint.protocol !== "https:"
        && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
      throw new Error("CMA endpoint must use HTTPS outside local development");
    }
    return endpoint.toString();
  }

  async function requestOptions(body) {
    const headers = {
      Accept: "text/event-stream",
      "Content-Type": "application/json"
    };
    let credentials = "include";
    if (state.config.auth.mode === "bearer-provider") {
      const provider = window[state.config.auth.provider];
      if (typeof provider !== "function") {
        throw new Error(
          `Credential provider ${state.config.auth.provider} is unavailable`
        );
      }
      const token = await provider();
      if (typeof token !== "string" || token.trim() === "") {
        throw new Error("Credential provider returned no bearer credential");
      }
      headers.Authorization = `Bearer ${token.trim()}`;
      credentials = "omit";
    }
    return {
      method: "POST",
      headers,
      credentials,
      cache: "no-store",
      body: JSON.stringify(body)
    };
  }

  async function submitThroughCma(observation) {
    const release = Context.releaseIdentity(state.graph);
    const threadId = Context.opaqueId("observation_thread");
    const runId = Context.opaqueId("observation_run");
    const contract = state.config.contracts.human_structure_observation;
    const body = {
      threadId,
      runId,
      state: {},
      messages: [{
        id: Context.opaqueId("observation_message"),
        role: "user",
        content: Writeback.buildActionPrompt(
          "register-human-structure-observation",
          observation,
          contract
        )
      }],
      tools: [],
      context: [{
        description: "immutable TrueTurning release coordinate",
        value: release.release_key
      }],
      forwardedProps: {
        environmentProfile: state.config.environment_profile
      }
    };
    const response = await fetch(runEndpoint(), await requestOptions(body));
    if (!response.ok) {
      throw new Error(`CMA observation writeback returned HTTP ${response.status}`);
    }
    if (!response.body || typeof response.body.getReader !== "function") {
      throw new Error("CMA observation writeback did not return an event stream");
    }
    const frames = [];
    const parser = Context.createSseParser((frame) => frames.push(frame.data));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.push(decoder.decode(chunk.value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
    const failed = frames.findLast((frame) =>
      frame && frame.type === "RUN_ERROR"
    );
    const terminal = frames.findLast((frame) =>
      frame && frame.type === "RUN_FINISHED"
    );
    if (failed || !terminal) {
      throw new Error(
        failed && failed.message
          ? failed.message
          : "CMA observation writeback ended without RUN_FINISHED"
      );
    }
    return { threadId, runId, terminal };
  }

  function renderReceipt(observation, submitted, result) {
    const ui = observationElements();
    ui.receipt.replaceChildren();
    ui.receipt.append(
      element(
        "strong",
        null,
        submitted ? "Observation registered" : "Observation prepared"
      ),
      element("code", null, observation.observation_id),
      element(
        "p",
        null,
        submitted
          ? "Intuition returned a terminal registration result for this exact observation."
          : "Submission remains disabled. The typed artifact exists only in this page session."
      )
    );
    const details = element("details", "atlas-observation-artifact");
    details.append(
      element("summary", null, "Typed observation JSON"),
      element("pre", null, JSON.stringify(observation, null, 2))
    );
    const copy = element(
      "button",
      "atlas-observation-secondary",
      "Copy typed observation"
    );
    copy.type = "button";
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(JSON.stringify(observation, null, 2));
      copy.textContent = "Copied";
    });
    ui.receipt.append(details, copy);
    if (result) {
      const terminal = element("details", "atlas-observation-artifact");
      terminal.append(
        element("summary", null, "CMA terminal result"),
        element("pre", null, JSON.stringify(result.terminal, null, 2))
      );
      ui.receipt.append(terminal);
    }
    ui.receipt.hidden = false;
  }

  async function submitObservation(event) {
    event.preventDefault();
    const ui = observationElements();
    if (state.busy) return;
    state.busy = true;
    updateAvailability();
    ui.submit.disabled = true;
    try {
      if (!ui.confirm.checked) {
        throw new Error("Explicit save confirmation is required");
      }
      state.capture = deriveCapture(ui.gesture.value);
      const observation = await Observation.buildObservation({
        graph: state.graph,
        manifest: state.manifest,
        topology_atlas_input_receipt_ref: ui.receiptRef.value,
        pages_research_context_digest: null,
        human_actor: ui.actor.value,
        selection: state.capture.selection,
        gesture: state.capture.gesture,
        human_note: ui.note.value,
        privacy_class: ui.privacy.value,
        explicitly_saved: true,
        created_at: new Date().toISOString()
      });
      state.prepared = observation;
      let result = null;
      const submitEnabled = Boolean(
        state.config
        && state.config.enabled
        && state.config.structure_observation_submit_enabled
      );
      if (submitEnabled) {
        ui.status.textContent = "Registering the exact observation through CMA…";
        result = await submitThroughCma(observation);
      }
      renderReceipt(observation, submitEnabled, result);
      ui.status.textContent = submitEnabled
        ? "Observation registration completed. No theorem or Base write was created."
        : "Observation prepared locally. No network submission occurred.";
    } catch (error) {
      ui.status.textContent = error.message;
    } finally {
      state.busy = false;
      ui.submit.disabled = false;
      updateAvailability();
    }
  }

  function updateAvailability() {
    const ui = observationElements();
    if (!ui.open) return;
    let available = false;
    try {
      if (state.ready) {
        deriveCapture();
        available = true;
      }
    } catch (_) {
      available = false;
    }
    ui.open.disabled = state.busy || !available;
    if (ui.submit) ui.submit.disabled = state.busy;
  }

  function observeAtlasActions() {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element
        ? event.target.closest("button")
        : null;
      if (!target) return;
      if (target.id === "compare-concept") {
        state.nodeAnchor = currentNodeId();
        state.clusterAnchor = null;
      } else if (target.id === "compare-community") {
        state.clusterAnchor = activeClusterId();
        state.nodeAnchor = null;
      } else if (target.id === "clear-comparison"
          || target.id === "close-comparison") {
        state.comparison = null;
        state.nodeAnchor = null;
        state.clusterAnchor = null;
      } else if (target.id === "atlas-peel") {
        state.peeledClusterId = activeClusterId();
        state.comparison = null;
      } else if (target.id === "reset-exploration") {
        state.peeledClusterId = null;
      }
      updateAvailability();
    });

    const detail = document.querySelector("#node-detail");
    if (detail) {
      state.previousNodeId = detail.dataset.nodeId || null;
      new MutationObserver(() => {
        const current = detail.dataset.nodeId || null;
        const previous = state.previousNodeId;
        state.previousNodeId = current;
        const anchor = state.nodeAnchor
          || (state.shiftDown ? previous : null);
        if (anchor && current && anchor !== current) {
          state.comparison = comparisonForNodes(anchor, current);
          state.nodeAnchor = null;
          state.peeledClusterId = null;
        }
        updateAvailability();
      }).observe(detail, {
        attributes: true,
        attributeFilter: ["data-node-id"]
      });
    }

    const cluster = document.querySelector("#cluster-filter");
    if (cluster) {
      cluster.addEventListener("change", () => {
        const current = activeClusterId();
        if (state.clusterAnchor && current
            && state.clusterAnchor !== current) {
          state.comparison = comparisonForClusters(
            state.clusterAnchor,
            current
          );
          state.clusterAnchor = null;
          state.peeledClusterId = null;
        }
        updateAvailability();
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Shift" || event.repeat) return;
      state.shiftDown = true;
      state.nodeAnchor = currentNodeId();
    });
    document.addEventListener("keyup", (event) => {
      if (event.key === "Shift") state.shiftDown = false;
    });
  }

  window.TrureturingAtlasObservationSession = Object.freeze({
    prepared: () => state.prepared,
    capture: () => state.capture
  });

  Promise.all([
    fetchJson("data/pages-atlas-view.v1.json"),
    fetchJson("data/pages-atlas-manifest.v1.json"),
    fetchJson("data/pages-conformation.v1.json"),
    fetchJson("data/research-agent.v1.json")
  ]).then(([graph, manifest, conformation, config]) => {
    state.graph = graph;
    state.manifest = manifest;
    state.conformation = conformation;
    state.config = config;
    state.model = Atlas.createModel(graph, conformation);
    state.ready = true;
    installUi();
    observeAtlasActions();
    updateAvailability();
  }).catch((error) => {
    console.warn("Explicit Atlas observation workflow is unavailable:", error);
  });
}());
