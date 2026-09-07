export const METRICS = Object.freeze({
  reach: "Downstream support",
  direct: "Direct reuse",
  coverage: "Domain coverage",
});
export const PROFILE = "module-architecture-v1";
export const SNAPSHOT_SCHEMA = "pages-architecture-snapshot.v1";
export const HISTORY_SCHEMA = "pages-architecture-history.v1";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const endpoint = (value) => (typeof value === "object" ? value.id : value);

// Reuse the published Topology counters; domain distributions are a Pages summary.
export function analyzeArchitecture(graph) {
  const nodes = graph.nodes
    .filter((n) => n.kind === "truth")
    .slice()
    .sort((a, b) => compare(a.id, b.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map(nodes.map((n) => [n.id, new Set()]));
  const parents = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const edge of graph.edges) {
    if (
      ![
        "truth-dependency",
        "module-import",
        "frozen-prerequisite",
        "dependency",
      ].includes(edge.layer || "dependency")
    )
      continue;
    if (["advisory", "proposed"].includes(edge.status)) continue;
    const a = endpoint(edge.source),
      b = endpoint(edge.target);
    if (byId.has(a) && byId.has(b)) {
      children.get(a).add(b);
      parents.get(b).add(a);
    }
  }
  const pending = new Map(nodes.map((n) => [n.id, parents.get(n.id).size]));
  const order = nodes.filter((n) => pending.get(n.id) === 0).map((n) => n.id);
  const depths = new Map(nodes.map((n) => [n.id, 0]));
  for (let i = 0; i < order.length; i++)
    for (const child of children.get(order[i])) {
      depths.set(child, Math.max(depths.get(child), depths.get(order[i]) + 1));
      pending.set(child, pending.get(child) - 1);
      if (pending.get(child) === 0) order.push(child);
    }
  if (order.length !== nodes.length)
    throw new Error("Architecture requires an acyclic dependency graph.");
  const descendants = new Map();
  for (const id of order.slice().reverse()) {
    const set = new Set();
    for (const child of children.get(id)) {
      set.add(child);
      for (const next of descendants.get(child)) set.add(next);
    }
    descendants.set(id, set);
  }
  const metrics = new Map();
  for (const node of nodes) {
    const reach = descendants.get(node.id).size,
      direct = children.get(node.id).size,
      depth = depths.get(node.id);
    for (const [field, expected] of [
      ["descendant_count", reach],
      ["out_degree", direct],
      ["true_depth", depth],
    ]) {
      if (node[field] !== undefined && node[field] !== expected)
        throw new Error(
          `Published Topology ${field} disagrees with dependency graph: ${node.id}`,
        );
    }
    const distribution = new Map();
    for (const id of descendants.get(node.id)) {
      const domain = byId.get(id).domain || "Unclassified";
      distribution.set(domain, (distribution.get(domain) || 0) + 1);
    }
    const domains = [...distribution].sort(
      (a, b) => b[1] - a[1] || compare(a[0], b[0]),
    );
    metrics.set(node.id, {
      direct,
      reach,
      depth,
      coverage: domains.length,
      domains,
      share: nodes.length > 1 ? reach / (nodes.length - 1) : 0,
    });
  }
  return {
    metrics,
    descendants,
    children,
    parents,
    nodeCount: nodes.length,
    domainCount: new Set(nodes.map((n) => n.domain || "Unclassified")).size,
  };
}

export function rankedNodes(nodes, architecture, metric = "reach") {
  if (!Object.hasOwn(METRICS, metric))
    throw new Error("Unknown architecture metric.");
  return nodes
    .filter((n) => architecture.metrics.has(n.id))
    .slice()
    .sort(
      (a, b) =>
        architecture.metrics.get(b.id)[metric] -
          architecture.metrics.get(a.id)[metric] || compare(a.id, b.id),
    );
}

export function snapshotFromGraph(graph, graphDigest) {
  if (
    !DIGEST.test(graphDigest) ||
    !DIGEST.test(graph.source_snapshot?.truth_release_digest)
  )
    throw new Error(
      "Architecture snapshot requires exact release and graph digests.",
    );
  const architecture = analyzeArchitecture(graph);
  const source = graph.source_snapshot;
  return {
    schema_version: SNAPSHOT_SCHEMA,
    profile: PROFILE,
    granularity: "module-import",
    truth_release_digest: source.truth_release_digest,
    atlas_graph_digest: graphDigest,
    source_commit: source.source_commit || null,
    topology_algorithm: source.topology_algorithm || null,
    algorithm_profile_digest: source.algorithm_profile_digest || null,
    topology_atlas_profile_digest: source.topology_atlas_profile_digest || null,
    domain_count: architecture.domainCount,
    dependency_edges: [...architecture.children].flatMap(([id, children]) =>
      [...children].sort(compare).map((child) => [id, child]),
    ),
    nodes: graph.nodes
      .filter((n) => n.kind === "truth")
      .slice()
      .sort((a, b) => compare(a.id, b.id))
      .map((n) => ({
        id: n.id,
        title: n.human_title || n.title || n.id,
        domain: n.domain || "Unclassified",
        status: n.status || n.state || "Unspecified",
        role: n.structural_role || null,
        ...architecture.metrics.get(n.id),
      })),
  };
}

export function validateSnapshot(snapshot) {
  if (
    snapshot.schema_version !== SNAPSHOT_SCHEMA ||
    snapshot.profile !== PROFILE ||
    snapshot.granularity !== "module-import" ||
    !DIGEST.test(snapshot.truth_release_digest) ||
    !DIGEST.test(snapshot.atlas_graph_digest) ||
    !Array.isArray(snapshot.nodes)
  )
    throw new Error("Invalid architecture snapshot.");
  const ids = new Set();
  for (const node of snapshot.nodes) {
    if (
      typeof node.id !== "string" ||
      !node.id ||
      ids.has(node.id) ||
      typeof node.title !== "string" ||
      typeof node.domain !== "string"
    )
      throw new Error("Invalid architecture node identity.");
    ids.add(node.id);
    for (const key of ["direct", "reach", "coverage", "depth"])
      if (!Number.isSafeInteger(node[key]) || node[key] < 0)
        throw new Error("Invalid architecture metric.");
    if (
      node.direct > node.reach ||
      node.reach >= snapshot.nodes.length ||
      !Number.isFinite(node.share) ||
      Math.abs(
        node.share -
          (snapshot.nodes.length > 1
            ? node.reach / (snapshot.nodes.length - 1)
            : 0),
      ) > 1e-12
    )
      throw new Error("Inconsistent architecture reach.");
    if (
      !Array.isArray(node.domains) ||
      node.domains.length !== node.coverage ||
      new Set(node.domains.map((d) => d[0])).size !== node.domains.length ||
      node.domains.some(
        (d) =>
          typeof d[0] !== "string" || !Number.isSafeInteger(d[1]) || d[1] <= 0,
      ) ||
      node.domains.reduce((sum, d) => sum + d[1], 0) !== node.reach
    )
      throw new Error("Inconsistent domain distribution.");
  }
  if (
    snapshot.domain_count !== new Set(snapshot.nodes.map((n) => n.domain)).size
  )
    throw new Error("Inconsistent domain count.");
  if (snapshot.dependency_edges !== undefined) {
    if (!Array.isArray(snapshot.dependency_edges))
      throw new Error("Invalid archived dependencies.");
    const pairs = new Set();
    for (const edge of snapshot.dependency_edges) {
      if (
        !Array.isArray(edge) ||
        edge.length !== 2 ||
        !ids.has(edge[0]) ||
        !ids.has(edge[1]) ||
        edge[0] === edge[1] ||
        pairs.has(JSON.stringify(edge))
      )
        throw new Error("Invalid archived dependency endpoint.");
      pairs.add(JSON.stringify(edge));
    }
    const checked = analyzeArchitecture({
      nodes: snapshot.nodes.map((n) => ({ ...n, kind: "truth" })),
      edges: snapshot.dependency_edges.map(([source, target]) => ({
        source,
        target,
        layer: "truth-dependency",
      })),
    });
    for (const node of snapshot.nodes)
      for (const key of ["direct", "reach", "coverage", "depth"])
        if (checked.metrics.get(node.id)[key] !== node[key])
          throw new Error("Archived dependencies disagree with metrics.");
  }
  return snapshot;
}

export function validateHistory(index, currentRelease) {
  if (
    index.schema_version !== HISTORY_SCHEMA ||
    !Array.isArray(index.entries) ||
    !index.entries.length ||
    !DIGEST.test(index.current_truth_release_digest) ||
    (currentRelease && index.current_truth_release_digest !== currentRelease)
  )
    throw new Error("Architecture history does not bind this release.");
  const seen = new Set();
  for (const entry of index.entries) {
    if (
      !DIGEST.test(entry.digest) ||
      !DIGEST.test(entry.truth_release_digest) ||
      !DIGEST.test(entry.atlas_graph_digest) ||
      entry.path !== `data/architecture/${entry.digest.slice(7)}.json` ||
      seen.has(entry.digest)
    )
      throw new Error("Invalid architecture history entry.");
    seen.add(entry.digest);
  }
  if (
    index.entries.at(-1).truth_release_digest !==
    index.current_truth_release_digest
  )
    throw new Error("Architecture history must end at the current release.");
  return index;
}

export function comparisonKey(snapshot) {
  return JSON.stringify([
    snapshot.profile,
    snapshot.granularity,
    snapshot.topology_algorithm,
    snapshot.algorithm_profile_digest,
    snapshot.topology_atlas_profile_digest,
  ]);
}

export function trajectory(snapshots, id) {
  return snapshots.map((snapshot, index) => {
    const node = snapshot.nodes.find((n) => n.id === id) || null;
    const previous = index
      ? snapshots[index - 1].nodes.find((n) => n.id === id)
      : null;
    const comparable = Boolean(
      index && comparisonKey(snapshot) === comparisonKey(snapshots[index - 1]),
    );
    return {
      index,
      release: snapshot.truth_release_digest,
      graph: snapshot.atlas_graph_digest,
      node,
      comparable,
      event: !index
        ? node
          ? "Baseline"
          : "Absent"
        : !comparable
          ? "Analysis changed"
          : node && !previous
            ? "Appeared"
            : !node && previous
              ? "Retired"
              : !node
                ? "Absent"
                : "Retained",
      reachDelta:
        comparable && node && previous ? node.reach - previous.reach : null,
      shareDelta:
        comparable && node && previous ? node.share - previous.share : null,
    };
  });
}

export async function sha256(text) {
  return (
    "sha256:" +
    [
      ...new Uint8Array(
        await globalThis.crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(text),
        ),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export async function loadHistory(base, currentRelease, currentGraphDigest) {
  const response = await fetch(
    new URL("data/architecture-history.v1.json", base),
    { cache: "no-store" },
  );
  if (response.status === 404) return [];
  if (!response.ok)
    throw new Error(`Architecture history HTTP ${response.status}`);
  const index = validateHistory(await response.json(), currentRelease);
  if (
    currentGraphDigest &&
    index.entries.at(-1).atlas_graph_digest !== currentGraphDigest
  )
    throw new Error("Architecture history uses a different Atlas graph.");
  const snapshots = [];
  for (const entry of index.entries) {
    const file = await fetch(new URL(entry.path, base));
    if (!file.ok) throw new Error(`Architecture snapshot HTTP ${file.status}`);
    const text = await file.text();
    if ((await sha256(text)) !== entry.digest)
      throw new Error("Architecture snapshot digest mismatch.");
    const snapshot = validateSnapshot(JSON.parse(text));
    if (
      snapshot.truth_release_digest !== entry.truth_release_digest ||
      snapshot.atlas_graph_digest !== entry.atlas_graph_digest
    )
      throw new Error("Architecture snapshot release mismatch.");
    snapshots.push(snapshot);
  }
  return snapshots;
}
