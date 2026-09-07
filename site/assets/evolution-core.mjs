import { comparisonKey } from "./architecture-core.mjs";
import { FAMILIES, familyFor } from "./atlas-public-core.mjs";

export function releaseDelta(previous, current) {
  if (!previous)
    return {
      kind: "baseline",
      added: [],
      retired: [],
      edgesAdded: [],
      edgesRemoved: [],
    };
  if (comparisonKey(previous) !== comparisonKey(current))
    return {
      kind: "analysis-changed",
      added: [],
      retired: [],
      edgesAdded: [],
      edgesRemoved: [],
    };
  const before = new Set(previous.nodes.map((n) => n.id)),
    after = new Set(current.nodes.map((n) => n.id));
  const oldEdges = new Set(
      (previous.dependency_edges || []).map((e) => JSON.stringify(e)),
    ),
    newEdges = new Set(
      (current.dependency_edges || []).map((e) => JSON.stringify(e)),
    );
  const edgesKnown =
    Array.isArray(previous.dependency_edges) &&
    Array.isArray(current.dependency_edges);
  return {
    kind: "comparable",
    added: [...after].filter((id) => !before.has(id)),
    retired: [...before].filter((id) => !after.has(id)),
    edgesAdded: edgesKnown
      ? [...newEdges].filter((e) => !oldEdges.has(e)).map((e) => JSON.parse(e))
      : null,
    edgesRemoved: edgesKnown
      ? [...oldEdges].filter((e) => !newEdges.has(e)).map((e) => JSON.parse(e))
      : null,
  };
}

export function dependencyScene(
  snapshot,
  expandedDomain = null,
  universe = snapshot.nodes,
) {
  const groups = new Map(),
    membership = new Map(),
    domainRows = new Map();
  for (const family of FAMILIES)
    domainRows.set(
      family.id,
      [
        ...new Set(
          universe
            .filter((n) => familyFor(n).id === family.id)
            .map((n) => n.domain),
        ),
      ].sort(),
    );
  const slots = new Map();
  for (const node of universe)
    if (node.domain === expandedDomain) {
      if (!slots.has(node.depth)) slots.set(node.depth, new Set());
      slots.get(node.depth).add(node.id);
    }
  const expandedRows = new Map(
    [...slots].map(([depth, ids]) => [depth, [...ids].sort()]),
  );
  for (const node of snapshot.nodes) {
    const family = familyFor(node),
      expanded = node.domain === expandedDomain;
    const key = expanded ? node.id : JSON.stringify([node.domain, node.depth]);
    if (!groups.has(key)) {
      const row = domainRows.get(family.id).indexOf(node.domain),
        lane = FAMILIES.indexOf(family);
      groups.set(key, {
        id: key,
        title: expanded ? node.title : node.domain,
        domain: node.domain,
        depth: node.depth,
        color: family.color,
        family: family.id,
        nodes: [],
        x: 90 + Math.log2(1 + node.depth) * 280,
        y:
          80 +
          lane * 145 +
          row * 13 +
          (expanded
            ? (expandedRows.get(node.depth).indexOf(node.id) -
                (expandedRows.get(node.depth).length - 1) / 2) *
              18
            : 0),
      });
    }
    groups.get(key).nodes.push(node);
    membership.set(node.id, key);
  }
  const edges = new Map();
  for (const [a, b] of snapshot.dependency_edges || []) {
    const source = membership.get(a),
      target = membership.get(b);
    if (!source || !target || source === target) continue;
    const key = JSON.stringify([source, target]);
    if (!edges.has(key))
      edges.set(key, {
        source,
        target,
        count: 0,
        kind: "dependency",
        pairs: [],
      });
    edges.get(key).count++;
    edges.get(key).pairs.push([a, b]);
  }
  return {
    nodes: [...groups.values()],
    edges: [...edges.values()],
    membership,
    lanes: FAMILIES.map((f, i) => ({
      name: f.name,
      color: f.color,
      y: 80 + i * 145,
    })),
    axis: "Dependency depth",
    kind: "dependency",
  };
}

export function timeScene(snapshots) {
  const domains = [
    ...new Set(snapshots.flatMap((s) => s.nodes.map((n) => n.domain))),
  ].sort(
    (a, b) =>
      FAMILIES.indexOf(familyFor({ domain: a })) -
        FAMILIES.indexOf(familyFor({ domain: b })) || a.localeCompare(b),
  );
  const nodes = [],
    edges = [],
    membership = new Map();
  snapshots.forEach((snapshot, i) => {
    const groups = new Map();
    for (const node of snapshot.nodes) {
      const key = JSON.stringify([i, node.domain]);
      if (!groups.has(key))
        groups.set(key, {
          id: key,
          title: node.domain,
          domain: node.domain,
          color: familyFor(node).color,
          nodes: [],
          x: 120 + i * 260,
          y: 50 + domains.indexOf(node.domain) * 30,
          observation: i,
        });
      groups.get(key).nodes.push(node);
      membership.set(`${i}\0${node.id}`, key);
    }
    nodes.push(...groups.values());
    if (!i || comparisonKey(snapshot) !== comparisonKey(snapshots[i - 1]))
      return;
    const flows = new Map();
    for (const node of snapshot.nodes) {
      const source = membership.get(`${i - 1}\0${node.id}`),
        target = membership.get(`${i}\0${node.id}`);
      if (!source) continue;
      const key = JSON.stringify([source, target]);
      if (!flows.has(key))
        flows.set(key, {
          source,
          target,
          count: 0,
          kind: "continuity",
          pairs: [],
        });
      flows.get(key).count++;
    }
    edges.push(...flows.values());
    if (
      Array.isArray(snapshots[i - 1].dependency_edges) &&
      Array.isArray(snapshot.dependency_edges)
    ) {
      const previousEdges = new Set(
        snapshots[i - 1].dependency_edges.map((e) => JSON.stringify(e)),
      );
      const introductions = new Map();
      for (const [a, b] of snapshot.dependency_edges) {
        if (previousEdges.has(JSON.stringify([a, b]))) continue;
        const source = membership.get(`${i - 1}\0${a}`),
          target = membership.get(`${i}\0${b}`);
        if (!source || !target) continue;
        const key = JSON.stringify([source, target]);
        if (!introductions.has(key))
          introductions.set(key, {
            source,
            target,
            count: 0,
            kind: "new-dependency",
            pairs: [],
          });
        introductions.get(key).count++;
        introductions.get(key).pairs.push([a, b]);
      }
      edges.push(...introductions.values());
    }
  });
  return {
    nodes,
    edges,
    membership,
    lanes: [],
    axis: "Release observation",
    kind: "time",
  };
}

export function lineageIds(snapshot, selected) {
  const result = new Set(selected ? [selected] : []),
    parents = new Map(),
    children = new Map();
  for (const [a, b] of snapshot.dependency_edges || []) {
    if (!parents.has(b)) parents.set(b, []);
    if (!children.has(a)) children.set(a, []);
    parents.get(b).push(a);
    children.get(a).push(b);
  }
  for (const map of [parents, children]) {
    const queue = selected ? [selected] : [],
      visited = new Set(queue);
    for (let i = 0; i < queue.length; i++)
      for (const id of map.get(queue[i]) || [])
        if (!visited.has(id)) {
          visited.add(id);
          result.add(id);
          queue.push(id);
        }
  }
  return result;
}
