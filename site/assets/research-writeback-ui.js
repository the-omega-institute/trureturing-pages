(function () {
  "use strict";

  const Context = window.TrureturingResearchContext;
  const Writeback = window.TrureturingResearchWriteback;
  const consoleRoot = document.querySelector("#research-console");
  const transcript = document.querySelector("#research-transcript");
  const detail = document.querySelector("#node-detail");
  if (!Context || !Writeback || !consoleRoot || !transcript || !detail) return;

  function element(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined && text !== null) value.textContent = String(text);
    return value;
  }

  const panel = element("section", "research-writeback");
  panel.setAttribute("aria-labelledby", "research-writeback-title");
  const header = element("header", "research-writeback-header");
  header.append(
    element("h3", null, "Write this idea back"),
    element("span", "research-writeback-badge", "ADVISORY")
  );
  header.querySelector("h3").id = "research-writeback-title";
  const status = element(
    "p",
    "research-writeback-status",
    "A completed agent answer can be saved as a release-bound Intuition candidate."
  );
  const openButton = element("button", "research-secondary", "Save as Intuition candidate");
  openButton.type = "button";
  openButton.disabled = true;
  const form = element("form", "research-writeback-form");
  form.hidden = true;

  function field(labelText, control) {
    const label = element("label", "research-field");
    label.append(element("span", null, labelText), control);
    return label;
  }

  const actor = document.createElement("input");
  actor.type = "text";
  actor.maxLength = 256;
  actor.required = true;
  actor.placeholder = "human:your-name";

  const kind = document.createElement("select");
  for (const [value, text] of [
    ["bridge", "Bridge between concepts"],
    ["subgoal", "Candidate subgoal"],
    ["abstraction", "Reusable abstraction"],
    ["counterexample", "Counterexample search"],
    ["representation-change", "Representation change"],
    ["open-question", "Open question"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    kind.append(option);
  }

  const statement = document.createElement("textarea");
  statement.maxLength = 16384;
  statement.required = true;
  statement.placeholder = "State the candidate relation or proposition precisely.";

  const falsifier = document.createElement("textarea");
  falsifier.maxLength = 8192;
  falsifier.required = true;
  falsifier.placeholder = "What concrete observation, model, or counterexample would rule this out?";

  const save = element("button", "research-primary", "Register candidate once");
  save.type = "submit";
  const close = element("button", "research-secondary", "Cancel");
  close.type = "button";
  const actions = element("div", "research-actions");
  actions.append(save, close);
  form.append(
    field("Human actor", actor),
    field("Candidate kind", kind),
    field("Candidate statement", statement),
    field("Nearest falsifier", falsifier),
    actions
  );

  const receipt = element("div", "research-writeback-receipt");
  receipt.hidden = true;
  panel.append(header, status, openButton, form, receipt);
  const composer = consoleRoot.querySelector("#research-form");
  consoleRoot.insertBefore(panel, composer || null);

  let config = null;
  let graph = null;
  let topologyDigest = null;
  let topologyPublicationDigest = null;
  let lastCandidate = null;
  let busy = false;

  function selectedNodeId() {
    return detail.dataset.nodeId || null;
  }

  function lastMessage(role) {
    const messages = [...transcript.querySelectorAll(`.research-message-${role}:not(.is-live) .research-message-body`)];
    return messages.length ? messages[messages.length - 1].textContent.trim() : "";
  }

  function updateAvailability() {
    const hasAnswer = lastMessage("assistant") !== "";
    const hasNode = Boolean(selectedNodeId());
    openButton.disabled = busy || !hasAnswer || !hasNode || !graph || !topologyDigest;
    if (busy) return;
    if (!hasNode) {
      status.textContent = "Select a graph node before creating a writeback artifact.";
    } else if (!hasAnswer) {
      status.textContent = "Ask the release-bound agent first. Its settled public answer becomes candidate evidence.";
    } else if (!topologyDigest) {
      status.textContent = "The certified topology bytes are unavailable, so writeback is fail-closed.";
    } else if (!config || !config.intuition_submit_enabled) {
      status.textContent = "Typed candidate preparation is available. Runtime submission remains disabled until the Intuition capability is granted.";
    } else {
      status.textContent = "The candidate will be content-addressed and submitted through the configured CMA Intuition capability.";
    }
  }

  function runEndpoint() {
    const origin = String(config.cma_origin || "").replace(/\/+$/, "");
    const path = String(config.run_path || "/api/v1/agui/run");
    const endpoint = new URL(`${origin}${path}`, window.location.origin);
    if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
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
    if (config.auth.mode === "bearer-provider") {
      const provider = window[config.auth.provider];
      if (typeof provider !== "function") {
        throw new Error(`Credential provider ${config.auth.provider} is unavailable`);
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

  async function submitArtifact(operation, artifact, contract) {
    const release = Context.releaseIdentity(graph);
    const threadId = Context.opaqueId("writeback_thread");
    const runId = Context.opaqueId("writeback_run");
    const body = {
      threadId,
      runId,
      state: {},
      messages: [{
        id: Context.opaqueId("writeback_message"),
        role: "user",
        content: Writeback.buildActionPrompt(operation, artifact, contract)
      }],
      tools: [],
      context: [{
        description: "immutable TrueTurning release coordinate",
        value: release.release_key
      }],
      forwardedProps: {
        environmentProfile: config.environment_profile
      }
    };
    const response = await fetch(runEndpoint(), await requestOptions(body));
    if (!response.ok) {
      throw new Error(`CMA writeback returned HTTP ${response.status}`);
    }
    if (!response.body || typeof response.body.getReader !== "function") {
      throw new Error("CMA writeback did not return an event stream");
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
    const terminal = frames.findLast((frame) => frame && frame.type === "RUN_FINISHED");
    const failed = frames.findLast((frame) => frame && frame.type === "RUN_ERROR");
    if (failed || !terminal) {
      throw new Error(failed && failed.message ? failed.message : "CMA writeback ended without RUN_FINISHED");
    }
    return { threadId, runId, terminal };
  }

  async function contextForLastQuestion() {
    const nodeId = selectedNodeId();
    const humanPrompt = lastMessage("user");
    if (!nodeId || !humanPrompt) throw new Error("Selected node or user prompt is unavailable");
    return Context.buildContext({
      graph,
      nodeId,
      humanPrompt,
      requestedMode: "answer"
    });
  }

  function renderCandidateReceipt(candidate, submitted, detailText) {
    receipt.replaceChildren();
    receipt.append(
      element("strong", null, submitted ? "Candidate registered" : "Candidate prepared"),
      element("code", null, candidate.candidate_id),
      element("p", null, detailText)
    );
    if (config.formalize_submit_enabled) {
      const formalizeButton = element("button", "research-secondary", "Prepare Formalize request");
      formalizeButton.type = "button";
      formalizeButton.addEventListener("click", () => renderFormalizeForm(candidate));
      receipt.append(formalizeButton);
    }
    receipt.hidden = false;
  }

  function renderFormalizeForm(candidate) {
    receipt.replaceChildren();
    const formalizeForm = element("form", "research-writeback-form");
    const gid = document.createElement("input");
    gid.type = "text";
    gid.required = true;
    gid.placeholder = "D5/S3/Domain/Module.theorem_name";
    const nextRelease = document.createElement("input");
    nextRelease.type = "datetime-local";
    nextRelease.required = true;
    const approval = document.createElement("input");
    approval.type = "checkbox";
    approval.required = true;
    const approvalLabel = element("label", "research-writeback-approval");
    approvalLabel.append(
      approval,
      document.createTextNode(" I approve one submission of this exact candidate to Formalize.")
    );
    const submit = element("button", "research-primary", "Submit exact request once");
    submit.type = "submit";
    formalizeForm.append(
      field("Preferred theorem GID", gid),
      field("Next expected truth release", nextRelease),
      approvalLabel,
      submit
    );
    formalizeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!topologyPublicationDigest) {
        status.textContent = "No topology-publication.v1 bytes are deployed. Formalize submission remains fail-closed.";
        return;
      }
      busy = true;
      updateAvailability();
      try {
        const context = await contextForLastQuestion();
        const issuedAt = new Date();
        const request = await Writeback.buildFormalizationRequest({
          context,
          candidate,
          topologyPublicationDigest,
          lemmaStatement: candidate.candidate_content.candidate_statement,
          lemmaGidIntent: gid.value.trim(),
          issuedAt: issuedAt.toISOString(),
          nextTruthReleaseAt: new Date(nextRelease.value).toISOString()
        });
        const result = await submitArtifact(
          "submit-formalization-request",
          request,
          config.contracts.formalization_request
        );
        receipt.replaceChildren(
          element("strong", null, "Formalize request submitted"),
          element("code", null, request.request_id),
          element("p", null, `CMA run ${result.runId} reached a terminal event. Certification still requires protected Base admission and a later truth release.`)
        );
      } catch (error) {
        status.textContent = `Formalize submission rejected: ${error.message}`;
      } finally {
        busy = false;
        updateAvailability();
      }
    });
    receipt.append(formalizeForm);
    receipt.hidden = false;
  }

  openButton.addEventListener("click", () => {
    const answer = lastMessage("assistant");
    statement.value = answer.slice(0, 16384);
    falsifier.value = "";
    form.hidden = false;
    openButton.hidden = true;
    receipt.hidden = true;
  });

  close.addEventListener("click", () => {
    form.reset();
    form.hidden = true;
    openButton.hidden = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    busy = true;
    updateAvailability();
    try {
      const context = await contextForLastQuestion();
      const candidate = await Writeback.buildHumanCandidate({
        context,
        topologyDigest,
        humanActor: actor.value,
        agentText: lastMessage("assistant"),
        candidateKind: kind.value,
        candidateStatement: statement.value,
        falsifier: falsifier.value,
        createdAt: new Date().toISOString()
      });
      lastCandidate = candidate;
      let submitted = false;
      let detailText = "The exact JSON is held in this page session. Enable the scoped Intuition capability to persist it.";
      if (config.intuition_submit_enabled) {
        const result = await submitArtifact(
          "register-human-intuition-candidate",
          candidate,
          config.contracts.human_intuition_candidate
        );
        submitted = true;
        detailText = `CMA run ${result.runId} reached a terminal event. The candidate remains advisory.`;
      }
      renderCandidateReceipt(candidate, submitted, detailText);
      form.hidden = true;
      openButton.hidden = false;
      status.textContent = submitted
        ? "The release-bound candidate was sent to Intuition. It has no truth authority."
        : "The typed candidate is ready, while runtime submission remains disabled.";
    } catch (error) {
      status.textContent = `Writeback rejected: ${error.message}`;
    } finally {
      busy = false;
      updateAvailability();
    }
  });

  new MutationObserver(updateAvailability).observe(transcript, {
    childList: true,
    subtree: true,
    characterData: true
  });
  new MutationObserver(updateAvailability).observe(detail, {
    attributes: true,
    attributeFilter: ["data-node-id"]
  });

  Promise.all([
    fetch("data/truth-graph.v1.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`truth graph returned HTTP ${response.status}`);
      return response.json();
    }),
    fetch("data/research-agent.v1.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`research configuration returned HTTP ${response.status}`);
      return response.json();
    }),
    fetch("data/certified-topology.v1.json", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`certified topology returned HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }),
    fetch("data/topology-publication.v1.json", { cache: "no-store" })
      .then(async (response) => response.ok ? new Uint8Array(await response.arrayBuffer()) : null)
  ])
    .then(async ([loadedGraph, loadedConfig, topologyBytes, publicationBytes]) => {
      graph = loadedGraph;
      config = loadedConfig;
      topologyDigest = await Writeback.sha256Reference(topologyBytes);
      topologyPublicationDigest = publicationBytes
        ? await Writeback.sha256Reference(publicationBytes)
        : null;
      if (typeof window[config.human_actor_provider] === "function") {
        const provided = await window[config.human_actor_provider]();
        if (typeof provided === "string") actor.value = provided;
      }
      updateAvailability();
    })
    .catch((error) => {
      status.textContent = `Writeback unavailable: ${error.message}`;
      updateAvailability();
    });
}());
