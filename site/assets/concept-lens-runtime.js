(function () {
  "use strict";

  const Core = window.TrureturingConceptLensCore;
  if (!Core) return;

  function element(tag, className, content) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (content !== undefined && content !== null) value.textContent = String(content);
    return value;
  }

  function button(label, className) {
    const value = element("button", className, label);
    value.type = "button";
    return value;
  }

  function relationList(title, nodes, emptyText) {
    const section = element("section", "concept-section concept-relations-list");
    section.append(element("p", "concept-section-kicker", title));
    if (!nodes.length) {
      section.append(element("p", "concept-empty", emptyText));
      return section;
    }

    const list = element("ul", "concept-link-list");
    for (const node of nodes) {
      const item = element("li");
      const action = button(Core.humanTitle(node));
      action.dataset.nodeId = node.id;
      action.append(element(
        "small",
        null,
        `${node.status || Core.humanize(node.state) || "Unknown"} · depth ${node.true_depth ?? node.max_depth ?? node.depth ?? 0}`
      ));
      item.append(action);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function provenanceList(title, records, emptyText, explanation) {
    const section = element("section", "concept-section concept-relations-list");
    section.append(element("p", "concept-section-kicker", title));
    if (!records.length) {
      section.append(element("p", "concept-empty", emptyText));
      return section;
    }

    const list = element("ul", "concept-link-list");
    for (const record of records) {
      const item = element("li");
      const action = button(Core.humanTitle(record.other));
      action.dataset.nodeId = record.other.id;
      action.append(element("small", null, explanation(record)));
      item.append(action);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function renderLocalGraph(local) {
    const shell = element("div", "concept-local-graph");
    const layout = Core.localLayout(local, 760);
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${local.hops}-hop certified dependency neighborhood`);

    const defs = document.createElementNS(namespace, "defs");
    const marker = document.createElementNS(namespace, "marker");
    marker.setAttribute("id", "concept-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "5");
    marker.setAttribute("markerHeight", "5");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS(namespace, "path");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrow.setAttribute("class", "concept-local-arrow");
    marker.append(arrow);
    defs.append(marker);
    svg.append(defs);

    for (const edge of layout.edges) {
      const path = document.createElementNS(namespace, "path");
      path.setAttribute(
        "d",
        `M ${edge.x1} ${edge.y1 + 17} C ${edge.x1} ${edge.y1 + 48}, ${edge.x2} ${edge.y2 - 48}, ${edge.x2} ${edge.y2 - 20}`
      );
      path.setAttribute("class", "concept-local-edge");
      path.setAttribute("marker-end", "url(#concept-arrow)");
      svg.append(path);
    }

    for (const node of layout.nodes) {
      const group = document.createElementNS(namespace, "g");
      group.setAttribute("transform", `translate(${node.x - 62} ${node.y - 17})`);
      group.setAttribute("class", `concept-local-node${node.selected ? " is-selected" : ""}`);
      group.setAttribute("data-node-id", node.id);
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `Focus ${Core.humanTitle(node)}`);
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          group.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
      });

      const rect = document.createElementNS(namespace, "rect");
      rect.setAttribute("width", "124");
      rect.setAttribute("height", "34");
      rect.setAttribute("rx", "8");
      const label = document.createElementNS(namespace, "text");
      label.setAttribute("x", "62");
      label.setAttribute("y", "21");
      label.setAttribute("text-anchor", "middle");
      label.textContent = Core.humanTitle(node).slice(0, 22);
      group.append(rect, label);
      svg.append(group);
    }

    shell.append(svg);
    if (local.truncated) {
      shell.append(element(
        "p",
        "concept-empty",
        `Showing the closest ${Core.MAX_LOCAL_NODES} concepts. Narrow the view or follow one branch.`
      ));
    }
    return shell;
  }

  function renderConcept(model) {
    const panel = element("div", "concept-panel");
    panel.dataset.panel = "concept";

    const says = element("section", "concept-section");
    says.append(
      element("p", "concept-section-kicker", "What it says"),
      element("p", "concept-copy", model.exposition.summary)
    );
    if (model.exposition.theorem) {
      says.append(element("p", "concept-theorem", model.exposition.theorem));
    }
    says.append(element(
      "span",
      "concept-source",
      model.exposition.authority === "blueprint-authored"
        ? "Blueprint authored"
        : "Readable fallback"
    ));
    panel.append(says);

    const matters = element("section", "concept-section");
    matters.append(element("p", "concept-section-kicker", "Why it matters"));
    const facts = element("ul", "concept-facts");
    for (const fact of model.facts) {
      const item = element("li", null, fact.text);
      item.dataset.kind = fact.kind;
      facts.append(item);
    }
    if (!model.facts.length) {
      facts.append(element("li", "concept-empty", "No certified structural significance has been derived yet."));
    }
    matters.append(facts);
    panel.append(matters);

    const documents = element("section", "concept-section");
    documents.append(element("p", "concept-section-kicker", "Documents"));
    if (!model.documents.length) {
      documents.append(element("p", "concept-empty", "No document anchor is available for this concept."));
    } else {
      const list = element("ul", "concept-documents");
      for (const document of model.documents) {
        const item = element("li");
        const link = element("a", null, document.label);
        link.href = document.href;
        if (/^https?:/.test(document.href)) {
          link.target = "_blank";
          link.rel = "noopener";
        }
        item.append(link, element("small", null, Core.humanize(document.kind)));
        list.append(item);
      }
      documents.append(list);
    }
    panel.append(documents);
    return panel;
  }

  function renderRelations(model, hops, setHops) {
    const panel = element("div", "concept-panel");
    panel.dataset.panel = "relations";
    panel.hidden = true;

    const toolbar = element("div", "concept-relation-toolbar");
    toolbar.append(element("span", null, "Certified neighborhood"));
    const controls = element("div", "concept-hop-controls");
    for (const value of [1, 2]) {
      const action = button(`${value}-hop`);
      action.setAttribute("aria-pressed", String(value === hops));
      action.addEventListener("click", () => setHops(value));
      controls.append(action);
    }
    toolbar.append(controls);
    panel.append(toolbar, renderLocalGraph(model.relations.local));

    const columns = element("div", "concept-relation-columns");
    columns.append(
      relationList("Built from", model.relations.parents, "No direct certified prerequisites."),
      relationList("Enables", model.relations.children, "No direct certified dependents.")
    );
    panel.append(columns);

    panel.append(
      provenanceList(
        "Structurally related",
        model.relations.derived,
        "No derived structural neighbor is published for this concept.",
        () => "Derived affinity. No certified proof edge."
      ),
      provenanceList(
        "Authored relations",
        model.relations.authored,
        "No authored relation is attached beyond the document cards.",
        (record) => record.relation === "authored-anchor"
          ? "Blueprint truth anchor"
          : "Authored narrative relation"
      ),
      provenanceList(
        "Advisory candidates",
        model.relations.advisory,
        "No unverified candidate relation is currently overlaid.",
        () => "Advisory candidate. Requires settlement."
      )
    );

    const legend = element("ul", "concept-relation-legend");
    for (const [label, description, kind] of [
      ["Certified", "Certified proof dependency", "certified"],
      ["Authored", "Blueprint relation or truth anchor", "authored"],
      ["Derived", "Derived structural affinity, no proof edge", "derived"],
      ["Advisory", "Advisory candidate, unverified", "advisory"]
    ]) {
      const item = element("li");
      item.dataset.kind = kind;
      item.append(element("strong", null, label), element("span", null, description));
      legend.append(item);
    }
    panel.append(legend);
    return panel;
  }

  function renderResearch(model, openResearch) {
    const panel = element("div", "concept-panel");
    panel.dataset.panel = "research";
    panel.hidden = true;
    panel.append(
      element("p", "concept-section-kicker", "Research from this concept"),
      element(
        "p",
        "concept-copy",
        "Open a release-bound conversation with this concept and its direct certified neighborhood already attached as evidence context."
      )
    );

    const actions = element("div", "concept-research-actions");
    for (const [label, mode, prompt] of [
      ["Explain this concept", "answer", `Explain ${model.title} from its prerequisites through its consequences.`],
      ["Find a missing assumption", "prepare-formalization", `Inspect ${model.title} for a missing assumption, hidden prerequisite, or boundary condition.`],
      ["Search for a counterexample", "prepare-formalization", `Search for the nearest counterexample shape or falsifier for ${model.title}.`],
      ["Prepare formalization", "prepare-formalization", `Prepare a release-bound formalization draft extending or reusing ${model.title}.`]
    ]) {
      const action = button(label, "concept-research-action");
      action.addEventListener("click", () => openResearch({
        nodeId: model.node.id,
        mode,
        prompt
      }));
      actions.append(action);
    }
    panel.append(actions);
    return panel;
  }

  function renderAudit(model) {
    const details = element("details", "concept-audit");
    details.append(element("summary", null, "Audit details"));
    const list = element("dl", "concept-audit-list");
    const labels = {
      gid: "GID",
      node_id: "Node ID",
      repository_path: "Repository path",
      truth_release_digest: "Truth release",
      source_commit: "Source commit",
      source_tree: "Source tree",
      certified_topology_digest: "Certified topology",
      algorithm_profile_digest: "Topology profile",
      topology_producer_commit: "Topology producer",
      structure_source: "Structure source"
    };
    for (const [key, label] of Object.entries(labels)) {
      if (!model.audit[key]) continue;
      const row = element("div");
      row.append(element("dt", null, label), element("dd", null, model.audit[key]));
      list.append(row);
    }
    details.append(list);
    return details;
  }

  function createController(rootElement, graph, openResearch) {
    const index = Core.createIndex(graph);
    let selectedId = null;
    let activeTab = "concept";
    let hops = 1;

    function empty() {
      rootElement.replaceChildren();
      const guide = element("div", "concept-lens-empty");
      guide.append(
        element("p", "eyebrow", "Concept Lens"),
        element("h2", null, "Select a concept"),
        element(
          "p",
          null,
          "Click any node to read its explanation, inspect certified prerequisites and consequences, follow documents, or begin release-bound research."
        ),
        element(
          "small",
          null,
          "The global 3D Atlas provides structure. The local 2D view provides exact dependency direction."
        )
      );
      rootElement.append(guide);
    }

    function setTab(tab) {
      activeTab = ["concept", "relations", "research"].includes(tab) ? tab : "concept";
      for (const action of rootElement.querySelectorAll("[data-lens-tab]")) {
        const active = action.dataset.lensTab === activeTab;
        action.setAttribute("aria-selected", String(active));
        action.tabIndex = active ? 0 : -1;
      }
      for (const panel of rootElement.querySelectorAll("[data-panel]")) {
        panel.hidden = panel.dataset.panel !== activeTab;
      }
    }

    function render() {
      if (!selectedId) {
        empty();
        return;
      }
      const model = Core.createModel(graph, selectedId, hops, index);
      rootElement.replaceChildren();

      const article = element("article", "concept-lens-article");
      const header = element("header", "concept-lens-header");
      const identity = element("div", "concept-lens-identity");
      identity.append(
        element("p", "eyebrow", "Concept Lens"),
        element("h2", null, model.title),
        element("p", "concept-kind", model.semanticKind)
      );
      const chips = element("div", "concept-chips");
      const status = element("span", "concept-status", model.status);
      status.dataset.state = model.state;
      const role = element("span", "concept-role", model.role.label);
      role.title = `Role source: ${model.role.source}`;
      chips.append(status, role);
      header.append(identity, chips);
      article.append(header);

      const tabs = element("div", "concept-tabs");
      tabs.setAttribute("role", "tablist");
      for (const [tab, label] of [
        ["concept", "Concept"],
        ["relations", "Relations"],
        ["research", "Research"]
      ]) {
        const action = button(label);
        action.dataset.lensTab = tab;
        action.setAttribute("role", "tab");
        action.addEventListener("click", () => setTab(tab));
        tabs.append(action);
      }
      article.append(tabs);

      const panels = element("div", "concept-panels");
      panels.append(
        renderConcept(model),
        renderRelations(model, hops, (value) => {
          hops = value;
          const tab = activeTab;
          render();
          setTab(tab);
        }),
        renderResearch(model, openResearch)
      );
      article.append(panels, renderAudit(model));
      rootElement.append(article);
      setTab(activeTab);
    }

    empty();
    return Object.freeze({
      select(nodeId) {
        if (nodeId === selectedId) return;
        selectedId = nodeId;
        activeTab = "concept";
        hops = 1;
        render();
      },
      clear() {
        if (selectedId === null) return;
        selectedId = null;
        activeTab = "concept";
        hops = 1;
        empty();
      }
    });
  }

  function installResearchDrawer() {
    const drawer = document.querySelector("#research-console");
    const backdrop = document.querySelector("#research-backdrop");
    if (!drawer) return () => {};

    const close = () => {
      drawer.hidden = true;
      if (backdrop) backdrop.hidden = true;
      document.body.classList.remove("research-drawer-open");
    };
    const closeButton = drawer.querySelector("#research-close");
    if (closeButton) closeButton.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !drawer.hidden) close();
    });

    return (request) => {
      const mode = drawer.querySelector("#research-mode");
      const prompt = drawer.querySelector("#research-prompt");
      if (mode && request.mode) mode.value = request.mode;
      if (prompt && request.prompt) prompt.value = request.prompt;
      drawer.hidden = false;
      if (backdrop) backdrop.hidden = false;
      document.body.classList.add("research-drawer-open");
      drawer.focus();
      if (prompt) prompt.focus();
    };
  }

  function install() {
    const rootElement = document.querySelector("#node-detail");
    if (!rootElement) return;

    const load = (path) => fetch(path, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      return response.json();
    });

    load("data/pages-atlas-view.v1.json")
      .catch(() => load("data/truth-graph.v1.json"))
      .then((graph) => {
        const controller = createController(
          rootElement,
          graph,
          installResearchDrawer()
        );
        const refresh = () => {
          const nextId = rootElement.dataset.nodeId || null;
          if (nextId) controller.select(nextId);
          else controller.clear();
        };
        new MutationObserver(refresh).observe(rootElement, {
          attributes: true,
          attributeFilter: ["data-node-id"]
        });
        refresh();

        const counts = graph.counts || {};
        const conceptCount = document.querySelector("#concept-count");
        if (conceptCount) {
          conceptCount.textContent = String(
            counts.truth_nodes
            ?? graph.nodes.filter((node) => node.kind === "truth").length
          );
        }
        const releaseStatus = document.querySelector("#release-status");
        const releaseDigest = String(
          (graph.source_snapshot || {}).truth_release_digest || ""
        );
        if (releaseStatus) {
          releaseStatus.textContent = /^sha256:[0-9a-f]{64}$/.test(releaseDigest)
            ? "Verified"
            : "Preview";
        }

        const hashNode = new URLSearchParams(
          window.location.hash.replace(/^#/, "")
        ).get("node");
        if (hashNode) {
          let attempts = 0;
          const timer = window.setInterval(() => {
            attempts += 1;
            const form = document.querySelector("#node-search");
            const input = document.querySelector("#node-query");
            if (form && input && document.querySelector("#graph-status.graph-status-ready")) {
              input.value = hashNode;
              form.dispatchEvent(new Event("submit", {
                bubbles: true,
                cancelable: true
              }));
              window.clearInterval(timer);
            } else if (attempts > 80) {
              window.clearInterval(timer);
            }
          }, 100);
        }
      })
      .catch((error) => {
        rootElement.replaceChildren(element(
          "p",
          "concept-lens-error",
          `Concept Lens is unavailable: ${error.message}`
        ));
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
}());
