(function () {
  "use strict";

  const detail = document.querySelector("#node-detail");
  const query = document.querySelector("#node-query");
  const form = document.querySelector("#node-search");
  const options = document.querySelector("#node-options");
  if (!detail || !query || !form) return;

  let nodeById = new Map();
  let selectedId = null;

  function nodeIdFromDetail() {
    for (const term of detail.querySelectorAll("dt")) {
      if (term.textContent.trim() !== "Node ID") continue;
      const value = term.nextElementSibling;
      return value ? value.textContent.trim() : null;
    }
    return null;
  }

  function nodeHash() {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("node");
    return value && nodeById.has(value) ? value : null;
  }

  function updateHash(nodeId) {
    const next = new URL(window.location.href);
    next.hash = `node=${encodeURIComponent(nodeId)}`;
    window.history.replaceState(null, "", next);
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value);
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    return Promise.resolve();
  }

  function installActions(nodeId) {
    const node = nodeById.get(nodeId);
    if (!node) return;
    detail.querySelector("[data-knowledge-actions]")?.remove();

    const actions = document.createElement("div");
    actions.className = "node-detail-actions";
    actions.dataset.knowledgeActions = "";

    const open = document.createElement("a");
    open.className = "node-detail-primary";
    open.textContent = "Open static concept page";
    open.href = node.knowledge_page || "knowledge/";
    actions.appendChild(open);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy node link";
    copy.addEventListener("click", async () => {
      updateHash(nodeId);
      await copyText(window.location.href);
      copy.textContent = "Copied";
      window.setTimeout(() => { copy.textContent = "Copy node link"; }, 1200);
    });
    actions.appendChild(copy);

    const heading = detail.querySelector("h2");
    if (heading) heading.insertAdjacentElement("afterend", actions);
    else detail.prepend(actions);
  }

  function selectNode(nodeId) {
    const node = nodeById.get(nodeId);
    if (!node) return;
    query.value = node.id;
    form.requestSubmit();
  }

  async function waitForGraph() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!options || options.options.length > 0) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }

  const observer = new MutationObserver(() => {
    const nodeId = nodeIdFromDetail();
    if (!nodeId || nodeId === selectedId) return;
    selectedId = nodeId;
    updateHash(nodeId);
    installActions(nodeId);
  });
  observer.observe(detail, { childList: true, subtree: true });

  fetch("data/truth-graph.v1.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`graph fetch failed: HTTP ${response.status}`);
      return response.json();
    })
    .then(async (graph) => {
      nodeById = new Map((graph.nodes || []).map((node) => [node.id, node]));
      await waitForGraph();
      const initial = nodeHash();
      if (initial) selectNode(initial);
    })
    .catch((error) => {
      console.warn("Static knowledge-page links unavailable.", error);
    });

  window.addEventListener("hashchange", () => {
    const nodeId = nodeHash();
    if (nodeId && nodeId !== selectedId) selectNode(nodeId);
  });
})();
