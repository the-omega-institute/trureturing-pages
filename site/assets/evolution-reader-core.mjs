const FIELDS = ['human_title','human_abstract','human_theorem','source_blob','repo_path','state','status'];
function modules(snapshot) {
  const result = new Map();
  for (const n of snapshot.graph.nodes.filter(n => n.kind === 'truth')) {
    if (typeof n.id !== 'string' || result.has(n.id)) throw new Error('Invalid module identity in the Library snapshot.');
    result.set(n.id,n);
  }
  return result;
}
export function moduleTitle(n) {
  if (n.human_title && n.human_title !== n.id) return n.human_title;
  return (n.repo_path || n.id).split('/').at(-1).replace(/\.lean$/, '').replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
}
export function describeChange(fields) {
  const parts = [];
  if (fields.includes('source_blob')) parts.push('Source code updated');
  if (fields.some(x => ['human_title','human_abstract','human_theorem'].includes(x))) parts.push('Explanation or statement display updated');
  if (fields.some(x => ['state','status'].includes(x))) parts.push('Recorded module state changed');
  if (fields.includes('repo_path')) parts.push('Source path changed');
  return parts.join('. ') || 'Archived record updated';
}
export function compareContent(before, after) {
  const current = modules(after), previous = before ? modules(before) : new Map();
  const row = (n, snapshot, event, fields=[]) => ({...n, title:moduleTitle(n), event, fields,
    release:snapshot.truth_release_digest, source_commit:snapshot.graph.source_snapshot.source_commit});
  if (!before) return {baseline:true, total:current.size, added:[],changed:[],removed:[],outcomes:[],
    existing:[...current.values()].map(n=>row(n,after,'Starting snapshot'))};
  const result = {baseline:false,total:current.size,added:[],changed:[],removed:[],outcomes:[],existing:[]};
  for (const [id,n] of current) {
    const old = previous.get(id);
    if (!old) result.added.push(row(n,after,'Added to the released Library'));
    else {
      const fields = FIELDS.filter(key => JSON.stringify(n[key] ?? null) !== JSON.stringify(old[key] ?? null));
      if (fields.length || old.content_digest !== n.content_digest)
        result.changed.push(row(n,after,describeChange(fields),fields));
    }
  }
  for (const [id,n] of previous) if (!current.has(id)) result.removed.push(row(n,before,'Absent from the later snapshot'));
  const oldTargets = new Map((before.problems || []).map(p=>[p.slug,p]));
  for (const p of after.problems || []) {
    if (p.resolution && JSON.stringify(oldTargets.get(p.slug)?.resolution || null) !== JSON.stringify(p.resolution))
      result.outcomes.push({id:p.slug,title:p.title,event:`Resolution record: ${p.resolution.kind}`,
        source_commit:after.graph.source_snapshot.source_commit, resolution:p.resolution,
        release:after.truth_release_digest, source_path:`Problems/${p.slug}.md`, target:true});
  }
  if (before.truth_release_digest === after.truth_release_digest &&
      ['added','changed','removed','outcomes'].some(k=>result[k].length))
    throw new Error('One immutable release has conflicting content.');
  for (const key of ['added','changed','removed','outcomes']) result[key].sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  return result;
}
