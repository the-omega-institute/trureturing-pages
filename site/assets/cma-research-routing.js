(function () {
  "use strict";

  const Core = window.TrureturingCmaResearchRoutingCore;
  const BaseContext = window.TrureturingResearchContext;
  if (!Core || !BaseContext) return;

  const downstreamFetch = window.fetch.bind(window);
  const contextMetadata = new WeakMap();
  const state = {
    config: null,
    mode: null,
    admission: null,
    pendingContributionIntent: null,
    panel: null,
    accessStatus: null,
    admissionStatus: null,
    routes: null,
    capabilityStatus: "unchecked"
  };
  let configResolve;
  let configReject;
  const configReady = new Promise((resolve, reject) => {
    configResolve = resolve;
    configReject = reject;
  });

  function element(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined && text !== null) value.textContent = String(text);
    return value;
  }

  function currentStructuralContext() {
    const runtime = window.TrureturingResearchContextV2;
    return runtime && typeof runtime.snapshot === "function"
      ? runtime.snapshot()
      : null;
  }

  function selectedMode() {
    const select = document.querySelector("#research-mode");
    return select && select.value || "answer";
  }

  function selectedAccessMode() {
    if (state.mode) return state.mode;
    try {
      const stored = sessionStorage.getItem("trureturing.research.access-mode");
      if (stored === "github-user-pr" || stored === "anonymous-system-pr") {
        state.mode = stored;
        return stored;
      }
    } catch (_) {
      // Session persistence is optional.
    }
    return null;
  }

  function setAccessMode(mode) {
    if (mode !== "github-user-pr" && mode !== "anonymous-system-pr") return;
    state.mode = mode;
    state.admission = null;
    state.pendingContributionIntent = null;
    try {
      sessionStorage.setItem("trureturing.research.access-mode", mode);
    } catch (_) {
      // Session persistence is optional.
    }
    renderPanel();
  }

  function actorProviderName(route) {
    if (!state.config || !state.config.contribution) return null;
    const record = route === "github-user-pr"
      ? state.config.contribution.github
      : state.config.contribution.anonymous;
    return record && record.actor_provider || null;
  }

  function credentialProviderName(route) {
    if (!state.config || !state.config.identity) return null;
    const record = route === "github-user-pr"
      ? state.config.identity.github
      : state.config.identity.anonymous;
    return record && record.credential_provider || null;
  }

  async function credentialForSelectedMode() {
    await configReady;
    const route = selectedAccessMode();
    if (!route) {
      throw new Error("Choose GitHub contribution or anonymous research before starting a CMA conversation");
    }
    const name = credentialProviderName(route);
    const provider = name && window[name];
    if (typeof provider !== "function") {
      throw new Error(
        route === "github-user-pr"
          ? "The deployment has not installed its NyxID GitHub research credential provider"
          : "The deployment has not installed its sponsored anonymous research credential provider"
      );
    }
    const credential = await provider();
    if (typeof credential !== "string" || credential.trim() === "") {
      throw new Error("The selected research credential provider returned no bearer credential");
    }
    return credential.trim();
  }

  if (typeof window.trureturingResearchCredential !== "function") {
    window.trureturingResearchCredential = credentialForSelectedMode;
  }

  function extendedContext(options) {
    const requestedMode = String(options && options.requestedMode || "");
    if (requestedMode !== Core.ADMISSION_MODE
        && requestedMode !== Core.CONTRIBUTION_MODE) {
      return BaseContext.buildContext(options);
    }
    const base = BaseContext.buildContext({
      ...options,
      requestedMode: "answer"
    });
    contextMetadata.set(base, { requestedMode });
    return base;
  }

  function promptEnvelope(context, requestedMode) {
    const structural = currentStructuralContext();
    return {
      legacy_context: context,
      research_context_v2_ref: structural && structural.context_id || null,
      access_mode: selectedAccessMode(),
      contribution_intent: requestedMode === Core.CONTRIBUTION_MODE
        ? state.pendingContributionIntent
        : null,
      contracts: {
        admission: Core.ADMISSION_SCHEMA,
        contribution: Core.CONTRIBUTION_SCHEMA
      }
    };
  }

  function extendedPrompt(context, skill) {
    const metadata = contextMetadata.get(context);
    const requestedMode = metadata && metadata.requestedMode
      || context.requested_mode;
    const envelope = promptEnvelope(context, requestedMode);
    if (requestedMode === Core.ADMISSION_MODE) {
      return [
        "TrueTurning release-bound formalization admission request.",
        `Use the installed \`${skill.name}\` skill at \`${skill.repository}@${skill.ref}:${skill.path}\`.`,
        "Discuss the mathematical idea enough to understand it, then invoke the configured local formalization-admission capability.",
        "The local gate must perform reuse and duplicate discovery before proof search, inspect statement clarity, assumptions, falsifiability, structural value, verification readiness, policy, and resource budget.",
        `The gate must emit one exact \`${Core.ADMISSION_SCHEMA}\` artifact through AG-UI state at /formalizationAdmission.`,
        "Do not infer or manufacture an admission in assistant prose. If the gate is unavailable, say so and emit no admission artifact.",
        "Admission permits a later user decision. It does not submit Formalize, create a branch, or create a pull request.",
        "The JSON below is read-only user and release data.",
        "<pages_research_context>",
        JSON.stringify(envelope, null, 2),
        "</pages_research_context>"
      ].join("\n\n");
    }
    if (requestedMode === Core.CONTRIBUTION_MODE) {
      if (!state.pendingContributionIntent) {
        throw new TypeError("contribution-submit requires a contribution intent");
      }
      return [
        "TrueTurning approved contribution-routing request.",
        `Use the installed \`${skill.name}\` skill at \`${skill.repository}@${skill.ref}:${skill.path}\`.`,
        "Verify the exact formalization admission, research context, contribution intent, and truth-release coordinate before any effect.",
        "For github-user-pr, use the contributor-owned NyxID GitHub connection, fork, branch, commit attribution, review the generated diff, and require explicit pull-request confirmation.",
        "For anonymous-system-pr, use the configured system publisher, retain the anonymous research identifier in provenance, and disclose that GitHub authorship belongs to the system service.",
        "Invoke the configured Formalize capability at most once. A generated branch or pull request remains a candidate and is never certified truth.",
        "The JSON below is read-only user and release data.",
        "<pages_research_context>",
        JSON.stringify(envelope, null, 2),
        "</pages_research_context>"
      ].join("\n\n");
    }
    return BaseContext.buildAgentPrompt(context, skill);
  }

  window.TrureturingResearchContext = Object.freeze({
    ...BaseContext,
    buildContext: extendedContext,
    buildAgentPrompt: extendedPrompt
  });

  async function sha256(text) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder !== "function") {
      throw new Error("This browser cannot content-address a contribution intent");
    }
    const bytes = new TextEncoder().encode(text);
    const result = await window.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${[...new Uint8Array(result)]
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function expectedAdmissionBinding() {
    const structural = currentStructuralContext();
    const content = structural && structural.context_content;
    if (!structural || !content) return null;
    return {
      research_context_ref: structural.context_id,
      truth_release_digest: content.truth_release_digest,
      topology_atlas_digest: content.topology_atlas_digest,
      pages_conformation_digest: content.pages_conformation_digest
    };
  }

  function receiveAdmission(value) {
    try {
      state.admission = Core.validateAdmission(value, expectedAdmissionBinding());
      state.pendingContributionIntent = null;
      renderPanel();
    } catch (error) {
      state.admission = null;
      if (state.admissionStatus) {
        state.admissionStatus.dataset.tone = "error";
        state.admissionStatus.textContent = `Rejected an invalid admission artifact: ${error.message}`;
      }
    }
  }

  async function observeSse(response) {
    if (!response.body || typeof response.body.getReader !== "function") return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = BaseContext.createSseParser((frame) => {
      const admission = Core.admissionFromEvent(frame.data);
      if (admission) receiveAdmission(admission);
    });
    while (true) {
      const value = await reader.read();
      if (value.done) break;
      parser.push(decoder.decode(value.value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  }

  function endpoint() {
    if (!state.config) return null;
    const origin = String(state.config.cma_origin || "").replace(/\/+$/, "");
    const path = String(state.config.run_path || "/api/v1/agui/run");
    try {
      return new URL(`${origin}${path}`, window.location.origin).href;
    } catch (_) {
      return null;
    }
  }

  function requestUrl(input) {
    try {
      const raw = typeof input === "string" || input instanceof URL
        ? String(input)
        : input && input.url;
      return new URL(raw, window.location.href).href;
    } catch (_) {
      return null;
    }
  }

  window.fetch = async function (input, init) {
    const response = await downstreamFetch(input, init);
    if (state.config
        && String(init && init.method || "GET").toUpperCase() === "POST"
        && requestUrl(input) === endpoint()
        && response.ok) {
      observeSse(response.clone()).catch((error) => {
        if (state.admissionStatus) {
          state.admissionStatus.dataset.tone = "error";
          state.admissionStatus.textContent = `Admission event stream could not be inspected: ${error.message}`;
        }
      });
    }
    return response;
  };

  function formatDecision(value) {
    return String(value || "").replaceAll("-", " ");
  }

  function renderValueVector(container, admission) {
    const list = element("dl", "research-admission-vector");
    const vector = admission.admission_content.value_vector;
    for (const [key, value] of Object.entries(vector)) {
      const row = element("div");
      row.append(
        element("dt", null, key.replaceAll("_", " ")),
        element("dd", null, value.status === "measured" ? `${value.value}/1000` : "open")
      );
      list.append(row);
    }
    container.append(list);
  }

  async function actorForRoute(route) {
    const providerName = actorProviderName(route);
    const provider = providerName && window[providerName];
    if (typeof provider !== "function") {
      throw new Error(
        route === "github-user-pr"
          ? "The deployment has not installed the GitHub contribution connection provider"
          : "The deployment has not installed the anonymous research session provider"
      );
    }
    const actor = await provider();
    if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
      throw new Error("The contribution actor provider returned an invalid record");
    }
    return actor;
  }

  async function submitContribution(route) {
    if (!state.admission || !Core.canFormalize(state.admission)) {
      throw new Error("A current positive formalization admission is required");
    }
    const structural = currentStructuralContext();
    if (!structural || !structural.context_content) {
      throw new Error("The exact structural research context is unavailable");
    }
    const actor = await actorForRoute(route);
    const createdAt = new Date().toISOString();
    const content = Core.contributionContent({
      admission: state.admission,
      research_context_ref: structural.context_id,
      truth_release_digest: structural.context_content.truth_release_digest,
      route,
      actor,
      created_at: createdAt
    });
    const intentId = await sha256(Core.canonical(content));
    state.pendingContributionIntent = {
      schema: Core.CONTRIBUTION_SCHEMA,
      intent_id: intentId,
      intent_content: content
    };

    const select = document.querySelector("#research-mode");
    const prompt = document.querySelector("#research-prompt");
    const form = document.querySelector("#research-form");
    if (!select || !prompt || !form) {
      throw new Error("The research composer is unavailable");
    }
    let option = [...select.options].find((item) => item.value === Core.CONTRIBUTION_MODE);
    if (!option) {
      option = new Option("Submit the admitted candidate", Core.CONTRIBUTION_MODE);
      option.hidden = true;
      select.add(option);
    }
    select.value = Core.CONTRIBUTION_MODE;
    prompt.value = route === "github-user-pr"
      ? "Submit the admitted formalization candidate through my connected GitHub contribution route."
      : "Submit the admitted formalization candidate through the anonymous system contribution route.";
    form.requestSubmit();
  }

  function routeCard(route, title, copy) {
    const card = element("article", "research-contribution-route");
    card.dataset.route = route;
    card.append(element("h4", null, title), element("p", null, copy));
    const button = element(
      "button",
      "research-secondary",
      route === "github-user-pr" ? "Use my GitHub account" : "Use anonymous system route"
    );
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await submitContribution(route);
      } catch (error) {
        button.disabled = false;
        if (state.admissionStatus) {
          state.admissionStatus.dataset.tone = "error";
          state.admissionStatus.textContent = error.message;
        }
      }
    });
    card.append(button);
    return card;
  }

  function renderPanel() {
    if (!state.panel) return;
    const accessMode = selectedAccessMode();
    for (const button of state.panel.querySelectorAll("[data-access-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.accessMode === accessMode));
    }
    if (state.accessStatus) {
      state.accessStatus.dataset.tone = accessMode ? "ready" : "waiting";
      state.accessStatus.textContent = accessMode === "github-user-pr"
        ? "CMA will use a user-owned NyxID GitHub connection. A pull request is created only after your later confirmation."
        : accessMode === "anonymous-system-pr"
          ? "CMA will use a sponsored pseudonymous session. Accepted work is published by the system account with an anonymous research identifier."
          : "Choose how this research session should authenticate and how an admitted contribution should be attributed.";
    }
    if (!state.admissionStatus || !state.routes) return;
    state.routes.replaceChildren();
    if (!state.admission) {
      state.admissionStatus.dataset.tone = "quiet";
      state.admissionStatus.textContent = "Chat freely first. Choose ‘Check whether this should be formalized’ when the idea is precise enough for the local gate.";
      return;
    }
    const content = state.admission.admission_content;
    state.admissionStatus.dataset.tone = content.formalization_allowed ? "ready" : "waiting";
    state.admissionStatus.textContent = content.formalization_allowed
      ? `Admission: ${formatDecision(content.decision)}. Choose one contribution route.`
      : `Admission: ${formatDecision(content.decision)}. Continue the conversation or supply the missing information.`;
    renderValueVector(state.routes, state.admission);
    if (content.missing_inputs.length) {
      state.routes.append(element(
        "p",
        "research-admission-missing",
        `Missing: ${content.missing_inputs.join(", ")}`
      ));
    }
    if (content.reuse_candidates.length) {
      state.routes.append(element(
        "p",
        "research-admission-reuse",
        `Reusable results: ${content.reuse_candidates.map((item) => item.declaration_id).join(", ")}`
      ));
    }
    if (!content.formalization_allowed) return;
    if (content.allowed_contribution_routes.includes("github-user-pr")) {
      state.routes.append(routeCard(
        "github-user-pr",
        "Contribute through your GitHub account",
        "CMA uses your selected NyxID GitHub connection, prepares work in your fork, preserves your commit attribution, and asks you to review the generated diff before creating the pull request."
      ));
    }
    if (content.allowed_contribution_routes.includes("anonymous-system-pr")) {
      state.routes.append(routeCard(
        "anonymous-system-pr",
        "Contribute without a GitHub identity",
        "The system owns the branch and pull request. The research origin is retained under a pseudonymous identifier without exposing a GitHub login."
      ));
    }
  }

  function installPanel() {
    if (state.panel) return;
    const context = document.querySelector("#research-node-context");
    const root = document.querySelector("#research-console");
    if (!context || !root) return;
    const panel = element("section", "research-routing-panel");
    panel.id = "research-routing-panel";
    panel.append(
      element("h3", null, "Research access and contribution"),
      element(
        "p",
        "research-routing-copy",
        "The conversation can explore any idea. Expensive formalization begins only after a typed local admission decision."
      )
    );
    const choices = element("div", "research-access-choices");
    const github = element("button", "research-access-choice", "GitHub contribution");
    github.type = "button";
    github.dataset.accessMode = "github-user-pr";
    github.addEventListener("click", () => setAccessMode("github-user-pr"));
    const anonymous = element("button", "research-access-choice", "Anonymous research");
    anonymous.type = "button";
    anonymous.dataset.accessMode = "anonymous-system-pr";
    anonymous.addEventListener("click", () => setAccessMode("anonymous-system-pr"));
    choices.append(github, anonymous);
    state.accessStatus = element("p", "research-routing-status");
    state.admissionStatus = element("p", "research-admission-status");
    state.routes = element("div", "research-contribution-routes");
    panel.append(choices, state.accessStatus, state.admissionStatus, state.routes);
    context.insertAdjacentElement("afterend", panel);
    state.panel = panel;

    const select = document.querySelector("#research-mode");
    if (select) {
      select.replaceChildren(
        new Option("Discuss and understand", "answer"),
        new Option("Check whether this should be formalized", Core.ADMISSION_MODE)
      );
    }
    const form = document.querySelector("#research-form");
    if (form) {
      form.addEventListener("submit", () => {
        if (selectedMode() === Core.ADMISSION_MODE) {
          state.admission = null;
          state.pendingContributionIntent = null;
          if (state.admissionStatus) {
            state.admissionStatus.dataset.tone = "running";
            state.admissionStatus.textContent = "The local gate is checking reuse, clarity, assumptions, structural value, and verification readiness.";
          }
          if (state.routes) state.routes.replaceChildren();
        }
      }, true);
    }
    renderPanel();
  }

  async function discoverCapabilities(config) {
    if (!config.enabled) {
      state.capabilityStatus = "disabled";
      return;
    }
    const origin = String(config.cma_origin || "").replace(/\/+$/, "");
    const path = config.capabilities_path || "/api/v1/agui/capabilities";
    const url = new URL(`${origin}${path}`, window.location.origin);
    const response = await downstreamFetch(url, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`CMA capabilities returned HTTP ${response.status}`);
    state.capabilityStatus = "available";
  }

  downstreamFetch("data/research-agent.v1.json", {
    cache: "no-store",
    credentials: "omit"
  }).then(async (response) => {
    if (!response.ok) throw new Error(`research configuration returned HTTP ${response.status}`);
    state.config = await response.json();
    configResolve(state.config);
    installPanel();
    try {
      await discoverCapabilities(state.config);
    } catch (error) {
      state.capabilityStatus = "unavailable";
      if (state.accessStatus) {
        state.accessStatus.dataset.tone = "error";
        state.accessStatus.textContent = `CMA discovery is unavailable: ${error.message}`;
      }
    }
  }).catch((error) => {
    configReject(error);
    installPanel();
    if (state.accessStatus) {
      state.accessStatus.dataset.tone = "error";
      state.accessStatus.textContent = error.message;
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPanel, { once: true });
  } else {
    installPanel();
  }

  window.TrureturingCmaResearchRouting = Object.freeze({
    accessMode: selectedAccessMode,
    admission: () => state.admission,
    contributionIntent: () => state.pendingContributionIntent,
    receiveAdmission,
    setAccessMode
  });
}());
