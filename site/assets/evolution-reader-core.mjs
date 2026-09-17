export function outcomeSourceURL(record) {
  if (!/^[a-f0-9]{40}$/.test(record.source_commit) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) throw new Error('Invalid historical question coordinate.');
  return `https://github.com/the-omega-institute/trureturing/blob/${record.source_commit}/Problems/${record.id}.md`;
}
const FIELDS = ['human_title','human_abstract','human_theorem','source_blob','repo_path','state','status','literature'];
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
  if (fields.includes('literature')) parts.push('References updated');
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
        result.changed.push({...row(n,after,describeChange(fields),fields), previous:row(old,before,'Previous record')});
    }
  }
  for (const [id,n] of previous) if (!current.has(id)) result.removed.push(row(n,before,'Absent from the later snapshot'));
  // Compare mathematical claims, not renewed attestation hashes or timestamps.
  // Upstream verification is consumed here; Pages never reruns Lean.
  const oldTargets = new Map((before.problems || []).map(p=>[p.slug,p]));
  const newTargets = new Map((after.problems || []).map(p=>[p.slug,p]));
  if (Array.isArray(before.problems) && Array.isArray(after.problems)) {
    for (const id of new Set([...oldTargets.keys(), ...newTargets.keys()])) {
      const prior = oldTargets.get(id), current = newTargets.get(id);
      const oldClaim = verifiedClaim(prior), newClaim = verifiedClaim(current);
      if (JSON.stringify(oldClaim) === JSON.stringify(newClaim)) continue;
      const change = !oldClaim ? 'new' : !newClaim ? 'removed' : 'updated';
      const problem = newClaim ? current : prior, snapshot = newClaim ? after : before;
      result.outcomes.push({id, title:problem.title, event:change === 'new'
        ? `Newly recorded as ${newClaim.kind}` : change === 'removed'
          ? 'No longer recorded as verified' : 'Recorded conclusion or scope changed',
        change, previous_kind:oldClaim?.kind || null, kind:newClaim?.kind || null,
        previous_scope:questionScope(prior), scope:questionScope(problem),
        source_commit:snapshot.graph.source_snapshot.source_commit, resolution:problem.resolution,
        release:snapshot.truth_release_digest, source_path:`Problems/${id}.md`, target:true});
    }
  }
  if (before.truth_release_digest === after.truth_release_digest &&
      ['added','changed','removed','outcomes'].some(k=>result[k].length))
    throw new Error('One immutable release has conflicting content.');
  for (const key of ['added','changed','removed','outcomes']) result[key].sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  return result;
}

function verifiedClaim(problem) {
  const r = problem?.resolution, marker = r?.kernel_verified;
  if (!['proved','refuted'].includes(r?.kind) || !marker?.frozen_node_id || !marker?.freeze_status) return null;
  return {kind:r.kind, declaration:r.declaration_gid || '',
    scope:questionScope(problem).replace(/\s+/g,' ').trim()};
}

export function contentCounts(change) {
  return {outcomes:change.outcomes.filter(r=>r.change==='new').length,
    added:change.added.length, changed:change.changed.length, removed:change.removed.length,
    outcomeUpdates:change.outcomes.filter(r=>r.change!=='new').length};
}

function questionScope(problem) { return String(problem?.resolution?.scope || problem?.sections?.Problem || ''); }
