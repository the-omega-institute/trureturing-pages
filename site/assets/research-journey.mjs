import {ready, t} from './i18n.mjs';
const root = document.querySelector('.research-journey');
const source = document.getElementById('research-story-data');
if (root && source) {
  const data = JSON.parse(source.textContent);
  const scroll = root.querySelector('.story-scroll'), stage = root.querySelector('.story-stage');
  const map = root.querySelector('.story-map'), svg = map.querySelector('svg');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const items = data.nodes.map(node => ({...node, element: [...map.querySelectorAll('[data-node]')].find(e => e.dataset.node === node.id)}));
  const byId = new Map(items.map(n => [n.id, n]));
  const ns = 'http://www.w3.org/2000/svg';
  const edges = data.edges.map(edge => {const e = document.createElementNS(ns,'path');e.dataset.kind=edge.kind;svg.append(e);return {...edge, element:e};});
  const labels = [...map.querySelectorAll('[data-area]')];
  const copies = [...root.querySelectorAll('[data-scene-copy]')];
  const links = [...root.querySelectorAll('[data-scene-link]')];
  const dialog = root.querySelector('dialog');
  const model = {progress:0};
  let width=0, height=0, mobile=false, active=-1, timeline;
  const mix=(a,b,t)=>a+(b-a)*t;
  function location(node, scene) {
    const g=node.group, kind=node.kind, i=node.order || 0;
    const count=data.areas.length, cx=width*(g+.5)/count, cy=height*.46;
    const row=height*(g+(mobile?.43:.5))/count;
    const clusterRadius=Math.min(width/count*.30, height*.28);
    const stepCount=items.filter(n=>n.group===g&&n.kind==='step').length;
    const targetCount=items.filter(n=>n.group===g&&n.kind==='target').length;
    const stepY=(i-(stepCount-1)/2)*48;
    const targetY=(i-(targetCount-1)/2)*(mobile?50:100);
    let x=cx,y=cy,opacity=1,label=1;
    if(scene===0) {
      // Fixed compositions give each field its own silhouette; no invented edges.
      const silhouettes = [
        {step:[[-.95,-.40],[-.58,-.85],[-.15,-.48]],result:[.05,.12],target:[[.75,-.55],[.88,.65]],horizon:[.15,.98]},
        {step:[[-.90,.55],[-.98,-.18],[-.48,-.73]],result:[-.08,.03],target:[[.47,-.65],[.90,.26]],horizon:[.36,.98]},
        {step:[[-.90,-.63],[-.72,.05],[-.38,.68]],result:[.08,-.10],target:[[.80,-.70],[.96,.38]],horizon:[.04,.97]},
      ];
      const shape=silhouettes[g%silhouettes.length];
      const xy=kind==='step'||kind==='target'?shape[kind][i%shape[kind].length]:shape[kind];
      const r=mobile?Math.min(width*.32,height/count*.36):clusterRadius*1.15;
      x=(mobile?width*.49:cx)+xy[0]*r;
      y=(mobile?row:cy+(g===1?-.08:.03)*height)+xy[1]*r;
      if(kind==='step') {label=0;opacity=.9;}
      if(kind==='target') {label=0;opacity=1;if(mobile)x=width*(.81+i*.09);}
      if(kind==='horizon') {label=0;opacity=0;}
    } else if(scene===1) {
      y=row-(mobile?8:15);
      if(kind==='step') {x=width*(.12+i*(mobile?.18:.21));label=mobile?0:1;}
      if(kind==='result') x=width*.83;
      if(kind==='target'||kind==='horizon') {x=width*.92;opacity=0;label=0;}
    } else if(scene===2) {
      y=row;
      if(kind==='result') x=width*.17;
      if(kind==='step') {x=width*(.06+i*.045);y-=mobile?26:32;label=0;opacity=.23;}
      if(kind==='target') {
        if(mobile) {x=width*(.52+i*.33);y+=(i-.5)*32;}
        else {x=width*(.60+i*.25);}
      }
      if(kind==='horizon') {x=width*.92;label=0;opacity=0;}
    } else {
      if(mobile) {
        y=row;
        if(kind==='result') x=width*.16;
        if(kind==='step') {x=width*.16;y+=stepY*.5;label=0;opacity=0;}
        if(kind==='target') {x=width*.48;y+=targetY;label=0;}
        if(kind==='horizon') {x=width*.81;label=1;}
      } else {
        if(kind==='result') {x=cx;y=cy-clusterRadius*.85;}
        if(kind==='step') {x=cx-clusterRadius*.65+i*clusterRadius*.65;y=cy-clusterRadius*1.45;label=0;opacity=.5;}
        if(kind==='target') {x=cx+(i-(targetCount-1)/2)*clusterRadius*1.5;y=cy+clusterRadius*.18;}
        if(kind==='horizon') {x=cx;y=cy+clusterRadius*1.52;}
      }
    }
    return {x,y,opacity,label};
  }
  const backgrounds=[['#edf3ed','#253d33'],['#e4eee8','#294b3c'],['#f4eddc','#735b34'],['#ece8f1','#655875']];
  function draw() {
    const p=Math.max(0,Math.min(3,model.progress));
    const from=Math.floor(p),to=Math.min(3,from+1);
    let blend=Math.max(0,Math.min(1,(p-from-.32)/.68));
    if(reduced.matches) blend=blend>.5?1:0;
    else blend=blend*blend*(3-2*blend);
    const scene=blend>.5?to:from;
    for(const node of items) {
      const a=location(node,from),b=location(node,to);
      node.x=mix(a.x,b.x,blend);node.y=mix(a.y,b.y,blend);
      const opacity=mix(a.opacity,b.opacity,blend), label=mix(a.label,b.label,blend);
      node.element.style.transform=`translate(${node.x-22}px,${node.y-22}px)`;
      node.element.style.opacity=String(opacity);
      node.element.style.visibility=opacity<.05?'hidden':'visible';
      node.element.querySelector('.story-node-label').style.opacity=String(label);
      node.element.style.pointerEvents=opacity<.3?'none':'';
      node.element.inert=opacity<.3;
    }
    for(const edge of edges) {
      const a=byId.get(edge.source),b=byId.get(edge.target);
      const dx=b.x-a.x;
      edge.element.setAttribute('d',`M${a.x},${a.y} C${a.x+dx*.45},${a.y} ${b.x-dx*.45},${b.y} ${b.x},${b.y}`);
      const opacityAt=s=>edge.kind==='outline'?(s===1?.8:s===0?.45:.2):(s===1||((s===0||s===2)&&b.kind==='horizon')?0:s===0?.35:.7);
      edge.element.style.opacity=mix(opacityAt(from),opacityAt(to),blend);
    }
    labels.forEach((label,i)=>{
      const x=mobile?width*.49:width*(i+.5)/data.areas.length;
      const y=mobile?height*(i+.5)/data.areas.length:height*.46;
      const layout=s=>s===0||s===3?{x:mobile?0:width*(i+.5)/data.areas.length,y:mobile?Math.max(0,y-height/data.areas.length*.46-10):8}:{x:0,y:height*(i+.5)/data.areas.length-(mobile?height/data.areas.length*.46:62)};
      const a=layout(from),b=layout(to);
      labels[i].style.transform=`translate(${mix(a.x,b.x,blend)}px,${mix(a.y,b.y,blend)}px) translateX(${mobile||scene===1||scene===2?'0':'-50%'})`;
    });
    root.querySelector('.story-gap').style.opacity=mix(from===2?1:0,to===2?1:0,blend);
    if(scene!==active) {
      const entering=active>=0;
      active=scene;stage.dataset.scene=String(scene);
      copies.forEach((copy,i)=>{copy.hidden=i!==scene;});
      links.forEach((link,i)=>{if(i===scene)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
      if(entering&&window.gsap&&!reduced.matches) gsap.fromTo(copies[scene],{y:12,opacity:0},{y:0,opacity:1,duration:.45,ease:'power2.out',overwrite:true});
      root.querySelector('.story-atmosphere').style.background=`radial-gradient(ellipse at ${scene===2?'40%':'65%'} 60%,${backgrounds[scene][0]},transparent 78%)`;
    }
  }
  function measure() {
    width=map.clientWidth;height=map.clientHeight;mobile=width<580;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    draw();
  }
  function jump(index, smooth=true) {
    const top=scroll.getBoundingClientRect().top+scrollY;
    const range=scroll.offsetHeight-stage.offsetHeight;
    const value=Math.max(0,Math.min(3,index));
    window.scrollTo({top:top+range*value/3,behavior:smooth&&!reduced.matches?'smooth':'instant'});
    if(!timeline) {model.progress=value;draw();}
  }
  links.forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();history.replaceState(null,'',link.getAttribute('href'));jump(Number(link.dataset.sceneLink));
  }));
  function hash() {
    const index=['questions','proofs','bridges','horizons'].findIndex(key=>location.hash==='#story-'+key);
    if(index>=0) jump(index,false);
  }
  function inspect(node) {
    root.querySelector('.story-detail-status').textContent=t(node.status)+' / '+t(data.areas[node.group].label);
    root.querySelector('#story-detail-title').textContent=t(node.label);
    root.querySelector('.story-detail-body').textContent=t(node.body);
    root.querySelector('.story-detail-scope').textContent=t(node.scope);
    root.querySelector('.story-scope-heading').textContent=t(node.kind==='target'?'Success means':'Exact scope');
    const link=root.querySelector('.story-detail-link');link.setAttribute('href',node.href);link.textContent=t(node.link);
    dialog.showModal();
  }
  items.forEach(node=>node.element.addEventListener('click',()=>inspect(node)));
  dialog.querySelector('a').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  root.classList.add('story-ready');measure();
  if(window.gsap&&window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    timeline=gsap.timeline({scrollTrigger:{trigger:scroll,start:'top top',end:()=>'+='+(scroll.offsetHeight-stage.offsetHeight),scrub:reduced.matches?true:.45,onRefresh:draw}});
    timeline.fromTo(model,{progress:0},{progress:3,duration:3,immediateRender:false,ease:'none',onUpdate:draw});
  } else {
    const update=()=>{model.progress=Math.max(0,Math.min(3,-scroll.getBoundingClientRect().top/(scroll.offsetHeight-stage.offsetHeight)*3));draw();};
    addEventListener('scroll',update,{passive:true});
  }
  let resizeFrame;
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{measure();window.ScrollTrigger?.refresh();});});
  observer.observe(map);
  reduced.addEventListener('change',()=>{if(timeline)timeline.scrollTrigger.scrubDuration(reduced.matches?0:.45);if(reduced.matches&&window.gsap){gsap.killTweensOf(copies);gsap.set(copies,{y:0,opacity:1});}draw();});
  addEventListener('hashchange',hash);
  addEventListener('pageshow',()=>{measure();window.ScrollTrigger?.refresh();});
  await ready;
  measure();window.ScrollTrigger?.refresh();hash();
  addEventListener('pagehide',event=>{if(!event.persisted){observer.disconnect();timeline?.scrollTrigger?.kill();timeline?.kill();cancelAnimationFrame(resizeFrame);}});
}
