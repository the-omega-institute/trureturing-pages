(function () {
  "use strict";

  const Context = window.TrureturingResearchContext;
  const root = document.querySelector("#research-console");
  if (!root || !Context) return;

  const connection = root.querySelector("#research-connection");
  const nodeContext = root.querySelector("#research-node-context");
  const transcript = root.querySelector("#research-transcript");
  const activity = root.querySelector("#research-activity");
  const approval = root.querySelector("#research-approval");
  const formalize = root.querySelector("#research-formalize");
  const form = root.querySelector("#research-form");
  const mode = root.querySelector("#research-mode");
  const prompt = root.querySelector("#research-prompt");
  const send = root.querySelector("#research-send");
  const retry = root.querySelector("#research-retry");
  const formStatus = root.querySelector("#research-form-status");
  const detail = document.querySelector("#node-detail");

  let config = null;
  let graph = null;
  let selectedId = null;
  let activeRequest = null;
  let activeTerminal = false;
  let lastFailedRequest = null;
  let currentMode = null;
  let liveAssistant = null;
  let runtimeReady = false;

  function element(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined && text !== null) value.textContent = String(text);
    return value;
  }

  function setConnection(text, tone) {
    connection.textContent = text;
    connection.dataset.tone = tone;
  }

  function setFormStatus(text, tone) {
    formStatus.textContent = text;
    formStatus.dataset.tone = tone || "quiet";
  }

  function appendTranscript(role, text, meta) {
    const article = element("article", `research-message research-message-${role}`);
    const header = element("header");
    header.append(
      element("strong", null, role === "assistant" ? "Formal research agent" : role === "user" ? "You" : "System"),
      element("span", "research-message-status", meta || (role === "assistant" ? "ADVISORY" : ""))
    );
    const body = element("div", "research-message-body", text);
    article.append(header, body);
    transcript.append(article);
    transcript.scrollTop = transcript.scrollHeight;
    return article;
  }

  function appendActivity(label, detailText, status) {
    const item = element("li", "research-activity-item");
    item.dataset.status = status || "running";
    item.append(
      element("strong", null, label),
      element("span", null, detailText || status || "")
    );
    activity.append(item);
    activity.hidden = false;
    return item;
  }

  function clearTransient() {
    if (liveAssistant) {
      liveAssistant.remove();
      liveAssistant = null;
    }
  }

  function selectedNode() {
    if (!graph || !selectedId) return null;
    return graph.nodes.find((node) => node.id === selectedId) || null;
  }

  function currentRelease() {
    return graph ? Context.releaseIdentity(graph) : null;
  }

  function updateComposer() {
    const configured = Boolean(config && config.enabled && runtimeReady);
    const hasNode = Boolean(selectedNode());
    const busy = Boolean(activeRequest);
    mode.disabled = !configured || busy;
    prompt.disabled = !configured || !hasNode || busy;
    send.disabled = !configured || !hasNode || busy;
    retry.hidden = !lastFailedRequest || busy;
    retry.disabled = busy;
    if (!hasNode) {
      setFormStatus("Select a node in the graph before asking a release-bound question.", "quiet");
    } else if (!config || !config.enabled) {
      setFormStatus("The interface is installed. CMA deployment configuration is still disabled.", "waiting");
    } else if (!runtimeReady) {
      setFormStatus("The configured credential provider is unavailable on this page.", "error");
    } else if (!busy) {
      setFormStatus("Your question will be bound to this node and the currently published graph digest.", "ready");
    }
  }

  function updateNodeContext() {
    const node = selectedNode();
    if (!node || !graph) {
      nodeContext.replaceChildren(
        element("p", "research-context-empty", "Select a theorem or concept in the graph. Its exact node and direct neighborhood will become the agent context.")
      );
      approval.hidden = true;
      formalize.hidden = true;
      updateComposer();
      return;
    }
    const release = currentRelease();
    const title = Context.humanTitle(node);
    const heading = element("div", "research-context-heading");
    const headingCopy = element("div");
    headingCopy.append(
      element("span", "research-context-label", "Selected node"),
      element("strong", null, title)
    );
    const state = element("span", "research-context-state", node.status || node.state || "Unknown");
    state.dataset.state = String(node.state || node.status || "unknown").toLowerCase();
    heading.append(headingCopy, state);

    const metadata = element("dl", "research-context-meta");
    const rows = [
      ["Node", node.id],
      ["Layer", node.layer || "unknown"],
      ["Domain", node.domain || "unknown"],
      ["Release", release.release_key]
    ];
    for (const [term, value] of rows) {
      const wrapper = element("div");
      wrapper.append(element("dt", null, term), element("dd", null, value));
      metadata.append(wrapper);
    }
    nodeContext.replaceChildren(heading, metadata);
    approval.hidden = true;
    formalize.hidden = true;
    updateComposer();
  }

  function observeSelection() {
    if (!detail) return;
    const refresh = () => {
      const next = detail.dataset.nodeId || null;
      if (next === selectedId) return;
      selectedId = next;
      updateNodeContext();
    };
    new MutationObserver(refresh).observe(detail, {
      attributes: true,
      attributeFilter: ["data-node-id"],
      childList: true,
      subtree: true
    });
    refresh();
  }

  function validateConfig(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("research agent configuration must be an object");
    }
    if (value.schema !== "pages-research-agent.v1") {
      throw new TypeError("research agent configuration has an unsupported schema");
    }
    if (typeof value.enabled !== "boolean") {
      throw new TypeError("research agent configuration enabled must be boolean");
    }
    if (typeof value.environment_profile !== "string" || value.environment_profile.trim() === "") {
      throw new TypeError("research agent configuration is missing environment_profile");
    }
    if (typeof value.profile_revision !== "string" || value.profile_revision.trim() === "") {
      throw new TypeError("research agent configuration is missing profile_revision");
    }
    if (
      !value.evidence_checkout
      || value.evidence_checkout.repository !== "the-omega-institute/trureturing"
      || value.evidence_checkout.ref_binding !== "release.source_commit"
      || value.evidence_checkout.read_only !== true
    ) {
      throw new TypeError("research agent configuration must bind a read-only release evidence checkout");
    }
    if (
      !value.skill
      || value.skill.name !== "codex-formal-answer"
      || value.skill.repository !== "the-omega-institute/trureturing"
      || !/^[0-9a-f]{40}$/.test(value.skill.ref || "")
      || !/^[0-9a-f]{40}$/.test(value.skill.git_blob_sha || "")
    ) {
      throw new TypeError("research agent configuration must bind an immutable codex-formal-answer skill");
    }
    if (!value.auth || !["same-origin-cookie", "bearer-provider"].includes(value.auth.mode)) {
      throw new TypeError("research agent configuration has an unsupported auth mode");
    }
    return value;
  }

  function credentialProviderAvailable() {
    if (!config || !config.enabled) return false;
    if (config.auth.mode === "same-origin-cookie") return true;
    return typeof window[config.auth.provider] === "function";
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
        throw new Error(`Credential provider ${config.auth.provider} is not available`);
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

  function runEndpoint() {
    const origin = String(config.cma_origin || "").replace(/\/+$/, "");
    const path = String(config.run_path || "/api/v1/agui/run");
    if (!path.startsWith("/")) throw new Error("CMA run_path must be absolute");
    const endpoint = new URL(`${origin}${path}`, window.location.origin);
    if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
      throw new Error("CMA endpoint must use HTTPS outside local development");
    }
    return endpoint.toString();
  }

  function persistedThreadId() {
    const release = currentRelease();
    if (!release || !config) return null;
    try {
      return window.localStorage.getItem(Context.sessionKey(
        release.release_key,
        config.environment_profile,
        config.profile_revision,
        config.skill.ref
      ));
    } catch (_) {
      return null;
    }
  }

  function persistThreadId(threadId) {
    if (!threadId || !graph || !config) return;
    const release = currentRelease();
    try {
      window.localStorage.setItem(
        Context.sessionKey(
          release.release_key,
          config.environment_profile,
          config.profile_revision,
          config.skill.ref
        ),
        threadId
      );
    } catch (_) {
      // Storage is an optional convenience. The active request still carries the session.
    }
  }

  function newPromptBody(context) {
    const threadId = persistedThreadId() || Context.opaqueId("pages_thread");
    const runId = Context.opaqueId("run");
    return {
      threadId,
      runId,
      state: {},
      messages: [{
        id: Context.opaqueId("message"),
        role: "user",
        content: Context.buildAgentPrompt(context, config.skill)
      }],
      tools: [],
      context: [],
      forwardedProps: {
        environmentProfile: config.environment_profile
      }
    };
  }

  function newResumeBody(interrupts) {
    const threadId = persistedThreadId();
    if (!threadId) throw new Error("Cannot resolve an approval before the CMA session id is known");
    return {
      threadId,
      runId: Context.opaqueId("run"),
      state: {},
      messages: [],
      tools: [],
      context: [],
      resume: interrupts
    };
  }

  function upsertLiveAssistant(frame) {
    if (!liveAssistant || liveAssistant.dataset.messageId !== frame.messageId) {
      clearTransient();
      liveAssistant = appendTranscript("assistant", "", "FORMALIZING");
      liveAssistant.dataset.messageId = frame.messageId;
      liveAssistant.classList.add("is-live");
    }
    const body = liveAssistant.querySelector(".research-message-body");
    body.textContent += frame.delta || "";
    transcript.scrollTop = transcript.scrollHeight;
  }

  function commitAssistant(frame) {
    clearTransient();
    appendTranscript("assistant", frame.delta || "", "ADVISORY");
  }

  function renderApprovals(interrupts) {
    approval.replaceChildren();
    const heading = element("div", "research-approval-heading");
    heading.append(
      element("strong", null, "Approval required"),
      element("span", null, "The run paused before an external action.")
    );
    const approvalForm = element("form", "research-approval-form");
    approvalForm.append(heading);

    interrupts.forEach((interrupt, index) => {
      const card = element("fieldset", "research-approval-card");
      const legend = element("legend", null, interrupt.reason || "confirmation");
      card.append(legend);
      card.append(element("p", null, interrupt.message || "The agent requested a decision without additional wording."));
      const choices = Array.isArray(interrupt.options) && interrupt.options.length > 0
        ? interrupt.options
        : [
          { decision: "allow", label: "Allow" },
          { decision: "deny", label: "Deny" },
          { decision: "abort", label: "Abort the turn" }
        ];
      const choiceList = element("div", "research-approval-choices");
      choices.forEach((choice) => {
        const label = element("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `approval-${index}`;
        input.value = choice.decision;
        input.required = true;
        label.append(input, document.createTextNode(choice.label || choice.decision));
        choiceList.append(label);
      });
      card.append(choiceList);
      card.dataset.interruptId = interrupt.id;
      approvalForm.append(card);
    });

    const submit = element("button", "research-primary", "Continue with these decisions");
    submit.type = "submit";
    approvalForm.append(submit);
    approvalForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const resolutions = [...approvalForm.querySelectorAll("fieldset")].map((card, index) => {
        const checked = card.querySelector(`input[name="approval-${index}"]:checked`);
        if (!checked) throw new Error("Every approval request needs a decision");
        return {
          interruptId: card.dataset.interruptId,
          status: "resolved",
          payload: { decision: checked.value }
        };
      });
      approval.hidden = true;
      appendTranscript("system", "Approval decisions submitted to the existing CMA session.", "RESOLUTION");
      await dispatch(newResumeBody(resolutions), {
        kind: "approval",
        mode: currentMode,
        userText: "Approval resolution"
      });
    });
    approval.append(approvalForm);
    approval.hidden = false;
  }

  function renderFormalizeHandoff() {
    formalize.replaceChildren();
    const copy = element("div");
    copy.append(
      element("strong", null, "Formalize handoff"),
      element(
        "p",
        null,
        config.formalize_submit_enabled
          ? "The advisory draft can be submitted through the configured Formalize capability after one more explicit confirmation."
          : "The draft remains advisory. Shining can enable the existing Formalize service in the CMA environment profile."
      )
    );
    formalize.append(copy);

    if (config.formalize_submit_enabled) {
      const disclose = element("button", "research-secondary", "Prepare submission confirmation");
      disclose.type = "button";
      disclose.addEventListener("click", () => {
        disclose.remove();
        const confirmForm = element("form", "research-formalize-confirm");
        const label = element("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.required = true;
        label.append(
          checkbox,
          document.createTextNode(" I approve one submission of the preceding draft to the configured Formalize capability.")
        );
        const submit = element("button", "research-primary", "Submit once");
        submit.type = "submit";
        confirmForm.append(label, submit);
        confirmForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const node = selectedNode();
          if (!node) return;
          const context = Context.buildContext({
            graph,
            nodeId: node.id,
            humanPrompt: "Submit the immediately preceding formalization draft once through the configured Formalize capability.",
            requestedMode: "formalize-submit"
          });
          formalize.hidden = true;
          appendTranscript("user", "Approved one Formalize submission for the preceding draft.", Context.humanTitle(node));
          await dispatch(newPromptBody(context), {
            kind: "prompt",
            mode: "formalize-submit",
            userText: context.human_prompt
          });
        });
        formalize.append(confirmForm);
      });
      formalize.append(disclose);
    }
    formalize.hidden = false;
  }

  function applyStateDelta(frame) {
    if (!Array.isArray(frame.delta)) return;
    for (const patch of frame.delta) {
      if (!patch || patch.op !== "replace") continue;
      if (patch.path === "/status") {
        if (patch.value === "ready") setConnection("Connected", "ready");
        else if (patch.value === "rotating") setConnection("Runtime rotating", "waiting");
      }
      if (patch.path === "/progress" && typeof patch.value === "string") {
        setConnection(patch.value.replaceAll("_", " "), "waiting");
      }
    }
  }

  function handleFrame(frame) {
    const event = frame.data;
    if (!event || typeof event !== "object") return;
    if (typeof event.threadId === "string" && event.threadId.trim() !== "") {
      persistThreadId(event.threadId.trim());
    }

    switch (event.type) {
      case "RUN_STARTED":
        setConnection("Formalizing", "running");
        setFormStatus("The agent is applying the formal-answer workflow to this release-bound context.", "running");
        break;
      case "REASONING_MESSAGE_CONTENT":
        setConnection("Formalizing", "running");
        break;
      case "TEXT_MESSAGE_CONTENT":
        if (event["cma:live"] === true) upsertLiveAssistant(event);
        else commitAssistant(event);
        break;
      case "TOOL_CALL_START": {
        const label = event.toolCallName || event.target || event["cma:toolKind"] || "Agent tool";
        const item = appendActivity(label, "running", "running");
        item.dataset.toolCallId = event.toolCallId || "";
        break;
      }
      case "TOOL_CALL_END": {
        const item = [...activity.querySelectorAll("[data-tool-call-id]")]
          .find((candidate) => candidate.dataset.toolCallId === event.toolCallId);
        if (item) {
          const status = event["cma:status"] || event.status || "completed";
          item.dataset.status = status;
          item.querySelector("span").textContent = status;
        }
        break;
      }
      case "STATE_DELTA":
        applyStateDelta(event);
        break;
      case "RUN_FINISHED":
        activeTerminal = true;
        clearTransient();
        if (event.outcome && event.outcome.type === "interrupt" && Array.isArray(event.outcome.interrupts)) {
          setConnection("Approval required", "waiting");
          renderApprovals(event.outcome.interrupts);
        } else {
          setConnection("Connected", "ready");
          setFormStatus("The answer is advisory and remains bound to the displayed release coordinate.", "ready");
          if (currentMode === "prepare-formalization") renderFormalizeHandoff();
        }
        break;
      case "RUN_ERROR":
        activeTerminal = true;
        clearTransient();
        if (event["cma:returns"] === true) {
          setConnection("Runtime handover", "waiting");
          appendTranscript("system", event.message || "The runtime is being replaced. The same session will return.", "HANDOVER");
        } else {
          setConnection("Run failed", "error");
          appendTranscript("system", event.message || "The agent run failed.", event.code || "ERROR");
        }
        break;
      default:
        break;
    }
  }

  async function consumeStream(response) {
    if (!response.body || typeof response.body.getReader !== "function") {
      throw new Error("CMA response did not provide a readable event stream");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = Context.createSseParser(handleFrame);
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      parser.push(decoder.decode(result.value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  }

  async function problemMessage(response) {
    const text = await response.text();
    try {
      const problem = JSON.parse(text);
      return problem.detail || problem.title || problem.code || `HTTP ${response.status}`;
    } catch (_) {
      return text.trim() || `HTTP ${response.status}`;
    }
  }

  async function dispatch(body, meta) {
    if (activeRequest) return;
    activeRequest = { body, meta };
    activeTerminal = false;
    lastFailedRequest = null;
    approval.hidden = true;
    formalize.hidden = true;
    retry.hidden = true;
    activity.replaceChildren();
    activity.hidden = true;
    currentMode = meta.mode || currentMode;
    updateComposer();

    try {
      const options = await requestOptions(body);
      const response = await fetch(runEndpoint(), options);
      if (!response.ok) throw new Error(await problemMessage(response));
      await consumeStream(response);
      if (!activeTerminal) {
        throw new Error("The event stream closed before the run reached a terminal event");
      }
    } catch (error) {
      lastFailedRequest = { body, meta };
      setConnection("Connection interrupted", "error");
      setFormStatus(
        `${error.message}. Retry reuses the same run id, so CMA can replay the same admission instead of creating another action.`,
        "error"
      );
    } finally {
      activeRequest = null;
      updateComposer();
    }
  }

  async function submitQuestion(event) {
    event.preventDefault();
    const node = selectedNode();
    const text = prompt.value.trim();
    if (!node || !text || activeRequest) return;
    const requestedMode = mode.value;
    const context = Context.buildContext({
      graph,
      nodeId: node.id,
      humanPrompt: text,
      requestedMode
    });
    appendTranscript("user", text, `${Context.humanTitle(node)} · ${requestedMode}`);
    prompt.value = "";
    await dispatch(newPromptBody(context), {
      kind: "prompt",
      mode: requestedMode,
      userText: text
    });
  }

  retry.addEventListener("click", async () => {
    if (!lastFailedRequest || activeRequest) return;
    const pending = lastFailedRequest;
    appendTranscript("system", "Retrying the same CMA run id.", "IDEMPOTENT RETRY");
    await dispatch(pending.body, pending.meta);
  });
  form.addEventListener("submit", submitQuestion);

  Promise.all([
    fetch("data/truth-graph.v1.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`truth graph returned HTTP ${response.status}`);
      return response.json();
    }),
    fetch("data/research-agent.v1.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`research configuration returned HTTP ${response.status}`);
      return response.json();
    })
  ])
    .then(([loadedGraph, loadedConfig]) => {
      if (!Array.isArray(loadedGraph.nodes) || !Array.isArray(loadedGraph.edges)) {
        throw new Error("truth graph is missing nodes or edges");
      }
      graph = loadedGraph;
      config = validateConfig(loadedConfig);
      runtimeReady = credentialProviderAvailable();
      observeSelection();
      if (!config.enabled) {
        setConnection("CMA setup required", "waiting");
        appendTranscript(
          "system",
          "The release-bound research interface is installed. It will use the immutable Base codex-formal-answer skill prelude and a separate read-only checkout at the selected truth release after the CMA origin, environment profile, CORS grant, and credential provider are configured.",
          "SETUP"
        );
      } else if (!runtimeReady) {
        setConnection("Credential setup required", "error");
        appendTranscript(
          "system",
          `The CMA endpoint is configured, while credential provider ${config.auth.provider} is not available on this page.`,
          "AUTH"
        );
      } else {
        setConnection("Connected", "ready");
        appendTranscript(
          "system",
          "Select a node and describe an idea. The agent receives only that node, its direct neighborhood, and the current release identity.",
          "READY"
        );
      }
      updateNodeContext();
    })
    .catch((error) => {
      runtimeReady = false;
      setConnection("Interface unavailable", "error");
      appendTranscript("system", error.message, "ERROR");
      updateComposer();
    });
}());
