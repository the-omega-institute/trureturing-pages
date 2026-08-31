(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingConceptLensCore = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const CERTIFIED_LAYERS = new Set([
    "truth-dependency",
    "frozen-prerequisite",
    "module-import"
  ]);
  const MAX_LOCAL_NODES = 48;

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function cleanText(value) {
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
    const authored = cleanText(node.human_title);
    if (authored) return authored;
    const raw = String(node.repo_path || node.title || node.id || "Concept");
    const leaf = humanize(raw.split("/").pop()) || "Concept";
    const domain = humanize(node.domain);
    return domain && domain.toLowerCase() !== leaf.toLowerCase()
      ? `${domain}: ${leaf}`
      : leaf;
  }

  function relationClass(edge) {
    const layer = String((edge && edge.layer) || "");
    if (CERTIFIED_LAYERS.has(layer)) return "certified";
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
        return denominator > 0n
          ? { numerator: BigInt(match[1]), denominator }
          : null;
      }
      if (value && typeof value === "object"
          && value.numerator !== undefined
          && value.denominator !== undefined) {
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
    const l = left.numerator * right.denominator;
    const r = right.numerator * left.denominator;
    return l < r ? -1 : l > r ? 1 : 0;
  }

  function parseRational(value) {
    const parts = rationalParts(value);
    return parts ? Number(parts.numerator) / Number(parts.denominator) : null;
  }

  function numeric(value, fallback) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  }

  function sortedNodeIds(ids, nodeById) {
    return [...new Set(ids)].sort((left, right) =>
      humanTitle(nodeById.get(left)).localeCompare(humanTitle(nodeById.get(right)))
      || left.localeCompare(right));
  }

  function createIndex(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new TypeError("graph must contain nodes and edges arrays");
    }

    const nodeById = new Map();
    for (const node of graph.nodes) {
      if (!node || typeof node.id !== "string" || !node.id) {
        throw new TypeError("every node needs an id");
      }
      if (nodeById.has(node.id)) throw new TypeError(`duplicate node id: ${node.id}`);
      nodeById.set(node.id, node);
    }

    const parents = new Map();
    const children = new Map();
    const authored = new Map();
    const derived = new Map();
    const advisory = new Map();
    for (const id of nodeById.keys()) {
      parents.set(id, []);
      children.set(id, []);
      authored.set(id, []);
      derived.set(id, []);
      advisory.set(id, []);
    }

    const certifiedEdges = [];
    for (const edge of graph.edges) {
      if (!edge || typeof edge !== "object") continue;
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (!nodeById.has(source) || !nodeById.has(target)) continue;
      const record = { source, target, edge, relation: relationClass(edge) };
      if (record.relation === "certified") {
        parents.get(target).push(source);
        children.get(source).push(target);
        certifiedEdges.push(record);
      } else if (record.relation === "authored" || record.relation === "authored-anchor") {
        authored.get(source).push(record);
        authored.get(target).push(record);
      } else if (record.relation === "derived") {
        derived.get(source).push(record);
        derived.get(target).push(record);
      } else if (record.relation === "advisory") {
        advisory.get(source).push(record);
        advisory.get(target).push(record);
      }
    }

    for (const [id, values] of parents) parents.set(id, sortedNodeIds(values, nodeById));
    for (const [id, values] of children) children.set(id, sortedNodeIds(values, nodeById));
    certifiedEdges.sort((left, right) =>
      left.source.localeCompare(right.source) || left.target.localeCompare(right.target));

    const truthNodes = graph.nodes.filter((node) => node.kind === "truth" || node.structure_source);
    const descendantCosts = truthNodes
      .map((node) => numeric(node.descendant_cost, null))
      .filter((value) => value !== null)
      .sort((a, b) => a - b);
    const betweenness = truthNodes
      .map((node) => rationalParts(node.dependency_betweenness))
      .filter(Boolean)
      .sort(compareRational);

    return Object.freeze({
      graph,
      nodeById,
      parents,
      children,
      authored,
      derived,
      advisory,
      certifiedEdges,
      descendantCosts,
      betweenness
    });
  }

  function percentile(sorted, value, compare) {
    if (!sorted.length || value === null) return null;
    const comparator = compare || ((left, right) => left - right);
    let count = 0;
    for (const candidate of sorted) {
      if (comparator(candidate, value) <= 0) count += 1;
    }
    return count / sorted.length;
  }

  function structuralRole(node, index) {
    const published = cleanText(node.structural_role);
    if (published) return { label: humanize(published), source: "topology-atlas.v1" };
    if (String(node.state || "").toLowerCase() === "open") {
      return { label: "Frontier", source: "release state" };
    }
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

    if (descendants !== null) {
      facts.push({
        kind: "downstream",
        text: `Supports ${descendants} certified downstream concept${descendants === 1 ? "" : "s"}.`
      });
    }
    if (parents.length) {
      facts.push({
        kind: "prerequisites",
        text: `Built from ${parents.length} direct certified prerequisite${parents.length === 1 ? "" : "s"}.`
      });
    }
    if (children.length) {
      facts.push({
        kind: "dependents",
        text: `Directly enables ${children.length} next certified step${children.length === 1 ? "" : "s"}.`
      });
    }

    const frontier = children.filter((id) =>
      String(index.nodeById.get(id).state || "").toLowerCase() === "open");
    if (frontier.length) {
      facts.push({
        kind: "frontier-adjacency",
        text: `Touches ${frontier.length} open frontier concept${frontier.length === 1 ? "" : "s"}.`
      });
    }

    const between = rationalParts(node.dependency_betweenness);
    if (between && between.numerator > 0n
        && percentile(index.betweenness, between, compareRational) >= 0.9) {
      facts.push({
        kind: "bridge-load",
        text: "Carries unusually high certified dependency traffic in this release."
      });
    }

    const cost = numeric(node.descendant_cost, null);
    if (cost > 1 && percentile(index.descendantCosts, cost) >= 0.9) {
      facts.push({
        kind: "dependency-footprint",
        text: "Has one of the largest downstream dependency footprints in this release."
      });
    }
    return facts;
  }

  function exposition(node) {
    const summary = cleanText(node.human_abstract);
    const theorem = cleanText(node.human_theorem);
    return {
      summary: summary || "No authored explanation has been joined for this concept yet. Follow its certified relations or open the linked source material.",
      theorem,
      authority: summary || theorem ? "blueprint-authored" : "path-derived-fallback"
    };
  }

  function documentLinks(node, graph) {
    const links = [];
    if (cleanText(node.knowledge_page)) {
      links.push({ kind: "concept-page", label: "Shareable concept page", href: node.knowledge_page });
    }
    if (cleanText(node.release_page)) {
      links.push({ kind: "release-page", label: "Immutable release view", href: node.release_page });
    }

    const snapshot = graph.source_snapshot || {};
    const repo = cleanText(snapshot.source_repo) || "the-omega-institute/trureturing";
    const commit = cleanText(snapshot.source_commit);
    const blueprint = cleanText(node.blueprint_path);
    if (commit && blueprint) {
      links.push({
        kind: "blueprint-source",
        label: "Blueprint exposition",
        href: `https://github.com/${repo}/blob/${commit}/${blueprint}`
      });
    }

    const anchor = cleanText(node.document_anchor);
    if (anchor) links.push({ kind: "mdbook", label: "Theory document", href: anchor });
    return links;
  }

  function buildLocalGraph(index, centerId, hops) {
    const levels = new Map([[centerId, 0]]);
    let upstream = new Set([centerId]);
    let downstream = new Set([centerId]);

    for (let step = 1; step <= hops; step += 1) {
      const nextUpstream = new Set();
      for (const id of upstream) {
        for (const parent of index.parents.get(id) || []) {
          if (!levels.has(parent) || Math.abs(levels.get(parent)) > step) levels.set(parent, -step);
          nextUpstream.add(parent);
        }
      }
      upstream = nextUpstream;

      const nextDownstream = new Set();
      for (const id of downstream) {
        for (const child of index.children.get(id) || []) {
          if (!levels.has(child) || Math.abs(levels.get(child)) > step) levels.set(child, step);
          nextDownstream.add(child);
        }
      }
      downstream = nextDownstream;
    }

    const ordered = [...levels.entries()].sort((left, right) =>
      Math.abs(left[1]) - Math.abs(right[1])
      || left[1] - right[1]
      || humanTitle(index.nodeById.get(left[0])).localeCompare(humanTitle(index.nodeById.get(right[0])))
      || left[0].localeCompare(right[0]));
    const kept = new Map(ordered.slice(0, MAX_LOCAL_NODES));
    const nodes = [...kept.entries()]
      .map(([id, level]) => ({ ...index.nodeById.get(id), level }))
      .sort((left, right) =>
        left.level - right.level
        || humanTitle(left).localeCompare(humanTitle(right))
        || left.id.localeCompare(right.id));
    const edges = index.certifiedEdges.filter((edge) =>
      kept.has(edge.source) && kept.has(edge.target));

    return {
      centerId,
      hops,
      nodes,
      edges,
      truncated: levels.size > kept.size
    };
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
      values.sort((left, right) =>
        humanTitle(left).localeCompare(humanTitle(right)) || left.id.localeCompare(right.id));
      const gap = width / (values.length + 1);
      values.forEach((node, column) => {
        positions.set(node.id, { x: gap * (column + 1), y: 38 + row * rowHeight });
      });
    }

    return {
      width,
      height: Math.max(140, 76 + Math.max(0, levels.length - 1) * rowHeight),
      nodes: local.nodes.map((node) => ({
        ...node,
        ...positions.get(node.id),
        selected: node.id === local.centerId
      })),
      edges: local.edges.map((edge) => ({
        ...edge,
        x1: positions.get(edge.source).x,
        y1: positions.get(edge.source).y,
        x2: positions.get(edge.target).x,
        y2: positions.get(edge.target).y
      }))
    };
  }

  function relatedRecords(records, centerId, index) {
    return (records || [])
      .map((record) => {
        const otherId = record.source === centerId ? record.target : record.source;
        return { ...record, other: index.nodeById.get(otherId) };
      })
      .filter((record) => record.other)
      .sort((left, right) =>
        humanTitle(left.other).localeCompare(humanTitle(right.other))
        || left.other.id.localeCompare(right.other.id));
  }

  function createModel(graph, nodeId, hops, suppliedIndex) {
    const index = suppliedIndex || createIndex(graph);
    const node = index.nodeById.get(nodeId);
    if (!node) throw new TypeError(`selected node is absent from graph: ${nodeId}`);

    const parents = (index.parents.get(nodeId) || []).map((id) => index.nodeById.get(id));
    const children = (index.children.get(nodeId) || []).map((id) => index.nodeById.get(id));
    const snapshot = graph.source_snapshot || {};
    const state = String(node.state || "unknown").toLowerCase();

    return {
      node,
      title: humanTitle(node),
      status: cleanText(node.status) || humanize(node.state) || "Unknown",
      state,
      semanticKind: node.kind === "blueprint"
        ? "Theory document"
        : state === "open"
          ? "Open concept"
          : cleanText(node.human_theorem)
            ? "Theorem concept"
            : "Formal concept",
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
        gid: cleanText(node.gid),
        node_id: node.id,
        repository_path: cleanText(node.repo_path),
        truth_release_digest: cleanText(snapshot.truth_release_digest),
        source_commit: cleanText(snapshot.source_commit),
        source_tree: cleanText(snapshot.source_tree),
        certified_topology_digest: cleanText(snapshot.certified_topology_digest),
        algorithm_profile_digest: cleanText(snapshot.algorithm_profile_digest),
        topology_producer_commit: cleanText(snapshot.topology_producer_commit),
        structure_source: cleanText(node.structure_source)
      }
    };
  }

  return Object.freeze({
    MAX_LOCAL_NODES,
    buildLocalGraph,
    cleanText,
    createIndex,
    createModel,
    documentLinks,
    endpointId,
    humanTitle,
    humanize,
    isCertifiedDependency,
    localLayout,
    parseRational,
    relationClass,
    structuralFacts
  });
}));
