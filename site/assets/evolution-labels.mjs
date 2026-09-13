// Display-only annotations. Source identities, topology, positions and colors stay intact.
export function readableName(value) {
  return String(value || 'Unclassified').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
}
export function groupHint(group) {
  const examples = [...group.nodes].sort((a,b) => b.reach-a.reach || a.id.localeCompare(b.id))
    .slice(0,2).map(n => n.title);
  const where = Number.isInteger(group.observation) ? `Release observation ${group.observation+1}` : `Dependency depth ${group.depth}`;
  return `${readableName(group.domain)}: ${group.nodes.length} modules. ${where}. Examples: ${examples.join('; ')}.`;
}
export function annotateScene(scene, delta, observation) {
  const added = new Set(delta?.kind === 'comparable' ? delta.added : []);
  return {...scene, addedEdges:addedEdgeKeys(delta), selectedObservation:observation, nodes:scene.nodes.map(group => ({...group,
    // Keep the actual source label; a tooltip identifies its role as a grouping.
    title:group.nodes.length === 1 ? group.nodes[0].title : readableName(group.domain),
    hint:groupHint(group),
    addedCount:(scene.kind === 'dependency' || group.observation === observation)
      ? group.nodes.filter(n => added.has(n.id)).length : 0,
  }))};
}
export function statusCaption(value, displayedRelease, now = Date.now()) {
  if (value.observation.state === 'unavailable') return 'Publication status unavailable';
  if (displayedRelease && value.head.current_truth_release_digest !== displayedRelease)
    return 'Status refers to another release';
  if (value.observation.state === 'last-good' || !value.observed_at || now-Date.parse(value.observed_at)>7200000)
    return 'Last recorded publication status';
  if (value.halt || value.head.behind > 0 || value.counts?.pending > 0 || value.counts?.blocked > 0) return 'Publication needs attention';
  if (value.head.behind !== 0 || !value.head.upstream_latest_digest || !value.head.current_truth_release_digest)
    return 'Publication progress unknown';
  if (value.head.upstream_latest_digest !== value.head.current_truth_release_digest) return 'Publication needs attention';
  return 'Publication synchronized';
}

// Direct boundary edges describe reuse; they do not infer a theorem or a field's meaning.
export function groupContext(group, snapshot) {
  const members = new Set(group.nodes.map(n => n.id));
  const nodes = new Map(snapshot.nodes.map(n => [n.id,n]));
  const incoming = new Map(), outgoing = new Map(), seen = new Set();
  for (const [a,b] of snapshot.dependency_edges || []) {
    const pair = JSON.stringify([a,b]);
    if (seen.has(pair) || !nodes.has(a) || !nodes.has(b)) continue;
    seen.add(pair);
    const external = !members.has(a) && members.has(b) ? [incoming,nodes.get(a)] :
      members.has(a) && !members.has(b) ? [outgoing,nodes.get(b)] : null;
    if (external) {
      const [map,n] = external;
      if (!map.has(n.domain)) map.set(n.domain,{domain:n.domain,ids:new Set()});
      map.get(n.domain).ids.add(n.id);
    }
  }
  const rows = map => [...map.values()].map(n=>({domain:n.domain,ids:[...n.ids].sort()}))
    .sort((a,b)=>b.ids.length-a.ids.length || a.domain.localeCompare(b.domain));
  return {examples:[...group.nodes].sort((a,b)=>b.reach-a.reach || a.id.localeCompare(b.id)).slice(0,3),
    incoming:rows(incoming),outgoing:rows(outgoing),edgesKnown:Array.isArray(snapshot.dependency_edges)};
}
export function addedEdgeKeys(delta) {
  return new Set(delta?.kind === 'comparable' ? (delta.edgesAdded || []).map(e=>JSON.stringify(e)) : []);
}
