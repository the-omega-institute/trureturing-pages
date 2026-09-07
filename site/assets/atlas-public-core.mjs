import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  forceZ,
} from "./vendor/d3-force-3d.mjs";
import "./graph-relations.js";
import { analyzeArchitecture } from "./architecture-core.mjs";
import { researchScope } from "./atlas-research-core.mjs";
import { structuralScaffold } from "./atlas-visual-core.mjs";
const Relations = globalThis.TrureturingRelations;

// Editorial navigation only. Upstream topology and proof authority remain intact.
export const FAMILIES = [
  {
    id: "concepts",
    name: "Knowledge & logic",
    color: "#6ad7c8",
    domains: [
      "ConceptDynamics",
      "Naming",
      "Computability",
      "Automata",
      "Rewriting",
    ],
    position: [-360, 190, 45],
  },
  {
    id: "observers",
    name: "Observation & memory",
    color: "#a3b7fa",
    domains: [
      "Observer",
      "ObserverMemory",
      "Observation",
      "ContinuousObservables",
      "PrimeObserver",
    ],
    position: [100, 245, -70],
  },
  {
    id: "numbers",
    name: "Numbers & arithmetic",
    color: "#edc66d",
    domains: [
      "Weil",
      "Arith",
      "ArithUnits",
      "PrimeForms",
      "Factorization",
      "Digit",
    ],
    position: [490, 90, 20],
  },
  {
    id: "analysis",
    name: "Analysis & infinity",
    color: "#ef9285",
    domains: [
      "Analytic",
      "Zeros",
      "Asymptotics",
      "AnalyticClosure",
      "Fourier",
      "Midline",
    ],
    position: [410, -270, 60],
  },
  {
    id: "quantum",
    name: "Quantum structures",
    color: "#7fbcea",
    domains: [
      "Quantum",
      "QuantumBounds",
      "QuantumChannels",
      "QuantumStates",
      "QuantumContext",
    ],
    position: [20, -260, -40],
  },
  {
    id: "information",
    name: "Information & uncertainty",
    color: "#c4dc85",
    domains: [
      "Entropy",
      "Estimation",
      "Deficit",
      "TotalVariation",
      "Divergence",
      "DivergenceSupport",
      "RenyiDivergence",
      "Resource",
      "ResourceOrder",
    ],
    position: [-400, -190, 80],
  },
  {
    id: "dynamics",
    name: "Dynamics & recurrence",
    color: "#d99aca",
    domains: [
      "Tower",
      "Dynamics",
      "Recurrence",
      "FixedPoints",
      "CompletionDynamics",
      "Solenoid",
      "Phase",
      "History",
    ],
    position: [-710, 40, -30],
  },
  {
    id: "foundations",
    name: "Foundations & structure",
    color: "#c2ccd3",
    domains: [],
    position: [740, -165, -60],
  },
];

export function hash(value) {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export const endpoint = (value) =>
  typeof value === "object" ? value.id : value;
export const title = (node) =>
  node.human_title && node.human_title !== "None"
    ? node.human_title
    : (node.repo_path || node.id)
        .split("/")
        .pop()
        .replace(/\.lean$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2");
export const isOpen = (node) =>
  String(node.state || node.status).toLowerCase() === "open";
export function familyFor(node) {
  return (
    FAMILIES.find((f) => f.domains.includes(node.domain)) || FAMILIES.at(-1)
  );
}
export function createPublicModel(graph) {
  const allNodes = graph.nodes
    .map((n) => ({ ...n, family: familyFor(n).id }))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  const nodes = allNodes.filter((n) => n.kind === "truth");
  const relationships = Relations.createIndex({
    nodes: allNodes,
    edges: graph.edges,
  });
  const { byId, parents, children } = relationships;
  const edges = relationships.edges.filter(
    (e) =>
      e.category === "proof" &&
      byId.get(e.source).kind === "truth" &&
      byId.get(e.target).kind === "truth",
  );
  const families = FAMILIES.map((f) => ({
    ...f,
    nodes: nodes.filter((n) => n.family === f.id),
  })).filter((f) => f.nodes.length);
  return {
    nodes,
    allNodes,
    byId,
    edges,
    parents,
    children,
    families,
    relationships,
  };
}

export function neighborhood(model, id) {
  return new Set([
    id,
    ...(model.parents.get(id) || []),
    ...(model.children.get(id) || []),
  ]);
}

export function viewFor(
  model,
  {
    mode = "structure",
    family = null,
    selected = null,
    depth = "all",
    types = Relations.TYPES,
    context = true,
    research = null,
    problem = null,
  } = {},
) {
  let nodes = model.nodes;
  if (mode === "frontier") {
    const ids = researchScope(model, research, problem);
    nodes = nodes.filter((n) => ids.has(n.id));
  }
  if (family) nodes = nodes.filter((n) => n.family === family);
  let related = null;
  if (selected && model.byId.has(selected)) {
    related = Relations.related(model.relationships, selected, {
      depth,
      types,
    });
    const retained = new Set(context ? nodes.map((n) => n.id) : []);
    related.ids.forEach((id) => retained.add(id));
    nodes = model.allNodes.filter((n) => retained.has(n.id));
  }
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: related
      ? model.relationships.edges.filter(
          (e) =>
            ids.has(e.source) &&
            ids.has(e.target) &&
            (related.edgeIds.has(e.relationId) ||
              (context && e.category === "proof")),
        )
      : model.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    related,
  };
}

export function searchNodes(model, query, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return model.nodes
    .map((node) => {
      const name = title(node).toLowerCase();
      const score =
        node.id.toLowerCase() === q
          ? 0
          : name === q
            ? 1
            : name.startsWith(q)
              ? 2
              : name.includes(q)
                ? 3
                : `${node.domain} ${node.id} ${node.human_abstract || ""}`
                      .toLowerCase()
                      .includes(q)
                  ? 4
                  : 9;
      return { node, score };
    })
    .filter((r) => r.score < 9)
    .sort(
      (a, b) => a.score - b.score || title(a.node).localeCompare(title(b.node)),
    )
    .slice(0, limit)
    .map((r) => r.node);
}

export function computeLayout(model, progress = () => {}) {
  const positions = {};
  const architecture = analyzeArchitecture({
    nodes: model.nodes,
    edges: model.edges,
  });
  const scaffold = structuralScaffold(model, architecture);
  for (const [familyIndex, family] of model.families.entries()) {
    const members = family.nodes.map((n) => ({
      id: n.id,
      domain: n.domain,
      topic: `${n.domain}/${n.id.split("/").length > 4 ? n.id.split("/")[3] : ""}`,
    }));
    const topics = [...new Set(members.map((n) => n.topic))].sort();
    const radius = 48 + Math.sqrt(members.length) * 4.7;
    const anchors = new Map(
      topics.map((topic, i) => {
        const angle = i * 2.39996323;
        const r = radius * 0.73 * Math.sqrt((i + 0.5) / topics.length);
        return [
          topic,
          {
            x: Math.cos(angle) * r,
            y: Math.sin(angle) * r * 0.82,
            z: Math.sin(i * 1.73) * radius * 0.62,
          },
        ];
      }),
    );
    const topicDepths = new Map(
      topics.map((topic) => {
        const values = members
          .filter((n) => n.topic === topic)
          .map((n) => scaffold.depth.get(n.id));
        return [topic, [Math.min(...values), Math.max(...values)]];
      }),
    );
    members.forEach((n) => {
      const a = anchors.get(n.topic);
      const seed = hash(n.id);
      const [low, high] = topicDepths.get(n.topic);
      const rank =
        high > low
          ? Math.log1p(scaffold.depth.get(n.id) - low) / Math.log1p(high - low)
          : 0.5;
      const importance = Math.min(1, scaffold.score(n.id) / 14);
      const extension = 0.65 + rank * 0.65 - importance * 0.18;
      const fold = Math.sin(rank * Math.PI * 1.5) * radius * 0.16;
      n.target = {
        x: a.x * extension - (a.y / radius) * fold,
        y: a.y * extension + (rank - 0.5) * 48,
        z: a.z * extension + fold,
      };
      n.x = n.target.x + ((seed % 101) - 50) * 0.18;
      n.y = n.target.y + (((seed >>> 8) % 101) - 50) * 0.18;
      n.z = n.target.z + (((seed >>> 16) % 101) - 50) * 0.18;
    });
    const ids = new Set(members.map((n) => n.id));
    const links = model.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        spine: scaffold.spine.has(e.relationId),
      }));
    const simulation = forceSimulation(members, 3)
      .stop()
      .force(
        "link",
        forceLink(links)
          .id((n) => n.id)
          .distance((e) => (e.spine ? 10 : 16))
          .strength((e) => (e.spine ? 0.9 : 0.45)),
      )
      .force("charge", forceManyBody().strength(-9).distanceMax(75))
      .force("collision", forceCollide(3.1).iterations(2))
      .force("x", forceX((n) => n.target.x).strength(0.18))
      .force("y", forceY((n) => n.target.y).strength(0.2))
      .force("z", forceZ((n) => n.target.z).strength(0.18));
    simulation.tick(150);
    const center = family.position;
    members.forEach((n) => {
      positions[n.id] = {
        x: n.x + center[0],
        y: n.y + center[1],
        z: n.z + center[2],
      };
    });
    progress((familyIndex + 1) / model.families.length);
  }
  for (const node of model.allNodes) {
    if (positions[node.id]) continue;
    const anchors = (model.relationships.incident.get(node.id) || [])
      .filter((e) => e.category === "document")
      .map((e) => positions[e.source === node.id ? e.target : e.source])
      .filter(Boolean);
    const base = anchors.length
      ? anchors.reduce(
          (sum, p) => ({
            x: sum.x + p.x / anchors.length,
            y: sum.y + p.y / anchors.length,
            z: sum.z + p.z / anchors.length,
          }),
          { x: 0, y: 0, z: 0 },
        )
      : { x: 740, y: -165, z: -60 };
    const angle = hash(node.id) * 0.01;
    positions[node.id] = {
      x: base.x + Math.cos(angle) * 30,
      y: base.y + Math.sin(angle) * 30,
      z: base.z + 24,
    };
  }
  return positions;
}

export function architectureLayout(
  model,
  positions,
  architecture = analyzeArchitecture({
    nodes: model.nodes,
    edges: model.edges,
  }),
) {
  const result = {};
  for (const node of model.nodes) {
    const p = positions[node.id],
      family = familyFor(node);
    result[node.id] = {
      x: p.x,
      y: 420 - architecture.metrics.get(node.id).depth * 24,
      z: (p.y - family.position[1]) * 1.8 + p.z * 0.3,
    };
  }
  for (const node of model.allNodes) {
    if (result[node.id]) continue;
    const anchors = (model.relationships.incident.get(node.id) || [])
      .map((e) => result[e.source === node.id ? e.target : e.source])
      .filter(Boolean);
    result[node.id] = anchors.length
      ? {
          x: anchors.reduce((s, p) => s + p.x, 0) / anchors.length + 20,
          y: anchors.reduce((s, p) => s + p.y, 0) / anchors.length,
          z: anchors.reduce((s, p) => s + p.z, 0) / anchors.length + 30,
        }
      : { ...positions[node.id] };
  }
  return result;
}

export async function verifyGraph(graphText, manifest, digest) {
  if (manifest.schema_version !== "pages-atlas-manifest.v1")
    throw new Error("Unsupported Atlas manifest.");
  if ((await digest(graphText)) !== manifest.atlas_graph_digest)
    throw new Error("Graph digest does not match the published manifest.");
  const graph = JSON.parse(graphText);
  if (
    graph.source_snapshot?.truth_release_digest !==
    manifest.truth_release_digest
  )
    throw new Error("Graph and manifest refer to different releases.");
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
    throw new Error("Published graph is incomplete.");
  const ids = new Set();
  for (const n of graph.nodes) {
    if (typeof n.id !== "string" || ids.has(n.id))
      throw new Error("Invalid or duplicate concept identity.");
    ids.add(n.id);
  }
  if (
    graph.edges.some(
      (e) => !ids.has(endpoint(e.source)) || !ids.has(endpoint(e.target)),
    )
  )
    throw new Error("A published relation references a missing concept.");
  return graph;
}
