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
  return {...scene, nodes:scene.nodes.map(group => ({...group,
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
  if (value.halt || value.head.behind) return 'Publication needs attention';
  return 'Publication synchronized';
}
