/** Rebuild the deck's static Atlas artwork from its pinned, offline excerpt. */
import fs from 'node:fs';
import vm from 'node:vm';
const dir = new URL('../site/assets/open-math/', import.meta.url);
const data = JSON.parse(fs.readFileSync(new URL('atlas-excerpt.json', dir), 'utf8'));
const sandbox = {setTimeout,clearTimeout,setInterval,clearInterval,performance};
vm.runInNewContext(fs.readFileSync(new URL('../site/assets/vendor/d3.min.js', import.meta.url), 'utf8'), sandbox);
const d3 = sandbox.d3;
const nodes = data.visible.map(id => ({ id }));
const links = data.edges.map(e => ({ ...e }));
const sim = d3.forceSimulation(nodes).stop()
  .force('link', d3.forceLink(links).id(n => n.id).distance(34).strength(.65))
  .force('charge', d3.forceManyBody().strength(-95))
  .force('x', d3.forceX().strength(.035))
  .force('y', d3.forceY().strength(.035))
  .force('collide', d3.forceCollide(10));
sim.tick(420);
const extent = key => [Math.min(...nodes.map(n => n[key])), Math.max(...nodes.map(n => n[key]))];
const [x0,x1]=extent('x'), [y0,y1]=extent('y');
const scale = Math.min(590/(x1-x0),450/(y1-y0));
data.positions = Object.fromEntries(nodes.map(n => [n.id, [+(330+(n.x-(x0+x1)/2)*scale).toFixed(2), +(265+(n.y-(y0+y1)/2)*scale).toFixed(2)]]));
fs.writeFileSync(new URL('atlas-excerpt.json',dir),JSON.stringify(data,null,2)+'\n');
const byId=new Map(data.nodes.map(n=>[n.id,n]));
const chain=[data.seed,'D5/S1/Deficit/DeficitThreeValued','D5/S1/Deficit/AlmostAdditivity'];
const color=n=>chain.includes(n.id)?'#d5ed9e':n.domain==='Deficit'?'#83cfb9':n.domain==='Analytic'?'#c0add9':'#86b6cc';
const svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 550" role="img" aria-labelledby="title desc"><title id="title">A real neighborhood in the trureturing Atlas</title><desc id="desc">79 modules and 97 recorded module-import edges: DeficitInteger, its three direct prerequisites and 75 reachable downstream modules. Positions are arranged for presentation.</desc><defs><radialGradient id="glow"><stop stop-color="#7eb79b" stop-opacity=".16"/><stop offset="1" stop-color="#7eb79b" stop-opacity="0"/></radialGradient></defs><circle cx="330" cy="270" r="250" fill="url(#glow)"/><g fill="none" stroke="#668379" stroke-width=".6" opacity=".25"><circle cx="330" cy="270" r="245"/><circle cx="330" cy="270" r="175"/><circle cx="330" cy="270" r="100"/><path d="M30 270H630M330 10V530"/></g>'];
for(const e of data.edges){const a=data.positions[e.source],b=data.positions[e.target],active=chain.includes(e.source)&&chain.includes(e.target);svg.push(`<path d="M${a} L${b}" fill="none" stroke="${active?'#d5ed9e':'#6f9e91'}" stroke-width="${active?2.5:.8}" opacity="${active?1:.45}"/>`);}
for(const n of nodes){const [x,y]=data.positions[n.id],hot=chain.includes(n.id),r=hot?6:2.5+Math.min(3,byId.get(n.id).out_degree*.5);if(hot)svg.push(`<circle cx="${x}" cy="${y}" r="16" fill="#c2da91" opacity=".1"/>`);svg.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color(byId.get(n.id))}"/>`);}
chain.forEach((id,i)=>{const [x,y]=data.positions[id];const lx=10,ly=30+i*23;svg.push(`<path d="M${lx+155} ${ly-4} L${x} ${y}" stroke="#aac796" opacity=".4" fill="none"/><text x="${lx}" y="${ly}" fill="#dbebd6" font-family="monospace" font-size="11">${id.split('/').at(-1)}</text>`);});
svg.push('</svg>');fs.writeFileSync(new URL('atlas-network.svg',dir),svg.join('\n')+'\n');
console.log(`Rendered ${nodes.length} modules / ${links.length} edges.`);
