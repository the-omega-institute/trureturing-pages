import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeModel, overviewConnections } from '../../site/assets/atlas-knowledge.mjs';
import { createPublicModel } from '../../site/assets/atlas-public-core.mjs';
import { mathematicalArchitecture } from '../../site/assets/architecture-core.mjs';
import { withEvidence } from './atlas-evidence-fixture.mjs';

test('topic connections conserve every admitted module and real directed import', () => {
  const model = createPublicModel(withEvidence({
    nodes: [{ id: 'a', domain: 'Quantum' }, { id: 'b', domain: 'Quantum' }, { id: 'c', domain: 'Arith' }, { id: 'd', domain: 'Words' }].map(n => ({ ...n, kind: 'truth' })),
    edges: [['a','b'],['a','c'],['c','b']].map(([source,target]) => ({source,target,layer:'truth-dependency'})),
  }));
  const overview = knowledgeModel(model, mathematicalArchitecture(model));
  assert.equal(overview.topics.reduce((n,t) => n+t.nodes.length,0), model.nodes.length);
  assert.equal(overview.topics.reduce((n,t) => n+t.internal,0)+overview.links.reduce((n,l) => n+l.edges.length,0), model.edges.length);
  assert.equal(overview.links.length, 1);
  assert.equal(overview.links[0].forward, 1);
  assert.equal(overview.links[0].reverse, 1);
  assert.deepEqual(overview.links[0].edges, model.edges.filter(e=>e.source!== 'a' || e.target!== 'b'));
  assert.equal(overview.byId.get('discrete').nodes.length, 1, 'Unconnected topics remain browsable');
});

test('overview retains weakly connected topics and all incident links are available for drill-down', () => {
  const topics = ['a','b','c','d'].map(id => ({id}));
  const links = [['a','b',100],['b','c',80],['a','c',60],['c','d',1]].map(([source,target,count]) => ({source,target,edges:Array(count)}));
  const selected = overviewConnections({topics,links},3);
  assert.deepEqual(selected, [links[0],links[1],links[3]]);
  assert.equal(new Set(selected.flatMap(l => [l.source,l.target])).size,4);
  assert.equal(links.length,4, 'The overview never mutates the complete relation set');
});
