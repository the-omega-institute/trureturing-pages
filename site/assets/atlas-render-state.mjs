// The renderer mutates its own nodes/links. Reuse those objects between views
// without writing positions or Three.js bindings into the verified source model.
export function reconcileRenderGraph(previous, view, positions) {
  const priorNodes = previous?.nodes || [], priorLinks = previous?.links || [];
  const same = priorNodes.length === view.nodes.length && priorLinks.length === view.edges.length &&
    view.nodes.every((node, index) => priorNodes[index].id === node.id) &&
    view.edges.every((edge, index) => priorLinks[index].relationId === edge.relationId);
  const byId = new Map(priorNodes.map(node => [node.id, node]));
  const byRelation = new Map(priorLinks.map(edge => [edge.relationId, edge]));
  let moved = false;
  const nodes = view.nodes.map(node => {
    const rendered = byId.get(node.id) || { ...node };
    const point = positions[node.id];
    for (const axis of ["x", "y", "z"]) {
      if (rendered[axis] !== point[axis]) moved = true;
      rendered[axis] = rendered[`f${axis}`] = point[axis];
    }
    return rendered;
  });
  const links = view.edges.map(edge => byRelation.get(edge.relationId) || { ...edge });
  return { data: same ? previous : { nodes, links }, topologyChanged: !same, positionsChanged: moved };
}
