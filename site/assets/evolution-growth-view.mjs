import {subjectFrame} from './evolution-growth.mjs';
import {t} from './i18n.mjs';
const NS='http://www.w3.org/2000/svg';
function svg(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
const label=s=>String(s).replace(/([a-z\d])([A-Z])/g,'$1 $2');

export function mountGrowth(host,{onSelect,onObserve,onGroupChange}) {
  host.classList.add('growth-network');
  const axis=document.createElement('div'),scroll=document.createElement('div'),canvas=svg('svg');
  axis.className='growth-axis';scroll.className='growth-scroll';canvas.setAttribute('aria-label','Release growth network');
  const controls=document.createElement('div'),back=document.createElement('button'),toolsLabel=document.createElement('label'),toolsToggle=document.createElement('input');
  controls.className='growth-controls';back.type='button';back.textContent=t('All mathematical fields');back.hidden=true;
  toolsToggle.type='checkbox';toolsToggle.id='growth-auxiliary';toolsLabel.append(toolsToggle,document.createTextNode(t('Tools & unclassified')));
  controls.append(back,toolsLabel);scroll.append(canvas);host.append(controls,axis,scroll);
  const tooltip=document.createElement('div');tooltip.className='growth-tooltip';tooltip.hidden=true;host.append(tooltip);
  let history,frame,selected,zoom=1,width=1000,expandedSubject=null,auxiliary=false,visibleLanes=[];
  let left=152,labelLayer,axisCaption;
  const rowHeight=58,top=22;
  function draw(){
    if(!history)return;
    left=host.clientWidth<500?108:152;
    const lanes=frame.lanes;
    back.hidden=!expandedSubject;
    visibleLanes=lanes;
    const height=top+lanes.length*rowHeight+25;
    scroll.style.setProperty('--growth-height',height+'px');
    width=Math.max(host.clientWidth-8,760)*zoom;
    const step=(width-left-48)/Math.max(1,history.total-1),x=i=>left+i*step;
    const y=new Map(lanes.map((l,i)=>[l.domain,top+i*rowHeight+25]));
    const byId=new Map(frame.nodes.map(n=>[n.id,n]));
    canvas.replaceChildren();canvas.setAttribute('viewBox',`0 0 ${width} ${height}`);canvas.style.width=width+'px';canvas.style.height=height+'px';
    axis.replaceChildren();const ticks=svg('svg',{width,height:35});axis.append(ticks);
    axisCaption=svg('g');axisCaption.append(svg('rect',{width:left-16,height:35,fill:'#14211e'}),svg('text',{x:12,y:23,fill:'#9cb6aa','font-size':11},t('Observations →')));
    // Keep the full archive inside the same overview width as releases grow.
    // Thin labels independently of the data, keeping the selected version first.
    const stride=Math.max(1,Math.ceil(44/step)),tickIndices=[];
    const candidates=[frame.observation,0,history.total-1];
    for(let i=0;i<history.total;i+=stride)candidates.push(i);
    for(const i of candidates)if(!tickIndices.some(j=>Math.abs(x(i)-x(j))<40))tickIndices.push(i);
    for(const i of tickIndices.sort((a,b)=>a-b)) {
      const tick=svg('g',{tabindex:0,role:'button','aria-label':`Observation ${i+1}`,class:'growth-tick'});
      tick.append(svg('text',{x:x(i),y:23,'text-anchor':'middle',fill:i===frame.observation?'#f1d398':'#809d90','font-size':11},i===0?t('Baseline'):String(i+1)));
      tick.onclick=()=>onObserve(i);tick.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')onObserve(i);};ticks.append(tick);
    }
    ticks.append(axisCaption);
    labelLayer=svg('g', {class:'growth-labels'});
    labelLayer.append(svg('rect',{width:left-16,height,fill:'#0d1818'}));
    const defs=svg('defs'),marker=svg('marker',{id:'growth-arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});
    marker.append(svg('path',{d:'M 0 0 L 8 4 L 0 8 Z',fill:'context-stroke'}));defs.append(marker);canvas.append(defs);
    canvas.append(svg('rect',{x:x(frame.observation)-step*.45,y:0,width:step*.9,height,fill:'#d8b6710b'}));
    for(const boundary of history.boundaries)canvas.append(svg('path',{d:`M ${x(boundary)-step/2} 0 V ${height}`,stroke:'#af8cb9','stroke-dasharray':'3 5',opacity:.6}));
    for(const lane of lanes) {
      const cy=y.get(lane.domain);
      canvas.append(svg('path',{d:`M ${left-15} ${cy+22} H ${width-20}`,stroke:'#182b27'}));
      const text=svg('text',{x:12,y:cy+4,fill:lane.color,'font-size':12,class:'growth-domain','data-lane':lane.domain,tabindex:0,role:'button'},t(label(lane.title)).length>(left<152?12:19)?t(label(lane.title)).slice(0,left<152?11:18)+'…':t(label(lane.title)));
      text.append(svg('title',{},t(label(lane.title))));
      const focus=()=>{expandedSubject=expandedSubject===lane.subject.id?null:lane.subject.id;refresh();scroll.scrollTop=0;};text.onclick=focus;text.onkeydown=e=>{if(e.key==='Enter')focus();};labelLayer.append(text);
    }
    const connected=new Set();
    for(const edge of frame.edges){const a=byId.get(edge.source),b=byId.get(edge.target);if(edge.pairs.some(p=>p.includes(selected))){connected.add(a.id);connected.add(b.id);}}
    const nodeY=n=>y.get(n.domain);
    // Lifelines retain the precise birth coordinate and only cover contiguous
    // observations. They are persistence marks, never parenthood edges.
    for(const n of frame.nodes){
      if(!y.has(n.domain))continue;
      const cy=nodeY(n),dim=expandedSubject&&expandedSubject!==n.subject.id;
      const observed=[...n.presence.keys()].filter(i=>i<=frame.observation).sort((a,b)=>a-b);
      let start=observed[0],end=start;
      const line=()=>{if(end>start)canvas.append(svg('path',{d:`M ${x(start)} ${cy} H ${x(end)}`,stroke:n.color,'stroke-width':1.7,opacity:dim ? .09 : .34}));};
      for(const i of observed.slice(1)){if(i>end+1){line();start=i;}end=i;}line();
    }
    for(const edge of frame.edges){
      const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b||!y.has(a.domain)||!y.has(b.domain))continue;
      const focused=expandedSubject?(a.subject.id===expandedSubject||b.subject.id===expandedSubject):selected?edge.pairs.some(p=>p.includes(selected)):false;
      // Baseline connections remain inspectable on selection, while the default
      // view concentrates on relations first observed during the archive.
      if(edge.baseline&&!focused)continue;
      const ax=x(a.born),ay=nodeY(a),bx=x(Math.max(b.born,edge.first)),by=nodeY(b);

      const route = ay===by
        ? `M ${ax} ${ay} C ${ax} ${ay-24}, ${bx} ${by-24}, ${bx} ${by-6}`
        : ax===bx
          ? `M ${ax+5} ${ay} C ${ax+22} ${ay}, ${bx+22} ${by}, ${bx+6} ${by}`
          : `M ${ax} ${ay} C ${ax+(bx-ax)*.55} ${ay}, ${bx-(bx-ax)*.3} ${by}, ${bx-Math.min(6,(bx-ax)*.35)} ${by}`;
      const path=svg('path',{d:route,'marker-end':'url(#growth-arrow)',
        stroke:edge.first===frame.observation?'#e8c474':a.color,'stroke-width':focused?2.4:edge.first===frame.observation?1.8:Math.min(2, .85+Math.log2(edge.pairs.length+1)*.3),fill:'none',
        opacity:(selected||expandedSubject)?(focused ? .85 : .025):edge.first===frame.observation ? .85 : edge.active ? (a.domain===b.domain ? .32 : .24) : .11,
        'stroke-dasharray':edge.active?'':'3 4',class:'growth-connection'});
      path.append(svg('title',{},`${t(label(a.title))} → ${t(label(b.title))} · ${edge.pairs.length} ${t('imports')} · ${t('Observation')} ${edge.first+1}`));
      path.onclick=()=>onSelect({nodes:b.nodes.filter(n=>edge.pairs.some(p=>p[1]===n.id)),observation:b.presence.has(frame.observation)?frame.observation:b.last});canvas.append(path);
      if(edge.first>b.born)canvas.append(svg('path',{d:`M ${bx-3} ${by} l 3 -3 l 3 3 l -3 3 Z`,fill:a.color,opacity:focused ? .9 : .5}));
    }
    for(const n of frame.nodes){
      if(!y.has(n.domain))continue;
      const isSelected=n.nodes.some(v=>v.id===selected),focused=isSelected||connected.has(n.id);
      const dim=!expandedSubject&&selected&&!focused;
      const cx=x(n.born),cy=nodeY(n);
      const naturalRadius=n.baseline?5:Math.min(10,3+Math.log2(n.nodes.length+1));
      const densityScale=Math.min(1,step/24),r=naturalRadius*densityScale;
      const group=svg('g',{class:'growth-birth',tabindex:0,role:'button','aria-label':`${t(label(n.title))} · ${n.nodes.length} · ${t('Observation')} ${n.born+1}`,
        'data-born':n.born,'data-cohort':n.id,opacity:dim ? .12 : n.active ? 1 : .35});
      group.append(svg('circle',{cx,cy,r,fill:n.baseline?'#0d1818':n.color,stroke:isSelected?'#fff':n.born===frame.observation?'#f5d488':n.color,'stroke-width':(isSelected?2.5:1.5)*Math.max(.15,densityScale)}));
      if(!n.baseline && n.nodes.length>1 && step>=24 && (n.born===frame.observation||isSelected||n.nodes.length>=12))group.append(svg('text',{x:cx,y:cy-12,'text-anchor':'middle',fill:n.color,'font-size':10},`+${n.nodes.length}`));
      group.onclick=()=>onSelect({nodes:n.nodes,observation:n.presence.has(frame.observation)?frame.observation:n.last});
      group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();group.onclick();}};
      group.onpointerenter=()=>{tooltip.replaceChildren();const title=document.createElement('strong');title.textContent=`${t(label(n.title))} · ${n.baseline?t('Baseline'):'+'+n.nodes.length}`;tooltip.append(title);
        for(const item of n.nodes.slice(0,3)){const p=document.createElement('div');p.textContent=item.title;tooltip.append(p);}tooltip.hidden=false;};
      group.onpointerleave=()=>{tooltip.hidden=true;};canvas.append(group);
    }
    canvas.append(svg('path',{d:`M ${x(frame.observation)} 0 V ${height}`,stroke:'#cbb575',opacity:.4,'stroke-dasharray':'2 5','pointer-events':'none'}));
    canvas.append(labelLayer);
    syncScroll();
  }
  function syncScroll(){
    axis.scrollLeft=scroll.scrollLeft;
    labelLayer?.setAttribute('transform',`translate(${scroll.scrollLeft},0)`);
    axisCaption?.setAttribute('transform',`translate(${scroll.scrollLeft},0)`);
  }
  scroll.onscroll=()=>{syncScroll();tooltip.hidden=true;};
  function refresh(){
    if(!history)return;
    frame=subjectFrame(history,frame?.observation??0,{expanded:expandedSubject,auxiliary});draw();onGroupChange?.();
  }
  back.onclick=()=>{expandedSubject=null;refresh();scroll.scrollTop=0;};
  toolsToggle.onchange=()=>{auxiliary=toolsToggle.checked;refresh();};
  const observer=new ResizeObserver(()=>{if(!host.hidden)draw();});observer.observe(host);
  return {update(data,observation,id){tooltip.hidden=true;history=data;frame=subjectFrame(data,observation,{expanded:expandedSubject,auxiliary});selected=id;draw();},
    fit(){zoom=1;expandedSubject=null;refresh();scroll.scrollTop=0;scroll.scrollLeft=0;},
    fitChanges(){
      const n=frame.nodes.filter(n=>n.born===frame.observation&&!n.baseline).sort((a,b)=>b.nodes.length-a.nodes.length)[0];
      if(n){draw();scroll.scrollTop=Math.max(0,visibleLanes.findIndex(l=>l.domain===n.domain)*rowHeight-60);}
      const step=(width-left-48)/Math.max(1,history.total-1);
      scroll.scrollLeft=Math.max(0,left+frame.observation*step-scroll.clientWidth+60);
    },
    zoomBy(factor){
      const overviewWidth=Math.max(host.clientWidth-8,760)-left-48;
      const maxZoom=Math.max(5,(history.total-1)*24/overviewWidth);
      zoom=Math.max(1,Math.min(maxZoom,zoom*factor));draw();
    },
    groupFor(id){return frame?.nodes.find(n=>n.nodes.some(m=>m.id===id));},
    diagnostics(){return {lanes:frame?.lanes.length||0,expanded:expandedSubject,cohorts:frame?.nodes.length||0,connections:frame?.edges.length||0,births:frame?.nodes.filter(n=>n.born===frame.observation&&!n.baseline).length||0};},
    destroy(){observer.disconnect();host.replaceChildren();}};
}
