(function () {
  "use strict";

  const Core = window.TrureturingCmaFormalizationGatewayCore;
  const root = document.querySelector("#research-console");
  if (!Core || !root) return;

  const form = root.querySelector("#research-form");
  const prompt = root.querySelector("#research-prompt");
  const contextHost = root.querySelector("#research-node-context");
  const detail = document.querySelector("#node-detail");
  if (!form || !prompt || !contextHost || !detail) return;

  const state = {
    config: null,
    graph: null,
    manifest: null,
    request: null,
    gate: null,
    session: null,
    route: null,
    panel: null
  };

  function element(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text != null) value.textContent = String(text);
    return value;
  }

  function id(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}_${window.crypto.randomUUID().replaceAll("-", "")}`;
    }
    return `${prefix}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
  }

  function endpoint(path) {
    if (!state.config || !state.config.gateway_origin) {
      throw new Error("CMA gateway is not configured for this deployment.");
    }
    const url = new URL(path, `${String(state.config.gateway_origin).replace(/\/+$/, "")}/`);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error("CMA gateway must use HTTPS outside local development.");
    }
    return url;
  }

  function setStatus(text, tone) {
    const status = state.panel && state.panel.querySelector("[data-gateway-status]");
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || "quiet";
  }

  function resetGate() {
    state.request = null;
    state.gate = null;
    const result = state.panel && state.panel.querySelector("[data-gate-result]");
    const approval = state.panel && state.panel.querySelector("[data-attempt-approval]");
    const submit = state.panel && state.panel.querySelector("[data-submit-attempt]");
    if (result) result.replaceChildren();
    if (approval) {
      approval.checked = false;
      approval.disabled = true;
    }
    if (submit) {
      submit.hidden = true;
      submit.disabled = true;
    }
  }

  function selectedNodeId() {
    return detail.dataset.nodeId || null;
  }

  function routeChoice(route) {
    state.route = route;
    resetGate();
    for (const button of state.panel.querySelectorAll("[data-contribution-route]")) {
      button.setAttribute("aria-pressed", String(button.dataset.contributionRoute === route));
    }
    setStatus(
      route === "github-user"
        ? "GitHub attribution selected. The gateway session must confirm the connected account before submission."
        : "Anonymous service selected. Accepted work will use the TrueTurning service publisher.",
      "ready"
    );
  }

  async function session() {
    if (!state.config || !state.config.enabled) return null;
    const response = await fetch(endpoint(state.config.session_path), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`session returned HTTP ${response.status}`);
    state.session = await response.json();
    return state.session;
  }

  function connectGithub() {
    try {
      const url = endpoint(state.config.github_login_path);
      url.searchParams.set("return_to", window.location.href);
      window.location.assign(url.toString());
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function formValues() {
    return {
      selected_node_id: selectedNodeId(),
      contribution_route: state.route,
      action: state.panel.querySelector("[data-formalization-action]").value,
      public_summary: state.panel.querySelector("[data-public-summary]").value,
      privacy_class: state.panel.querySelector("[data-privacy-class]").value,
      statement: prompt.value
    };
  }

  function renderGate(gate) {
    const host = state.panel.querySelector("[data-gate-result]");
    host.replaceChildren();
    host.append(element("h4", null, `Gate decision: ${gate.gate_content.decision.replaceAll("-", " ")}`));
    const vector = element("dl", "cma-gate-vector");
    for (const key of Core.VECTOR_KEYS) {
      const row = element("div");
      row.append(
        element("dt", null, key.replaceAll("_", " ")),
        element("dd", null, gate.gate_content.value_vector[key] == null
          ? "open"
          : `${gate.gate_content.value_vector[key]}/1000`)
      );
      vector.append(row);
    }
    host.append(vector);
    if (gate.gate_content.reasons.length) {
      const list = element("ul");
      for (const reason of gate.gate_content.reasons) list.append(element("li", null, reason));
      host.append(list);
    }
    const approval = state.panel.querySelector("[data-attempt-approval]");
    const submit = state.panel.querySelector("[data-submit-attempt]");
    const allowed = gate.gate_content.formalization_allowed
      && gate.gate_content.allowed_contribution_routes.includes(state.route);
    approval.disabled = !allowed;
    submit.hidden = !allowed;
    submit.disabled = true;
    setStatus(
      allowed
        ? "One bounded formalization attempt is admitted. Review the vector and approve the exact request."
        : "The request has not been admitted for the selected route.",
      allowed ? "ready" : "waiting"
    );
  }

  async function evaluate() {
    const values = formValues();
    const preflight = Core.localPreflight(values);
    if (!preflight.accepted) {
      setStatus(preflight.reasons.join(" "), "error");
      return;
    }
    if (!state.config.enabled) {
      setStatus("The interface is installed. CMA gateway deployment remains disabled.", "waiting");
      return;
    }
    const request = Core.buildRequest({
      ...values,
      graph: state.graph,
      request_id: id("gate_request"),
      certified_topology_digest: state.manifest && state.manifest.certified_topology_digest,
      topology_atlas_digest: state.manifest && state.manifest.topology_atlas_digest,
      pages_conformation_digest: state.manifest
        && (state.manifest.conformation_digest || state.manifest.pages_conformation_digest),
      requested_at: new Date().toISOString()
    });
    setStatus("CMA and Intuition are evaluating reuse, value, uncertainty and verification cost.", "running");
    const response = await fetch(endpoint(state.config.gate_path), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": request.request_id
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`formalization gate returned HTTP ${response.status}`);
    const gate = Core.validateGateResult(await response.json(), {
      request_id: request.request_id,
      truth_release_digest: request.request_content.release.truth_release_digest
    });
    state.request = request;
    state.gate = gate;
    renderGate(gate);
  }

  async function submit() {
    const approval = state.panel.querySelector("[data-attempt-approval]");
    if (!approval.checked || !state.request || !state.gate) {
      throw new Error("Explicit approval and an accepted current gate result are required.");
    }
    if (state.route === "github-user") {
      const current = await session();
      if (!current || current.github_connected !== true) {
        throw new Error("Connect a GitHub account through CMA before using the attributed route.");
      }
    }
    const submission = Core.buildSubmission(
      state.request,
      state.gate,
      new Date().toISOString()
    );
    setStatus("Submitting one admitted formalization attempt.", "running");
    const response = await fetch(endpoint(state.config.submit_path), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": state.gate.gate_id
      },
      body: JSON.stringify(submission)
    });
    if (!response.ok) throw new Error(`formalization submission returned HTTP ${response.status}`);
    const result = await response.json();
    setStatus(
      result && result.pull_request_url
        ? `Candidate pull request created: ${result.pull_request_url}`
        : "The formalization attempt was accepted by the gateway.",
      "ready"
    );
    approval.checked = false;
    approval.disabled = true;
    state.panel.querySelector("[data-submit-attempt]").disabled = true;
  }

  function install() {
    const panel = element("section", "cma-formalization-panel");
    panel.id = "cma-formalization-panel";
    panel.append(
      element("h3", null, "Formalization contribution"),
      element("p", "cma-formalization-intro", "Chat remains advisory. Repository work requires a typed gate decision and a second explicit approval.")
    );

    const routes = element("div", "cma-route-choices");
    const github = element("button", "cma-route-choice", "Use my GitHub identity");
    github.type = "button";
    github.dataset.contributionRoute = "github-user";
    github.setAttribute("aria-pressed", "false");
    github.addEventListener("click", () => routeChoice("github-user"));
    const anonymous = element("button", "cma-route-choice", "Continue anonymously");
    anonymous.type = "button";
    anonymous.dataset.contributionRoute = "anonymous-service";
    anonymous.setAttribute("aria-pressed", "false");
    anonymous.addEventListener("click", () => routeChoice("anonymous-service"));
    routes.append(github, anonymous);

    const connect = element("button", "research-secondary", "Connect GitHub through CMA");
    connect.type = "button";
    connect.addEventListener("click", connectGithub);

    const actionLabel = element("label", "research-field");
    actionLabel.append(element("span", null, "Formalization action"));
    const action = document.createElement("select");
    action.dataset.formalizationAction = "";
    for (const [value, label] of [
      ["formalize-open-node", "Formalize this open node"],
      ["add-bridge", "Add a bridge"],
      ["add-subgoal", "Add an intermediate lemma"],
      ["add-abstraction", "Extract an abstraction"],
      ["add-premise", "Add a missing premise"],
      ["add-counterexample", "Formalize a counterexample"],
      ["change-representation", "Change representation"],
      ["reroot", "Reroot the proof"],
      ["add-definition-package", "Add a definition package"]
    ]) action.add(new Option(label, value));
    actionLabel.append(action);

    const summaryLabel = element("label", "research-field");
    summaryLabel.append(element("span", null, "Public contribution summary"));
    const summary = document.createElement("input");
    summary.type = "text";
    summary.maxLength = 1000;
    summary.dataset.publicSummary = "";
    summaryLabel.append(summary);

    const privacyLabel = element("label", "research-field");
    privacyLabel.append(element("span", null, "Visibility"));
    const privacy = document.createElement("select");
    privacy.dataset.privacyClass = "";
    privacy.add(new Option("Private research until submission", "private-research"));
    privacy.add(new Option("Public contribution", "public-contribution"));
    privacyLabel.append(privacy);

    const evaluateButton = element("button", "research-primary", "Check whether this should be formalized");
    evaluateButton.type = "button";
    evaluateButton.addEventListener("click", () => evaluate().catch((error) => setStatus(error.message, "error")));

    const status = element("p", "cma-gate-status", "Choose a contribution route and describe the mathematical idea in the chat composer.");
    status.dataset.gatewayStatus = "";
    status.dataset.tone = "quiet";
    const result = element("div", "cma-gate-details");
    result.dataset.gateResult = "";

    const approvalLabel = element("label", "cma-attempt-approval");
    const approval = document.createElement("input");
    approval.type = "checkbox";
    approval.disabled = true;
    approval.dataset.attemptApproval = "";
    approvalLabel.append(
      approval,
      document.createTextNode(" I approve one bounded formalization attempt using this exact gate result and contribution route.")
    );
    const submitButton = element("button", "research-primary", "Submit accepted attempt");
    submitButton.type = "button";
    submitButton.hidden = true;
    submitButton.disabled = true;
    submitButton.dataset.submitAttempt = "";
    approval.addEventListener("change", () => { submitButton.disabled = !approval.checked; });
    submitButton.addEventListener("click", () => submit().catch((error) => setStatus(error.message, "error")));

    panel.append(
      routes,
      connect,
      actionLabel,
      summaryLabel,
      privacyLabel,
      evaluateButton,
      status,
      result,
      approvalLabel,
      submitButton
    );
    contextHost.insertAdjacentElement("afterend", panel);
    state.panel = panel;
    detail.addEventListener("click", resetGate);
    new MutationObserver(resetGate).observe(detail, {
      attributes: true,
      attributeFilter: ["data-node-id"]
    });
  }

  Promise.all([
    fetch("data/truth-graph.v1.json", { cache: "no-store" }).then((response) => response.json()),
    fetch("data/pages-atlas-manifest.v1.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null),
    fetch("data/cma-formalization-gateway.v1.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`gateway configuration returned HTTP ${response.status}`);
        return response.json();
      })
  ]).then(([graph, manifest, config]) => {
    state.graph = graph;
    state.manifest = manifest;
    state.config = config;
    install();
    if (!config.enabled) {
      setStatus("The complete interface is installed. Deployment endpoints remain disabled in the committed configuration.", "waiting");
    } else {
      session().catch((error) => setStatus(error.message, "error"));
    }
  }).catch((error) => {
    install();
    setStatus(`CMA formalization gateway unavailable: ${error.message}`, "error");
  });
}());
