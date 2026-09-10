import {neighborhood} from './discovery-core.mjs';
import {t} from './i18n.mjs';
const colors = {literature:'#716499',publication:'#716499',claim:'#a17032',question:'#a17032',target:'#a17032',dossier:'#a17032',sequence:'#a17032',result:'#306d61',module:'#306d61',representation:'#3d718f',explanation:'#9a6066',topic:'#7e7771'};
const columns = {literature:0,publication:0,claim:1,sequence:1,dossier:1,topic:1,result:2,module:2,representation:3,question:3,target:3,explanation:4};
export function renderMap(index, selected, select) {
  const d3 = globalThis.d3, host = document.getElementById('discovery-map');
  host.replaceChildren();
  if (!d3) {host.textContent=t('The map is unavailable. All connections are listed alongside.');return;}
  const data = neighborhood(index, selected.id), lanes = Array.from({length:5},()=>[]);
  for(const record of data.records)lanes[columns[record.kind] ?? 2].push(record);
  const height = Math.max(460, ...lanes.map(lane => lane.length * 110 + 80)), width=1140;
  const nodes = lanes.flatMap((lane,column)=>lane.map((record,row)=>({...record,x:110+column*230,y:height/2+(row-(lane.length-1)/2)*110})));
  const byId = new Map(nodes.map(n=>[n.id,n]));
  const svg=d3.select(host).append('svg').attr('viewBox',`0 0 ${width} ${height}`).attr('aria-label',t('Interactive research map'));
  svg.append('title').text(t('Papers, questions and formal results connected by sourced relationships'));
  svg.append('defs').append('marker').attr('id','research-arrow').attr('viewBox','0 -4 8 8').attr('refX',8).attr('refY',0).attr('markerWidth',6).attr('markerHeight',6).attr('orient','auto').append('path').attr('d','M0,-3L8,0L0,3').attr('fill','#93a89b');
  const viewport=svg.append('g'), zoom=d3.zoom().scaleExtent([0.35,4]).on('zoom',event=>viewport.attr('transform',event.transform));
  svg.call(zoom).on('dblclick.zoom',null);
  document.getElementById('map-zoom-in').onclick=()=>svg.call(zoom.scaleBy,1.3);
  document.getElementById('map-zoom-out').onclick=()=>svg.call(zoom.scaleBy,1/1.3);
  const focus = byId.get(selected.id), mobile = host.clientWidth < 560;
  const initial = mobile ? d3.zoomIdentity.translate(width/2-focus.x*3,height/2-focus.y*3).scale(3) : d3.zoomIdentity;
  svg.call(zoom.transform,initial);
  document.getElementById('map-reset').onclick=()=>svg.call(zoom.transform,initial);
  const paths=viewport.append('g').selectAll('path').data(data.relations).join('path').attr('class',e=>`map-edge ${['builds_on','proposed_target','proposed_transfer'].includes(e.kind)?'proposed':''}`);
  paths.attr('marker-end','url(#research-arrow)');
  paths.append('title').text(e=>`${e.kind.replaceAll('_',' ')}: ${e.scope}`);
  const groups=viewport.append('g').selectAll('g').data(nodes).join('g').attr('class',n=>`map-node ${n.id===selected.id?'selected':''}`).attr('tabindex',0).attr('role','button').attr('aria-label',n=>t('Inspect {0}',n.title)).attr('aria-pressed',n=>String(n.id===selected.id));
  groups.append('rect').attr('x',-98).attr('y',-36).attr('width',196).attr('height',72).attr('rx',12).attr('stroke',n=>colors[n.kind] || '#777');
  groups.append('circle').attr('cx',-82).attr('cy',-20).attr('r',3).attr('fill',n=>colors[n.kind] || '#777');
  groups.append('text').attr('class','map-node-kind').attr('x',-72).attr('y',-16).text(n=>t(n.kind));
  groups.each(function(n){
    const text=d3.select(this).append('text').attr('class','map-node-title').attr('x',-82).attr('y',4);
    const title=t(n.title), words=title.split(/\s+/), lines=[''];
    for(const word of words) {if((lines.at(-1)+' '+word).length>25&&lines.at(-1))lines.push('');lines[lines.length-1]+=(lines.at(-1)?' ':'')+word;}
    lines.slice(0,2).forEach((line,i)=>text.append('tspan').attr('x',-82).attr('dy',i?17:0).text(line.slice(0,26)+(i===1&&lines.length>2?'…':'')));
  });
  groups.append('title').text(n=>n.title+'\n'+n.summary);
  groups.on('click',(event,n)=>{if(!event.defaultPrevented)select(n);}).on('keydown',(event,n)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(n);}});
  function draw(){groups.attr('transform',n=>`translate(${n.x},${n.y})`);paths.attr('d',e=>{const a=byId.get(e.source),b=byId.get(e.target),sign=b.x>=a.x?1:-1;return `M${a.x+sign*98},${a.y} C${a.x+sign*140},${a.y} ${b.x-sign*140},${b.y} ${b.x-sign*98},${b.y}`;});}
  groups.call(d3.drag().clickDistance(5).on('start',function(){d3.select(this).raise();}).on('drag',(event,n)=>{n.x=event.x;n.y=event.y;draw();}));
  draw();
  document.getElementById('map-status').textContent=t('{0} visible nodes · {1} sourced relationships',nodes.length,data.relations.length)+(data.omitted?' · '+t('{0} additional direct neighbors in the full connection list',data.omitted):'');
}
