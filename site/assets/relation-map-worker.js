importScripts("vendor/dagre.min.js");
importScripts("vendor/d3.min.js");
self.onmessage = ({ data }) => {
  try {
    if (data.edges.some((edge) => edge.category !== "proof")) {
      const nodes = data.nodes.map((node) => ({ ...node }));
      const edges = data.edges.map((edge) => ({ ...edge }));
      const simulation = d3
        .forceSimulation(nodes)
        .force(
          "link",
          d3
            .forceLink(edges)
            .id((node) => node.id)
            .distance(225)
            .strength(0.3),
        )
        .force("charge", d3.forceManyBody().strength(-450))
        .force("collision", d3.forceCollide(112).iterations(3))
        .force("x", d3.forceX(0).strength(0.035))
        .force("y", d3.forceY(0).strength(0.05))
        .stop();
      simulation.tick(260);
      const left = Math.min(...nodes.map((node) => node.x)) - 119;
      const top = Math.min(...nodes.map((node) => node.y)) - 58;
      nodes.forEach((node) => {
        node.x -= left;
        node.y -= top;
      });
      // Clip links to label rectangles; parallel relation types take distinct curves.
      const boundary = (node, toward) => {
        const dx = toward.x - node.x,
          dy = toward.y - node.y;
        const scale = 1 / Math.max(Math.abs(dx) / 95, Math.abs(dy) / 34, 1);
        return { x: node.x + dx * scale, y: node.y + dy * scale };
      };
      const routed = edges.map((edge) => {
        const a = edge.source,
          b = edge.target;
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const bend =
          {
            proof: 0,
            affinity: 35,
            document: -30,
            advisory: 50,
            authored: -50,
          }[edge.category] || 0;
        const middle = {
          x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * bend,
          y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * bend,
        };
        return {
          ...edge,
          source: a.id,
          target: b.id,
          points: [boundary(a, middle), middle, boundary(b, middle)],
        };
      });
      self.postMessage({
        nodes,
        edges: routed,
        width: Math.max(...nodes.map((node) => node.x)) + 119,
        height: Math.max(...nodes.map((node) => node.y)) + 58,
      });
      return;
    }
    const graph = new dagre.graphlib.Graph({ multigraph: true });
    graph.setGraph({
      rankdir: "LR",
      ranksep: 65,
      nodesep: 22,
      marginx: 24,
      marginy: 24,
      ranker: "longest-path",
    });
    graph.setDefaultEdgeLabel(() => ({}));
    data.nodes.forEach((node) =>
      graph.setNode(node.id, { width: 190, height: 68 }),
    );
    data.edges.forEach((edge, index) =>
      graph.setEdge(edge.source, edge.target, {}, String(index)),
    );
    dagre.layout(graph);
    self.postMessage({
      nodes: data.nodes.map((node) => ({ ...node, ...graph.node(node.id) })),
      edges: data.edges.map((edge, index) => ({
        ...edge,
        points: graph.edge({
          v: edge.source,
          w: edge.target,
          name: String(index),
        }).points,
      })),
      width: graph.graph().width || 240,
      height: graph.graph().height || 120,
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
