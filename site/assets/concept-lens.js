(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingConceptLens = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const CERTIFIED = new Set(["truth-dependency", "frozen-prerequisite", "module-import"]);
  const MAX_LOCAL_NODES = 48;

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function text(value) {
    if (typeof value !== "string") return null;
    const result = value.trim();
    return result && result !== "None" ? result : null;
  }

  function humanize(value) {
    return String(value || "")
      .replace(/\.lean$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function humanTitle(node) {
    if (!node || typeof node !== "object") return "Concept";
    const authored = text(node.human_title);
    if (authored) return authored;
    const raw = String(node.repo_path || node.title || node.id || "Concept");
    const leaf = humanize(raw.split("/").pop()) || "Concept";
    const domain = humanize(node.domain);
    return domain && domain.toLowerCase() !== leaf.toLowerCase() ? `${domain}: ${leaf}` : leaf;
  }

  function relationClass(edge) {
    const layer = String((edge && edge.layer) || "");
    if (CERTIFIED.has(layer)) return "certified";
    if (layer === "blueprint-truth-anchor") return "authored-anchor";
    if (layer.startsWith("blueprint-")) return "authored";
    if (layer === "structural-affinity") return "derived";
    if (layer === "intuition-candidate") return "advisory";
    return "other";
  }

  function isCertifiedDependency(edge) {
    return relationClass(edge) === "certified";
  }

  function rationalParts(value) {
    try {
      if (typeof value === "string") {
        const match = value.trim().match(/^(-?\d+)(?:\/(\d+))?$/);
        if (!match) return null;
        const denominator = BigInt(match[2] || "1");
        return denominator > 0n ? { numerator: BigInt(match[1]), denominator } : null;
      }
      if (value && typeof value === "object" && value.numerator !== undefined && value.denominator !== undefined) {
        const denominator = BigInt(String(value.denominator));
        return denominator > 0n
          ? { numerator: BigInt(String(value.numerator)), denominator }
          : null;
      }
      if (typeof value === "number" && Number.isSafeInteger(value)) {
        return { numerator: BigInt(value), denominator: 1n };
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function compareRational(left, right) {
    return left.numerator * right.denominator < right.numerator * left.denominator ? -1
      : left.numerator * right.denominator > right.numerator * left.denominator ? 1 : 0;
  }

  function parseRational(value) {
    const parts = rationalParts(value);
    return parts ? Number(parts.numerator) / Number(parts.denominator) : null;
  }

  function numeric(value, fallback) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  }

  function createIndex(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new TypeError("graph must contain nodes and edges arrays");
    }
    const nodeById = new Map();
    for (const node of graph.nodes) {
      if (!node || typeof node.id !== "string" || !node.id) throw new TypeError("every node needs an id");
      if (nodeById.has(node.id)) throw new TypeError(`duplicate node id: ${node.id}`);
      nodeById.set(node.id, node);
    }
    const maps = {
      parents: new Map(), children: new Map(), authored: new Map(), derived: new Map(), advisory: new Map()
    };
    for (const id of nodeById.keys()) {
      for (const map of Object.values(maps)) map.set(id, []);
    }
    const certifiedEdges = [];
    for (const edge of graph.edges) {
      if (!edge || typeof edge !== "object") continue;
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (!nodeById.has(source) || !nodeById.has(target)) continue;
      const record = { source, target, edge, relation: relationClass(edge) };
      if (record.relation === "certified") {
        maps.parents.get(target).push(source);
        maps.children.get(source).push(target);
        certifiedEdges.push(record);
      } else if (record.relation === "authored" || record.relation === "authored-anchor") {
        maps.authored.get(source).push(record);
        maps.authored.get(target).push(record);
      } else if (record.relation === "derived") {
        maps.derived.get(source).push(record);
        maps.derived.get(target).push(record);
      } else if (record.relation === "advisory") {
        maps.advisory.get(source).push(record);
        maps.advisory.get(target).push(record);
      }
    }
    const compareIds = (a, b) => humanTitle(nodeById.get(a)).localeCompare(humanTitle(nodeById.get(b))) || a.localeCompare(b);
    for (const map of [maps.parents, maps.children]) {
      for (const values of map.values()) values.sort(compareIds);
    }
    certifiedEdges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
    const truthNodes = graph.nodes.filter((node) => node.kind === "truth" || node.structure_source);
    const descendantCosts = truthNodes.map((node) => numeric(node.descendant_cost, null)).filter((value) => value !== null).sort((a, b) => a - b);
    const betweenness = truthNodes.map((node) => rationalParts(node.dependency_betweenness)).filter(Boolean).sort(compareRational);
    return Object.freeze({ graph, nodeById, ...maps, certifiedEdges, descendantCosts, betweenness });
  }

  function percentile(sorted, value, compare) {
    if (!sorted.length || value === null) return null;
    let count = 0;
    const comparator = compare || ((a, b) => a - b);
    for (const candidate of sorted) if (comparator(candidate, value) <= 0) count += 1;
    return count / sorted.length;
  }

  function structuralRole(node, index) {
    const published = text(node.structural_role);
    if (published) return { label: humanize(published), source: "topology-atlas.v1" };
    if (String(node.state || "").toLowerCase() === "open") return { label: "Frontier", source: "release state" };
    if (node.kind === "truth" && (index.parents.get(node.id) || []).length === 0) {
      return { label: "Foundation", source: "certified dependency graph" };
    }
    return { label: "Concept", source: "Pages fallback" };
  }

  function structuralFacts(node, index) {
    const facts = [];
    const descendants = numeric(node.descendant_count, null);
    const parents = index.parents.get(node.id) || [];
    const children = index.children.get(node.id) || [];
    if (descendants !== null) facts.push({ kind: "downstream", text: `Supports ${descendants} certified downstream concept${descendants === 1 ? "" : "s"}.` });
    if (parents.length) facts.push({ kind: "prerequisites", text: `Built from ${parents.length} direct certified prerequisite${parents.length === 1 ? "" : "s"}.` });
    if (children.length) facts.push({ kind: "dependents", text: `Directly enables ${children.length} next certified step${children.length === 1 ? "" : "s"}.` });
    const frontier = children.filter((id) => String(index.nodeById.get(id).state || "").toLowerCase() === "open");
    if (frontier.length) facts.push({ kind: "frontier-adjacency", text: `Touches ${frontier.length} open frontier concept${frontier.length === 1 ? "" : "s"}.` });
    const between = rationalParts(node.dependency_betweenness);
    if (percentile(index.betweenness, between, compareRational) >= 0.9 && between && between.numerator > 0n) {
      facts.push({ kind: "bridge-load", text: "Carries unusually high certified dependency traffic in this release." });
    }
    const cost = numeric(node.descendant_cost, null);
    if (percentile(index.descendantCosts, cost) >= 0.9 && cost > 1) {
      facts.push({ kind: "dependency-footprint", text: "Has one of the largest downstream dependency footprints in this release." });
    }
    return facts;
  }

  function exposition(node) {
    const summary = text(node.human_abstract);
    const theorem = text(node.human_theorem);
    return {
      summary: summary || "No authored explanation has been joined for this concept yet. Follow its certified relations or open the linked source material.",
      theorem,
      authority: summary || theorem ? "blueprint-authored" : "path-derived-fallback"
    };
  }

  function documentLinks(node, graph) {
    const links = [];
    if (text(node.knowledge_page)) links.push({ kind: "concept-page", label: "Shareable concept page", href: node.knowledge_page });
    if (text(node.release_page)) links.push({ kind: "release-page", label: "Immutable release view", href: node.release_page });
    const snapshot = graph.source_snapshot || {};
    const repo = text(snapshot.source_repo) || "the-omega-institute/trureturing";
    const commit = text(snapshot.source_commit);
    const blueprint = text(node.blueprint_path);
    if (commit && blueprint) {
      links.push({ kind: "blueprint-source", label: "Blueprint exposition", href: `https://github.com/${repo}/blob/${commit}/${blueprint}` });
    }
    const anchor = text(node.document_anchor);
    if (anchor) links.push({ kind: "mdbook", label: "Theory document", href: anchor });
    return links;
  }

  function buildLocalGraph(index, centerId, hops) {
    const levels = new Map([[centerId, 0]]);
    let upstream = new Set([centerId]);
    let downstream = new Set([centerId]);
    for (let step = 1; step <= hops; step += 1) {
      const nextUp = new Set();
      for (const id of upstream) for (const parent of index.parents.get(id) || []) {
        if (!levels.has(parent) || Math.abs(levels.get(parent)) > step) levels.set(parent, -step);
        nextUp.add(parent);
      }
      upstream = nextUp;
      const nextDown = new Set();
      for (const id of downstream) for (const child of index.children.get(id) || []) {
        if (!levels.has(child) || Math.abs(levels.get(child)) > step) levels.set(child, step);
        nextDown.add(child);
      }
      downstream = nextDown;
    }
    const ordered = [...levels.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]) || a[1] - b[1] || humanTitle(index.nodeById.get(a[0])).localeCompare(humanTitle(index.nodeById.get(b[0]))));
    const kept = new Map(ordered.slice(0, MAX_LOCAL_NODES));
    const nodes = [...kept.entries()].map(([id, level]) => ({ ...index.nodeById.get(id), level })).sort((a, b) => a.level - b.level || humanTitle(a).localeCompare(humanTitle(b)));
    const edges = index.certifiedEdges.filter((edge) => kept.has(edge.source) && kept.has(edge.target));
    return { centerId, hops, nodes, edges, truncated: levels.size > kept.size };
  }

  function localLayout(local, width) {
    const groups = new Map();
    for (const node of local.nodes) {
      if (!groups.has(node.level)) groups.set(node.level, []);
      groups.get(node.level).push(node);
    }
    const levels = [...groups.keys()].sort((a, b) => a - b);
    const positions = new Map();
    const rowHeight = 96;
    for (let row = 0; row < levels.length; row += 1) {
      const values = groups.get(levels[row]);
      values.sort((a, b) => humanTitle(a).localeCompare(humanTitle(b)) || a.id.localeCompare(b.id));
      const gap = width / (values.length + 1);
      values.forEach((node, index) => positions.set(node.id, { x: gap * (index + 1), y: 38 + row * rowHeight }));
    }
    return {
      width,
      height: Math.max(140, 76 + Math.max(0, levels.length - 1) * rowHeight),
      nodes: local.nodes.map((node) => ({ ...node, ...positions.get(node.id), selected: node.id === local.centerId })),
      edges: local.edges.map((edge) => ({ ...edge, x1: positions.get(edge.source).x, y1: positions.get(edge.source).y, x2: positions.get(edge.target).x, y2: positions.get(edge.target).y }))
    };
  }

  function relatedRecords(records, centerId, index) {
    return (records || []).map((record) => {
      const otherId = record.source === centerId ? record.target : record.source;
      return { ...record, other: index.nodeById.get(otherId) };
    }).filter((record) => record.other).sort((a, b) => humanTitle(a.other).localeCompare(humanTitle(b.other)));
  }

  function createModel(graph, nodeId, hops, suppliedIndex) {
    const index = suppliedIndex || createIndex(graph);
    const node = index.nodeById.get(nodeId);
    if (!node) throw new TypeError(`selected node is absent from graph: ${nodeId}`);
    const parents = (index.parents.get(nodeId) || []).map((id) => index.nodeById.get(id));
    const children = (index.children.get(nodeId) || []).map((id) => index.nodeById.get(id));
    const snapshot = graph.source_snapshot || {};
    return {
      node,
      title: humanTitle(node),
      status: text(node.status) || humanize(node.state) || "Unknown",
      state: String(node.state || "unknown").toLowerCase(),
      semanticKind: node.kind === "blueprint" ? "Theory document" : String(node.state || "").toLowerCase() === "open" ? "Open concept" : text(node.human_theorem) ? "Theorem concept" : "Formal concept",
      role: structuralRole(node, index),
      exposition: exposition(node),
      facts: structuralFacts(node, index),
      documents: documentLinks(node, graph),
      relations: {
        parents,
        children,
        authored: relatedRecords(index.authored.get(nodeId), nodeId, index),
        derived: relatedRecords(index.derived.get(nodeId), nodeId, index),
        advisory: relatedRecords(index.advisory.get(nodeId), nodeId, index),
        local: buildLocalGraph(index, nodeId, hops)
      },
      audit: {
        gid: text(node.gid), node_id: node.id, repository_path: text(node.repo_path),
        truth_release_digest: text(snapshot.truth_release_digest), source_commit: text(snapshot.source_commit),
        source_tree: text(snapshot.source_tree), certified_topology_digest: text(snapshot.certified_topology_digest),
        algorithm_profile_digest: text(snapshot.algorithm_profile_digest), topology_producer_commit: text(snapshot.topology_producer_commit),
        structure_source: text(node.structure_source)
      }
    };
  }

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
      const action = button(humanTitle(node));
      action.dataset.nodeId = node.id;
      const meta = element("small", null, `${node.status || humanize(node.state) || "Unknown"} · depth ${node.true_depth ?? node.max_depth ?? node.depth ?? 0}`);
      action.append(meta);
      item.append(action);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function renderLocalGraph(local) {
    const shell = element("div", "concept-local-graph");
    const layout = localLayout(local, 760);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${local.hops}-hop certified dependency neighborhood`);
    for (const edge of layout.edges) {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", `M ${edge.x1} ${edge.y1 + 17} C ${edge.x1} ${edge.y1 + 48}, ${edge.x2} ${edge.y2 - 48}, ${edge.x2} ${edge.y2 - 17}`);
      path.setAttribute("class", "concept-local-edge");
      svg.append(path);
    }
    for (const node of layout.nodes) {
      const group = document.createElementNS(svg.namespaceURI, "g");
      group.setAttribute("transform", `translate(${node.x - 62} ${node.y - 17})`);
      group.setAttribute("class", `concept-local-node${node.selected ? " is-selected" : ""}`);
      group.setAttribute("data-node-id", node.id);
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      const rect = document.createElementNS(svg.namespaceURI, "rect");
      rect.setAttribute("width", "124"); rect.setAttribute("height", "34"); rect.setAttribute("rx", "8");
      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", "62"); label.setAttribute("y", "21"); label.setAttribute("text-anchor", "middle");
      label.textContent = humanTitle(node).slice(0, 22);
      group.append(rect, label); svg.append(group);
    }
    shell.append(svg);
    if (local.truncated) shell.append(element("p", "concept-empty", `Showing the closest ${MAX_LOCAL_NODES} concepts. Narrow the view or follow one branch.`));
    return shell;
  }

  function renderConcept(model) {
    const panel = element("div", "concept-panel"); panel.dataset.panel = "concept";
    const says = element("section", "concept-section");
    says.append(element("p", "concept-section-kicker", "What it says"), element("p", "concept-copy", model.exposition.summary));
    if (model.exposition.theorem) says.append(element("p", "concept-theorem", model.exposition.theorem));
    const source = element("span", "concept-source", model.exposition.authority === "blueprint-authored" ? "Blueprint authored" : "Readable fallback");
    says.append(source); panel.append(says);
    const matters = element("section", "concept-section"); matters.append(element("p", "concept-section-kicker", "Why it matters"));
    const facts = element("ul", "concept-facts");
    for (const fact of model.facts) { const item = element("li", null, fact.text); item.dataset.kind = fact.kind; facts.append(item); }
    if (!model.facts.length) facts.append(element("li", "concept-empty", "No certified structural significance has been derived yet."));
    matters.append(facts); panel.append(matters);
    const documents = element("section", "concept-section"); documents.append(element("p", "concept-section-kicker", "Documents"));
    if (!model.documents.length) documents.append(element("p", "concept-empty", "No document anchor is available for this concept."));
    else {
      const list = element("ul", "concept-documents");
      for (const document of model.documents) {
        const item = element("li"); const link = element("a", null, document.label); link.href = document.href;
        if (/^https?:/.test(document.href)) { link.target = "_blank"; link.rel = "noopener"; }
        const kind = element("small", null, humanize(document.kind)); item.append(link, kind); list.append(item);
      }
      documents.append(list);
    }
    panel.append(documents); return panel;
  }

  function renderRelations(model, hops, setHops) {
    const panel = element("div", "concept-panel"); panel.dataset.panel = "relations"; panel.hidden = true;
    const toolbar = element("div", "concept-relation-toolbar");
    toolbar.append(element("span", null, "Certified neighborhood"));
    for (const value of [1, 2]) {
      const action = button(`${value}-hop`); action.setAttribute("aria-pressed", String(value === hops));
      action.addEventListener("click", () => setHops(value)); toolbar.append(action);
    }
    panel.append(toolbar, renderLocalGraph(model.relations.local));
    const columns = element("div", "concept-relation-columns");
    columns.append(
      relationList("Built from", model.relations.parents, "No direct certified prerequisites."),
      relationList("Enables", model.relations.children, "No direct certified dependents.")
    );
    panel.append(columns);
    const classes = [
      ["Certified", "Certified proof dependency", "certified"],
      ["Authored", "Blueprint relation or truth anchor", "authored"],
      ["Derived", "Derived structural affinity, no proof edge", "derived"],
      ["Advisory", "Advisory candidate, unverified", "advisory"]
    ];
    const legend = element("ul", "concept-relation-legend");
    for (const [label, description, kind] of classes) {
      const item = element("li"); item.dataset.kind = kind; item.append(element("strong", null, label), element("span", null, description)); legend.append(item);
    }
    panel.append(legend);
    return panel;
  }

  function renderResearch(model, openResearch) {
    const panel = element("div", "concept-panel"); panel.dataset.panel = "research"; panel.hidden = true;
    panel.append(element("p", "concept-section-kicker", "Research from this concept"), element("p", "concept-copy", "Open a release-bound conversation with this concept and its direct certified neighborhood already attached as evidence context."));
    const actions = element("div", "concept-research-actions");
    const prompts = [
      ["Explain this concept", "answer", `Explain ${model.title} from its prerequisites through its consequences.`],
      ["Find a missing assumption", "prepare-formalization", `Inspect ${model.title} for a missing assumption, hidden prerequisite, or boundary condition.`],
      ["Search for a counterexample", "prepare-formalization", `Search for the nearest counterexample shape or falsifier for ${model.title}.`],
      ["Prepare formalization", "prepare-formalization", `Prepare a release-bound formalization draft extending or reusing ${model.title}.`]
    ];
    for (const [label, mode, prompt] of prompts) {
      const action = button(label, "concept-research-action");
      action.addEventListener("click", () => openResearch({ nodeId: model.node.id, mode, prompt })); actions.append(action);
    }
    panel.append(actions); return panel;
  }

  function renderAudit(model) {
    const details = element("details", "concept-audit"); details.append(element("summary", null, "Audit details"));
    const list = element("dl", "concept-audit-list");
    const labels = { gid: "GID", node_id: "Node ID", repository_path: "Repository path", truth_release_digest: "Truth release", source_commit: "Source commit", source_tree: "Source tree", certified_topology_digest: "Certified topology", algorithm_profile_digest: "Topology profile", topology_producer_commit: "Topology producer", structure_source: "Structure source" };
    for (const [key, label] of Object.entries(labels)) {
      if (!model.audit[key]) continue;
      const row = element("div"); row.append(element("dt", null, label), element("dd", null, model.audit[key])); list.append(row);
    }
    details.append(list); return details;
  }

  function createController(options) {
    if (!options || !options.root || !options.graph) throw new TypeError("concept lens requires root and graph");
    const rootElement = options.root;
    const graph = options.graph;
    const index = createIndex(graph);
    const onOpenResearch = typeof options.onOpenResearch === "function" ? options.onOpenResearch : () => {};
    let selectedId = null; let activeTab = "concept"; let hops = 1;

    function empty() {
      rootElement.removeAttribute("data-node-id");
      rootElement.replaceChildren();
      const guide = element("div", "concept-lens-empty");
      guide.append(element("p", "eyebrow", "Concept Lens"), element("h2", null, "Select a concept"), element("p", null, "Click any node to read its explanation, inspect certified prerequisites and consequences, follow documents, or begin release-bound research."), element("small", null, "The global 3D atlas provides structure. The local 2D view provides exact dependency direction."));
      rootElement.append(guide);
    }

    function setTab(tab) {
      activeTab = ["concept", "relations", "research"].includes(tab) ? tab : "concept";
      for (const action of rootElement.querySelectorAll("[data-lens-tab]")) {
        const active = action.dataset.lensTab === activeTab;
        action.setAttribute("aria-selected", String(active)); action.tabIndex = active ? 0 : -1;
      }
      for (const panel of rootElement.querySelectorAll("[data-panel]")) panel.hidden = panel.dataset.panel !== activeTab;
    }

    function render() {
      if (!selectedId) return empty();
      const model = createModel(graph, selectedId, hops, index);
      rootElement.dataset.nodeId = selectedId;
      rootElement.replaceChildren();
      const article = element("article", "concept-lens-article");
      const header = element("header", "concept-lens-header");
      const identity = element("div", "concept-lens-identity");
      identity.append(element("p", "eyebrow", "Concept Lens"), element("h2", null, model.title), element("p", "concept-kind", model.semanticKind));
      const chips = element("div", "concept-chips");
      const status = element("span", "concept-status", model.status); status.dataset.state = model.state;
      const role = element("span", "concept-role", model.role.label); role.title = `Role source: ${model.role.source}`;
      chips.append(status, role); header.append(identity, chips); article.append(header);
      const tabs = element("div", "concept-tabs"); tabs.setAttribute("role", "tablist");
      for (const [tab, label] of [["concept", "Concept"], ["relations", "Relations"], ["research", "Research"]]) {
        const action = button(label); action.dataset.lensTab = tab; action.setAttribute("role", "tab"); action.addEventListener("click", () => setTab(tab)); tabs.append(action);
      }
      article.append(tabs);
      const panels = element("div", "concept-panels");
      panels.append(renderConcept(model), renderRelations(model, hops, (value) => { hops = value; const tab = activeTab; render(); setTab(tab); }), renderResearch(model, onOpenResearch));
      article.append(panels, renderAudit(model)); rootElement.append(article); setTab(activeTab);
    }

    empty();
    return Object.freeze({
      select(nodeId, tab) { if (!index.nodeById.has(nodeId)) throw new TypeError(`selected node is absent from graph: ${nodeId}`); selectedId = nodeId; activeTab = tab || "concept"; hops = 1; render(); },
      clear() { selectedId = null; activeTab = "concept"; hops = 1; empty(); },
      setTab,
      model() { return selectedId ? createModel(graph, selectedId, hops, index) : null; }
    });
  }

  function openResearchDrawer(request) {
    const drawer = document.querySelector("#research-console");
    const backdrop = document.querySelector("#research-backdrop");
    if (!drawer) return;
    const mode = drawer.querySelector("#research-mode");
    const prompt = drawer.querySelector("#research-prompt");
    if (mode && request.mode) mode.value = request.mode;
    if (prompt && request.prompt) prompt.value = request.prompt;
    drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add("research-drawer-open");
    const close = () => {
      drawer.hidden = true; if (backdrop) backdrop.hidden = true;
      document.body.classList.remove("research-drawer-open");
    };
    const closeButton = drawer.querySelector("#research-close");
    if (closeButton) closeButton.onclick = close;
    if (backdrop) backdrop.onclick = close;
    if (prompt) prompt.focus();
  }

  function installBrowser() {
    const rootElement = document.querySelector("#node-detail");
    if (!rootElement) return;
    const load = (path) => fetch(path, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      return response.json();
    });
    load("data/pages-atlas-view.v1.json").catch(() => load("data/truth-graph.v1.json")).then((graph) => {
      const controller = createController({ root: rootElement, graph, onOpenResearch: openResearchDrawer });
      const refresh = () => {
        const nodeId = rootElement.dataset.nodeId || null;
        if (nodeId) controller.select(nodeId); else controller.clear();
      };
      new MutationObserver(refresh).observe(rootElement, { attributes: true, attributeFilter: ["data-node-id"] });
      const counts = graph.counts || {};
      const conceptCount = document.querySelector("#concept-count");
      if (conceptCount) conceptCount.textContent = String(counts.truth_nodes ?? graph.nodes.filter((node) => node.kind === "truth").length);
      const hashNode = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("node");
      if (hashNode) {
        let attempts = 0;
        const focus = window.setInterval(() => {
          attempts += 1;
          const form = document.querySelector("#node-search"); const input = document.querySelector("#node-query");
          if (form && input && document.querySelector("#graph-status.graph-status-ready")) {
            input.value = hashNode; form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); window.clearInterval(focus);
          } else if (attempts > 80) window.clearInterval(focus);
        }, 100);
      }
    }).catch((error) => {
      rootElement.replaceChildren(element("p", "concept-lens-error", `Concept Lens is unavailable: ${error.message}`));
    });
  }

  if (typeof document === "object") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installBrowser, { once: true });
    else installBrowser();
  }

  return Object.freeze({ buildLocalGraph, createController, createIndex, createModel, documentLinks, endpointId, humanTitle, isCertifiedDependency, localLayout, parseRational, relationClass, structuralFacts });
}));
