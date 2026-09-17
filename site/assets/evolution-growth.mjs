import {comparisonKey} from './architecture-core.mjs';
import {familyFor} from './atlas-public-core.mjs';
import {SUBJECTS, subjectFor} from './mathematical-subjects.mjs';

// Each cohort is created once, at its first archived appearance. Topic placement
// is a display aid; every connecting edge retains actual module import pairs.
export function growthHistory(snapshots) {
  const cohorts=[], edges=[], membership=new Map(), tracks=new Map(), links=new Map();
  let known=new Map(), prior=null, segment=0;
  snapshots.forEach((snapshot,observation)=>{
    const boundary=prior && comparisonKey(prior)!==comparisonKey(snapshot);
    if(boundary){segment++;known=new Map();}
    const current=new Set(snapshot.nodes.map(n=>n.id));
    const batches=new Map();
    for(const node of [...snapshot.nodes].sort((a,b)=>a.id.localeCompare(b.id))) {
      if(!tracks.has(node.domain))tracks.set(node.domain,{domain:node.domain,color:familyFor(node).color,added:0,total:0});
      if(!known.has(node.id)) {
        const subject=subjectFor(node);
        const key=JSON.stringify([segment,observation,node.domain,subject.id]);
        if(!batches.has(key)) {
          const cohort={id:key,domain:node.domain,title:node.domain,subject,color:subject.color,
            born:observation,segment,baseline:observation===0||!!boundary,nodes:[],presence:new Map()};
          batches.set(key,cohort);cohorts.push(cohort);
        }
        const cohort=batches.get(key);cohort.nodes.push(node);known.set(node.id,cohort);
        const track=tracks.get(node.domain);track.total++;if(!cohort.baseline)track.added++;
      }
      const cohort=known.get(node.id);
      if(!cohort.presence.has(observation))cohort.presence.set(observation,new Set());
      cohort.presence.get(observation).add(node.id);
      membership.set(`${observation}\0${node.id}`,cohort.id);
    }
    // The same identity can reappear; it keeps its first coordinate but its
    // lifeline has a gap. No relationship is inferred across missing archives.
    if(Array.isArray(snapshot.dependency_edges))for(const [a,b] of snapshot.dependency_edges) {
      if(!current.has(a)||!current.has(b))continue;
      const source=known.get(a),target=known.get(b);
      const key=JSON.stringify([segment,a,b]);
      if(!links.has(key)) {
        const edge={source:source.id,target:target.id,pair:[a,b],first:observation,segment,
          baseline:observation===0||!!boundary||!Array.isArray(prior?.dependency_edges),observations:[]};
        links.set(key,edge);edges.push(edge);
      }
      links.get(key).observations.push(observation);
    }
    prior=snapshot;
  });
  const lanes=[...tracks.values()].sort((a,b)=>b.added-a.added||b.total-a.total||a.domain.localeCompare(b.domain));
  return {cohorts,edges,membership,lanes,total:snapshots.length,
    boundaries:snapshots.map((s,i)=>i&&comparisonKey(s)!==comparisonKey(snapshots[i-1])?i:null).filter(i=>i!==null)};
}

export function growthFrame(history,observation) {
  const nodes=history.cohorts.filter(c=>c.born<=observation).map(c=>({...c,
    active:c.presence.get(observation)?.size||0,
    last:Math.max(...[...c.presence.keys()].filter(i=>i<=observation))}));
  const bundles=new Map();
  for(const edge of history.edges) {
    if(edge.first>observation || edge.source===edge.target)continue;
    const key=JSON.stringify([edge.source,edge.target,edge.first,edge.baseline]);
    if(!bundles.has(key))bundles.set(key,{id:key,source:edge.source,target:edge.target,first:edge.first,
      baseline:edge.baseline,pairs:[],active:0});
    const bundle=bundles.get(key);bundle.pairs.push(edge.pair);
    if(edge.observations.includes(observation))bundle.active++;
  }
  return {nodes,edges:[...bundles.values()],observation};
}

// Collapse source cohorts into mathematical subjects. Expanding one subject
// exposes its source topics without changing the other rows or import evidence.
export function subjectFrame(history, observation, {expanded=null, auxiliary=false}={}) {
  const raw=growthFrame(history,observation), groups=new Map(), membership=new Map();
  const visible=s=>auxiliary||!s.auxiliary;
  const laneFor=n=>expanded===n.subject.id ? `${n.subject.id}/${n.domain}` : n.subject.id;
  const lanes=[];
  for(const subject of SUBJECTS.filter(visible)) {
    const cohorts=history.cohorts.filter(c=>c.subject.id===subject.id);
    if(!cohorts.length)continue;
    if(expanded===subject.id) {
      for(const domain of [...new Set(cohorts.map(c=>c.domain))].sort())
        lanes.push({domain:`${subject.id}/${domain}`,title:domain,subject,color:subject.color});
    } else lanes.push({domain:subject.id,title:subject.name,subject,color:subject.color});
  }
  for(const c of raw.nodes) {
    if(!visible(c.subject))continue;
    const domain=laneFor(c),id=JSON.stringify([c.segment,c.born,domain]);
    if(!groups.has(id))groups.set(id,{...c,id,domain,title:expanded===c.subject.id?c.domain:c.subject.name,
      nodes:[],presence:new Map(),active:0,last:c.last,cohortIds:[]});
    const group=groups.get(id);group.nodes.push(...c.nodes);group.cohortIds.push(c.id);
    group.active+=c.active;group.last=Math.max(group.last,c.last);
    for(const [i,ids] of c.presence) {
      if(!group.presence.has(i))group.presence.set(i,new Set());
      for(const id of ids)group.presence.get(i).add(id);
    }
    membership.set(c.id,id);
  }
  const bundles=new Map();
  for(const e of raw.edges) {
    const source=membership.get(e.source),target=membership.get(e.target);
    if(!source||!target||source===target)continue;
    const id=JSON.stringify([source,target,e.first,e.baseline]);
    if(!bundles.has(id))bundles.set(id,{...e,id,source,target,pairs:[],active:0});
    const edge=bundles.get(id);edge.pairs.push(...e.pairs);edge.active+=e.active;
  }
  return {nodes:[...groups.values()],edges:[...bundles.values()],lanes,observation};
}
