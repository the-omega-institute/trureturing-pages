// Localization enhances labels independently: a failed language module must not
// prevent the research map from rendering or responding to scroll.
let t=value=>value;
const translations=import('./i18n.mjs').then(async module=>{await module.ready;t=module.t;}).catch(()=>{});
const root=document.querySelector('.research-journey'), source=document.getElementById('research-story-data');
if(root&&source){
 try {
  const data=JSON.parse(source.textContent), map=root.querySelector('.story-map'), svg=map.querySelector('svg');
  const scroll=root.querySelector('.story-scroll'), stage=root.querySelector('.story-stage');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'), ns='http://www.w3.org/2000/svg';
  const elements=new Map([...map.querySelectorAll('[data-node]')].map(e=>[e.dataset.node,e]));
  const nodes=data.nodes.map(n=>({...n,element:elements.get(n.id)})), byId=new Map(nodes.map(n=>[n.id,n]));
  if(!nodes.length||nodes.some(n=>!n.element)||!Number.isFinite(data.field_count))throw new Error('Invalid research map data');
  const strategyEdges=[...data.edges,...nodes.filter(n=>n.kind==='field').map(n=>({source:n.id,target:'representations',bridge:true}))];
  if(strategyEdges.some(e=>!byId.has(e.source)||!byId.has(e.target)))throw new Error('Unknown research map endpoint');
  const edges=strategyEdges.map(e=>{const path=document.createElementNS(ns,'path');path.dataset.kind='strategy';svg.append(path);return {...e,element:path};});
  const copies=[...root.querySelectorAll('[data-scene-copy]')], links=[...root.querySelectorAll('[data-scene-link]')];
  const dialog=root.querySelector('dialog'), model={progress:0};
  let width=0,height=0,mobile=false,active=-1,timeline,resizeFrame;
  const mix=(a,b,t)=>a+(b-a)*t;
  function layout(n,scene){
    let x=0,y=0,opacity=1,label=1;
    const i=n.order;
    if(scene===0){
      if(n.kind==='source'){x=width*(i+.5)/3;y=height*.14;}
      if(n.kind==='field'){
        const cols=mobile?2:4, rows=Math.ceil(data.field_count/cols);
        x=width*((i%cols)+.5)/cols;y=height*(.37+(Math.floor(i/cols)+.5)/rows*.58);
      }
      if(n.kind==='process'){x=width*(i+.5)/5;y=height*.9;opacity=0;}
    }else if(scene===1){
      if(n.kind==='source'){x=width*(mobile?(i+.5)/3:.13);y=height*(mobile?.11:.21+i*.28);}
      if(n.kind==='process'){
        if(i<2){x=width*(mobile?.5:.48+i*.34);y=height*(mobile?.44+i*.38:.5);}
        else{x=width*.9;y=height*.8;opacity=0;}
      }
      if(n.kind==='field'){
        const cols=mobile?2:4;x=width*((i%cols)+.5)/cols;y=height*(.35+Math.floor(i/cols)*.16);opacity=0;
      }
    }else if(scene===2){
      if(n.kind==='source'){x=width*(i+.5)/3;y=0;opacity=0;}
      if(n.kind==='field'){
        if(mobile){
          const cols=2,rows=Math.ceil(data.field_count/cols),r=Math.floor(i/cols);
          x=width*((i%cols)+.5)/cols;
          y=height*(r<Math.ceil(rows/2)? .05+(r+.5)/rows*.7 : .62+(r-Math.ceil(rows/2)+.5)/rows*.7);
        }else{
          const half=Math.ceil(data.field_count/2),j=i%half;
          x=width*(i<half?.18:.82);y=height*(.08+(j+.5)/half*.84);
        }
      }
      if(n.kind==='process'){x=width*.5;y=height*.5;opacity=i===2?1:0;}
    }else{
      if(n.kind==='source'){x=width*(i+.5)/3;y=height*.1;opacity=0;}
      if(n.kind==='field'){x=width*((i%4)+.5)/4;y=height*(.2+Math.floor(i/4)*.25);opacity=0;}
      if(n.kind==='process'){
        x=width*(mobile?.5:(i+.5)/5);y=height*(mobile?(i+.5)/5:.4+(i%2)*.22);
      }
    }
    return{x,y,opacity,label};
  }
  function draw(){
    const p=Math.max(0,Math.min(3,model.progress)),a=Math.floor(p),b=Math.min(3,a+1);
    let fraction=Math.max(0,Math.min(1,(p-a-.3)/.7));
    fraction=reduced.matches?(fraction>.5?1:0):fraction*fraction*(3-2*fraction);
    const scene=fraction>.5?b:a;
    for(const n of nodes){
      const first=layout(n,a),last=layout(n,b);
      n.x=mix(first.x,last.x,fraction);n.y=mix(first.y,last.y,fraction);n.opacity=mix(first.opacity,last.opacity,fraction);
      n.element.style.transform=`translate(${n.x}px,${n.y}px) translate(-50%,-50%)`;
      n.element.style.opacity=String(n.opacity);n.element.style.visibility=n.opacity<.05?'hidden':'visible';
      n.element.inert=n.opacity<.5;
    }
    for(const edge of edges){
      const start=byId.get(edge.source),end=byId.get(edge.target);
      const dx=end.x-start.x,dy=end.y-start.y;
      edge.element.setAttribute('d',mobile?`M${start.x},${start.y} C${start.x},${start.y+dy*.5} ${end.x},${end.y-dy*.5} ${end.x},${end.y}`:`M${start.x},${start.y} C${start.x+dx*.5},${start.y} ${end.x-dx*.5},${end.y} ${end.x},${end.y}`);
      const at=s=>edge.bridge?(s===2?.45:0):(s===1||s===3?.65:0);
      edge.element.style.opacity=String(mix(at(a),at(b),fraction)*Math.min(start.opacity,end.opacity));
    }
    root.querySelectorAll('[data-map-label]').forEach(e=>{e.style.opacity=String(mix(a===0?1:0,b===0?1:0,fraction));});
    if(scene!==active){
      const entering=active>=0;active=scene;stage.dataset.scene=String(scene);
      copies.forEach((copy,i)=>{copy.hidden=i!==scene;});
      links.forEach((link,i)=>{if(i===scene)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
      if(entering&&window.gsap&&!reduced.matches)gsap.fromTo(copies[scene],{y:10,opacity:0},{y:0,opacity:1,duration:.4,ease:'power2.out',overwrite:true});
    }
  }
  function measure(){width=map.clientWidth;height=map.clientHeight;mobile=width<580;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);draw();}
  function jump(index,smooth=true){
    const start=scroll.getBoundingClientRect().top+scrollY,range=scroll.offsetHeight-stage.offsetHeight;
    window.scrollTo({top:start+range*index/3,behavior:smooth&&!reduced.matches?'smooth':'instant'});
    if(!timeline){model.progress=index;draw();}
  }
  links.forEach(link=>link.addEventListener('click',event=>{event.preventDefault();history.replaceState(null,'',link.getAttribute('href'));jump(Number(link.dataset.sceneLink));}));
  function hash(){const index=['questions','proofs','bridges','horizons'].findIndex(key=>location.hash==='#story-'+key);if(index>=0)jump(index,false);}
  function inspect(node){
    root.querySelector('.story-detail-status').textContent=t(node.status);
    root.querySelector('#story-detail-title').textContent=t(node.label);
    root.querySelector('.story-detail-body').textContent=t(node.body);
    root.querySelector('.story-detail-scope').textContent=t(node.scope);
    const holder=root.querySelector('.story-detail-links');holder.replaceChildren();
    for(const entry of node.links){const link=document.createElement('a');link.setAttribute('href',entry.href);link.textContent=t(entry.label);link.addEventListener('click',()=>dialog.close());holder.append(link);}
    dialog.showModal();
  }
  nodes.forEach(node=>node.element.addEventListener('click',event=>{if(root.classList.contains('story-ready')&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();inspect(node);}}));
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  const update=()=>{model.progress=Math.max(0,Math.min(3,-scroll.getBoundingClientRect().top/Math.max(1,scroll.offsetHeight-stage.offsetHeight)*3));draw();};
  const refresh=()=>{measure();if(timeline)window.ScrollTrigger.refresh();else update();};
  root.classList.add('story-ready');measure();
  if(window.gsap&&window.ScrollTrigger){
    gsap.registerPlugin(ScrollTrigger);
    timeline=gsap.timeline({scrollTrigger:{trigger:scroll,start:'top top',end:()=>'+='+(scroll.offsetHeight-stage.offsetHeight),scrub:reduced.matches?true:.45,onRefresh:draw}});
    timeline.fromTo(model,{progress:0},{progress:3,duration:3,immediateRender:false,ease:'none',onUpdate:draw});
  }else{
    addEventListener('scroll',update,{passive:true});update();
  }
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(refresh);});observer.observe(map);
  reduced.addEventListener('change',()=>{timeline?.scrollTrigger.scrubDuration(reduced.matches?0:.45);if(reduced.matches&&window.gsap){gsap.killTweensOf(copies);gsap.set(copies,{y:0,opacity:1});}draw();});
  addEventListener('hashchange',hash);addEventListener('pageshow',refresh);
  refresh();hash();
  translations.then(refresh);
  document.fonts?.ready.then(refresh);
  addEventListener('pagehide',event=>{if(!event.persisted){observer.disconnect();timeline?.scrollTrigger?.kill();timeline?.kill();cancelAnimationFrame(resizeFrame);}});
 } catch(error) {
   root.classList.remove('story-ready');
   root.querySelectorAll('[data-node]').forEach(node=>{node.inert=false;});
   root.querySelectorAll('[data-scene-copy]').forEach((copy,i)=>{copy.hidden=i!==0;});
   console.warn('Research animation unavailable; keeping the linked overview.',error);
 }
}
