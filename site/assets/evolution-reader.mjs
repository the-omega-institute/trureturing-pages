import {loadLibrary, nodeSlug} from './library-core.mjs';
import {compareContent,outcomeSourceURL} from './evolution-reader-core.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const state={library:null,index:0,change:null,query:'',limits:{},generation:0,renderGeneration:0};
const kinds=[['added','Added modules'],['changed','Updated records'],['removed','No longer present'],['outcomes','Question outcome records'],['existing','Starting Library']];
function link(label,href){const a=el('a',label);a.href=href;return a;}
async function renderRows(){
  const token=state.generation, renderToken=++state.renderGeneration;
  const groups=[];
  const query=state.query.toLowerCase().trim();
  for(const [key,label] of kinds){
    const records=state.change[key].filter(n=>!query||`${n.title} ${n.human_abstract||''} ${n.id}`.toLowerCase().includes(query));
    if(!state.change[key].length)continue;
    const group=el('details',undefined,'reading-group');group.open=key==='added'||key==='changed'||key==='existing';
    const summary=el('summary');summary.append(el('strong',label),el('span',`${records.length} records`,'reading-count'));group.append(summary);
    const body=el('div',undefined,'reading-group-body');
    for(const n of records.slice(0,state.limits[key]||8)){
      const article=el('article',undefined,'evolution-record');article.id=`change-${await nodeSlug(n.id)}`;
      article.append(el('h3',n.title),el('small',n.event));
      if(n.human_abstract)article.append(el('p',n.human_abstract));
      const url=n.target?outcomeSourceURL(n):`release/${n.release.slice(7)}/node/${await nodeSlug(n.id)}/`;
      article.append(link(n.target?'Read the question at this release':'Read this module in its release',url));
      const details=el('details');details.append(el('summary','Source location and recorded state'));
      if(n.domain)details.append(el('p',`Repository group: ${n.domain}. This is a source organization label, not a progress score.`));
      details.append(el('code',n.source_path||n.repo_path||n.id));
      if(n.state||n.status)details.append(el('p',`Recorded state: ${n.state||n.status}`));
      article.append(details);body.append(article);
    }
    if(records.length>(state.limits[key]||8)){
      const more=el('button',`Show more ${label.toLowerCase()}`,'reading-more');more.type='button';
      more.addEventListener('click',()=>{state.limits[key]=(state.limits[key]||8)+20;renderRows();});body.append(more);
    }
    if(!records.length)body.append(el('p','No records match this search.','reading-muted'));
    group.append(body);groups.push(group);
  }
  if(token!==state.generation||renderToken!==state.renderGeneration)return;
  $('evolution-records').replaceChildren(...groups);
  if(!groups.length)$('evolution-records').append(el('p','No module or question-record changes between these snapshots. Layout and renderer changes are not counted as research progress.','reading-muted'));
}
async function selectRelease(index){
  const token=++state.generation;state.index=index;state.limits={};state.change=null;
  $('evolution-release-evidence').textContent='';
  $('evolution-reader-status').textContent='Checking the selected snapshots...';
  $('evolution-records').replaceChildren();$('evolution-reader-stats').replaceChildren();
  try{
    const [after,before]=await Promise.all([state.library.snapshot(index),index>0?state.library.snapshot(index-1):null]);
    if(token!==state.generation)return;
    state.change=compareContent(before,after);
    $('evolution-reader-status').textContent=state.change.baseline?
      'This is the starting snapshot. It establishes what was present; it does not establish growth.':
      `Compared with the previous recorded release. ${state.change.total.toLocaleString('en-US')} modules in the selected Library.`;
    for(const [key,label]of kinds.slice(0,4)){
      const card=el('div');card.append(el('strong',String(state.change[key].length)),el('span',label));$('evolution-reader-stats').append(card);
    }
    $('evolution-release-evidence').textContent=`Selected release: ${after.truth_release_digest}. Source: ${after.graph.source_snapshot.source_commit}.`;
    await renderRows();
  }catch(error){if(token===state.generation){$('evolution-reader-status').textContent=error.message;$('evolution-records').replaceChildren(el('p','The selected comparison is unavailable. No growth has been inferred.'));}}
}
async function main(){
  state.library=await loadLibrary(new URL('./',location.href));
  const entries=state.library.index.entries;
  entries.forEach((entry,i)=>{const option=el('option',`${i===entries.length-1?'Latest release':'Recorded release '+(i+1)} · ${entry.truth_release_digest.slice(7,15)} / ${entry.node_count??'unknown'} archived records`);option.value=i;$('evolution-release-select').append(option);});
  $('evolution-release-select').disabled=false;$('evolution-release-select').value=entries.length-1;
  $('evolution-release-select').addEventListener('change',e=>selectRelease(Number(e.target.value)));
  $('evolution-reader-search').addEventListener('input',e=>{state.query=e.target.value;if(state.change)renderRows();});
  await selectRelease(entries.length-1);
}
main().catch(error=>{$('evolution-reader-status').textContent=`Release history unavailable: ${error.message}`;});
