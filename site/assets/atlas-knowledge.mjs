import { title } from './atlas-public-core.mjs?v=lean-admission-v2';
import { t } from './i18n.mjs?v=atlas-knowledge-v1';

// A browsing projection of the admitted release. Topic membership is editorial;
// every connection count and drill-down retains the actual module imports.
export function knowledgeModel(model, architecture) {
  const topics = model.families.filter(f => f.nodes.length).map(f => ({
    ...f, internal: 0, incoming: 0, outgoing: 0,
    landmarks: [...f.nodes].sort((a, b) =>
      architecture.metrics.get(b.id).reach - architecture.metrics.get(a.id).reach || a.id.localeCompare(b.id)).slice(0, 6),
  }));
  const byId = new Map(topics.map(f => [f.id, f])), pairs = new Map();
  for (const edge of model.edges) {
    const from = model.byId.get(edge.source), to = model.byId.get(edge.target);
    if (!from || !to) continue;
    if (from.family === to.family) { byId.get(from.family).internal++; continue; }
    byId.get(from.family).outgoing++; byId.get(to.family).incoming++;
    const [source, target] = [from.family, to.family].sort();
    const key = `${source}:${target}`;
    if (!pairs.has(key)) pairs.set(key, { key, source, target, edges: [], forward: 0, reverse: 0 });
    const pair = pairs.get(key);
    pair.edges.push(edge);
    pair[from.family === source ? 'forward' : 'reverse']++;
  }
  return { topics, byId, links: [...pairs.values()].sort((a, b) => b.edges.length - a.edges.length || a.key.localeCompare(b.key)),
    modules: model.nodes.length, imports: model.edges.length };
}

// Maximum-weight spanning forest keeps every connected topic represented. Extra
// strongest links reveal joins without turning the overview into a hairball.
export function overviewConnections(knowledge, limit = 12) {
  const parent = new Map(knowledge.topics.map(topic => [topic.id, topic.id]));
  const find = id => { while (parent.get(id) !== id) id = parent.get(id); return id; };
  const selected = new Set();
  for (const link of knowledge.links) {
    const a = find(link.source), b = find(link.target);
    if (a !== b) { parent.set(a, b); selected.add(link); }
  }
  for (const link of knowledge.links) { if (selected.size >= limit) break; selected.add(link); }
  return knowledge.links.filter(link => selected.has(link));
}

const positions = {
  foundations: [180, 145], concepts: [600, 145], observers: [1020, 145],
  information: [180, 410], quantum: [600, 410], numbers: [1020, 410],
  dynamics: [180, 675], discrete: [600, 675], analysis: [1020, 675],
};
const glyphs = { foundations: '⊢', concepts: '∀', observers: '◎', information: 'H', quantum: 'ψ', numbers: 'ℙ', dynamics: '∂', discrete: 'Σ', analysis: '∫' };
const shortNames = { foundations: 'Foundations', concepts: 'Logic & computation', observers: 'Observation & memory', information: 'Information theory', quantum: 'Quantum mathematics', numbers: 'Number theory', dynamics: 'Dynamical systems', discrete: 'Discrete mathematics', analysis: 'Analysis & infinity' };
const fmt = n => n.toLocaleString('en-US');
const element = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const svgElement = (tag, attrs = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

export function createKnowledgeMap(root, knowledge, { onTopic, onNode, onLink }) {
  let selected = null, activeLink = null;
  const stage = element('div', 'knowledge-stage');
  const svg = svgElement('svg', { viewBox: '0 0 1200 820', preserveAspectRatio: 'none', 'aria-label': t('Connections between mathematical topics') });
  const defs = svgElement('defs');
  const marker = svgElement('marker', { id: 'knowledge-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
  marker.append(svgElement('path', { d: 'M 0 1 L 9 5 L 0 9', fill: '#74d9e9' })); defs.append(marker); svg.append(defs);
  const lines = svgElement('g', { class: 'knowledge-links' }); svg.append(lines); stage.append(svg);
  const cards = new Map(), countButtons = [];
  for (const topic of knowledge.topics) {
    const [x, y] = positions[topic.id];
    const card = element('article', 'knowledge-topic');
    card.dataset.topic = topic.id;
    card.style.cssText = `left:${x / 12}%;top:${y / 8.2}%;--topic-color:${topic.color}`;
    const heading = element('button', 'knowledge-topic-heading'); heading.type = 'button';
    heading.setAttribute('aria-pressed', 'false');
    heading.append(element('span', 'knowledge-glyph', glyphs[topic.id]));
    const text = element('span', 'knowledge-topic-text');
    text.append(element('strong', '', t(shortNames[topic.id])), element('small', '', t('{0} modules', fmt(topic.nodes.length))));
    heading.append(text, element('span', 'knowledge-topic-arrow', '↗'));
    heading.addEventListener('click', () => onTopic(topic.id));
    card.append(heading);
    const landmark = topic.landmarks[0];
    if (landmark) {
      const button = element('button', 'knowledge-landmark'); button.type = 'button';
      button.append(element('span', 'knowledge-landmark-dot'), element('span', '', title(landmark)));
      button.title = title(landmark); button.addEventListener('click', () => onNode(landmark.id)); card.append(button);
    }
    const sub = element('button', 'knowledge-topic-foot'); sub.type = 'button';
    sub.addEventListener('click', () => onTopic(topic.id));
    sub.append(element('span', '', t('{0} internal imports', fmt(topic.internal))), element('span', '', t('Explore →')));
    card.append(sub); stage.append(card); cards.set(topic.id, card);
  }
  root.replaceChildren(stage);
  function update(topic = null, linkKey = null) {
    selected = topic; activeLink = linkKey;
    root.classList.toggle('has-topic', Boolean(topic));
    for (const [id, card] of cards) {
      card.classList.toggle('is-active', id === topic);
      card.classList.toggle('is-muted', Boolean(topic && id !== topic && !knowledge.links.some(l => (l.source === topic && l.target === id) || (l.target === topic && l.source === id))));
      card.querySelector('button').setAttribute('aria-pressed', String(id === topic));
    }
    lines.replaceChildren();
    countButtons.splice(0).forEach(button => button.remove());
    const visible = topic ? knowledge.links.filter(l => l.source === topic || l.target === topic) : overviewConnections(knowledge);
    visible.forEach((link, index) => {
      const [ax, ay] = positions[link.source], [bx, by] = positions[link.target];
      const dx = bx - ax, dy = by - ay;
      // Stop at the card boundary; route parallel rows/columns through the gaps.
      const horizontal = Math.abs(dx) > Math.abs(dy) * 0.9;
      const sx = ax + (horizontal ? Math.sign(dx) * 111 : 0), sy = ay + (horizontal ? 0 : Math.sign(dy) * 70);
      const tx = bx - (horizontal ? Math.sign(dx) * 111 : 0), ty = by - (horizontal ? 0 : Math.sign(dy) * 70);
      const bend = (index % 2 ? 1 : -1) * (Math.abs(dx) < 20 || Math.abs(dy) < 20 ? 52 : 28);
      const cx = (sx + tx) / 2 + (horizontal ? 0 : bend), cy = (sy + ty) / 2 + (horizontal ? bend : 0);
      const path = `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
      const group = svgElement('g', { class: `knowledge-edge${link.key === activeLink ? ' is-active' : ''}`, role: 'button', tabindex: 0, 'aria-label': t('{0} ↔ {1}: {2} module imports', t(shortNames[link.source]), t(shortNames[link.target]), fmt(link.edges.length)), 'data-connection': link.key });
      const stroke = svgElement('path', { d: path, 'vector-effect': 'non-scaling-stroke', class: 'knowledge-edge-line', 'stroke-width': 1 + Math.log2(1 + link.edges.length) * 0.24, 'marker-end': link.forward ? 'url(#knowledge-arrow)' : '', 'marker-start': link.reverse ? 'url(#knowledge-arrow)' : '' });
      const hit = svgElement('path', { d: path, class: 'knowledge-edge-hit' });
      const mx = (sx + 2 * cx + tx) / 4, my = (sy + 2 * cy + ty) / 4;
      // HTML labels preserve readable type when the SVG stretches on phones.
      const count = element('button', 'knowledge-connection-label', fmt(link.edges.length));
      count.type = 'button';
      count.style.cssText = `left:${mx / 12}%;top:${my / 8.2}%`;
      count.setAttribute('aria-label', group.getAttribute('aria-label'));
      count.classList.toggle('is-active', link.key === activeLink);
      count.addEventListener('click', () => onLink(link.key));
      count.addEventListener('pointerenter', () => group.classList.add('is-hovered'));
      count.addEventListener('pointerleave', () => group.classList.remove('is-hovered'));
      stage.append(count); countButtons.push(count);
      group.append(stroke, hit);
      group.addEventListener('click', () => onLink(link.key));
      group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onLink(link.key); } });
      lines.append(group);
    });
    return visible.length;
  }
  update();
  return { update };
}
