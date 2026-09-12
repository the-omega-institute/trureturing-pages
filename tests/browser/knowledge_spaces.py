"""Offline Chromium component tests. Transport, startup and renderer are explicit doubles.

No browser security settings are changed. HTTP navigation is not required. This
exercises actual UI/core code and component CSS; it is not a deployed/WebGL test.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from lib.knowledge_spaces import build_catalog, canonical, digest
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('space_fixtures', ROOT/'tests/test_knowledge_spaces.py')
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)


def page_source(snapshot, *, renderer=True, corrupt=False, query=''):
    catalog = build_catalog(snapshot)
    raw = canonical(catalog)
    manifest = {k:catalog[k] for k in ('profile','source_commit','truth_release_digest','atlas_graph_digest')}
    manifest.update(schema_version='pages-knowledge-spaces-manifest.v1',
                    catalog_path='data/spaces/'+digest(raw)[7:]+'.json', catalog_sha256=digest(raw))
    startup = {'graph':snapshot['graph'], 'manifest':manifest,
               'positions':{n['id']:{'x':i*40, 'y':i%2*25,'z':i%3*20} for i,n in enumerate(snapshot['graph']['nodes'])}}
    def module(path, names):
        source=(ROOT/path).read_text()
        source=re.sub(r'^export ', '', source, flags=re.M)
        return '(()=>{'+source+'\nreturn {'+names+'};})()'
    architecture=module('site/assets/architecture-core.mjs','analyzeArchitecture')
    core=module('site/assets/knowledge-spaces-core.mjs','loadCatalog,projectSpace,readRoute,routeSearch,safeLink')
    ui=(ROOT/'site/assets/knowledge-spaces.mjs').read_text()
    ui=re.sub(r'^import .*?;\n','',ui,flags=re.M)
    ui=ui.replace('import.meta.url', "'https://test.invalid/assets/knowledge-spaces.mjs'")
    script='''(async()=>{
const location={href:'https://test.invalid/spaces.html',pathname:'/spaces.html',origin:'https://test.invalid',search:QUERY};
window.__testLocation=location;
const history={pushState:(a,b,url)=>{location.search=new URL(url,location.href).search;window.__routes.push(url);},replaceState:(a,b,url)=>{location.search=new URL(url,location.href).search;}};
window.__routes=[];
const crypto={subtle:{digest:async(algorithm,bytes)=>new Uint8Array(await window.__hashBytes([...new Uint8Array(bytes)])).buffer}};
const loadStartup=async()=>(STARTUP);
const fetch=async(url)=>String(url).endsWith('data/knowledge-spaces.v1.json') ? new Response(JSON.stringify(MANIFEST)) : new Response(RAW);
const {analyzeArchitecture}=ARCHITECTURE;
const {loadCatalog,projectSpace,readRoute,routeSearch,safeLink}=CORE;
window.__draws=[];
if (RENDERER) window.ForceGraph3D=()=>()=>{
 let api; api=new Proxy({}, {get:(obj,key)=>(...args)=>{
 if(key==='graphData') window.__draws.push(JSON.parse(JSON.stringify(args[0])));
 if(key==='onNodeClick') window.__selectGraphNode=args[0];
 return api;
 }}); return api;
};
UI
})();'''
    for token,value in [('QUERY',json.dumps(query)),('STARTUP',json.dumps(startup)),('MANIFEST',json.dumps(manifest)),
                        ('RAW',json.dumps(raw.decode()+('bad' if corrupt else ''))),('ARCHITECTURE',architecture),
                        ('CORE',core),('RENDERER','true' if renderer else 'false'),('UI',ui)]:
        script=script.replace(token,value,1)
    html=(ROOT/'site/spaces.html').read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    html=re.sub(r'<link\b[^>]*>','',html)
    html=html.replace('</head>','<style>'+(ROOT/'site/assets/knowledge-spaces.css').read_text()+'</style></head>')
    return html,script,catalog


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium',default='/usr/bin/chromium')
    parser.add_argument('--screenshots',type=Path)
    args=parser.parse_args()
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=args.chromium,headless=True)
        count=0
        def open_page(**kwargs):
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.expose_function('__hashBytes',lambda data:list(hashlib.sha256(bytes(data)).digest()))
            html,script,catalog=page_source(fixtures.fixture(),**kwargs)
            page.set_content(html)
            page.add_script_tag(content=script)
            page.wait_for_function("!document.getElementById('spaces-status').textContent.startsWith('Verifying')")
            return page,catalog
        page,catalog=open_page()
        page.wait_for_function('window.__draws.length > 0')
        assert '5 released modules' in page.locator('#spaces-status').inner_text();count+=1
        page.locator('#spaces-kind').select_option('domain')
        assert page.locator('#spaces-list button').count()==3;count+=1
        arithmetic=next(s['id'] for s in catalog['spaces'] if s['kind']=='domain' and s['key']=='Arithmetic')
        dynamics=next(s['id'] for s in catalog['spaces'] if s['kind']=='domain' and s['key']=='Dynamics')
        page.locator('#spaces-list button',has_text='Arithmetic').click()
        assert set(page.evaluate('window.__draws.at(-1).nodes.map(n=>n.id)'))=={'root','b','c','d'};count+=1
        page.locator('#spaces-compare').select_option(dynamics)
        assert '2 shared foundations' in page.locator('#spaces-connections').inner_text();count+=1
        page.locator('#spaces-ranking button',has_text='Observer foundations').click()
        assert page.locator('#spaces-reader h2').inner_text()=='Observer foundations'
        assert 'Example Author' in page.locator('#spaces-reader').inner_text()
        assert page.locator('#spaces-reader a',has_text='Observation foundations').get_attribute('href')=='https://doi.org/10.1234/example';count+=1
        before=page.evaluate('window.__draws.length')
        page.locator('#spaces-ranking button',has_text='Observer foundations').click()
        assert page.evaluate('window.__draws.length')==before;count+=1
        page.locator('#spaces-compare').select_option('')
        page.locator('#spaces-context').uncheck()
        assert set(page.evaluate('window.__draws.at(-1).nodes.map(n=>n.id)'))=={'c','d'};count+=1
        page.locator('#spaces-kind').select_option('target')
        page.locator('#spaces-list button').click()
        assert '1 source anchors are absent' in page.locator('#spaces-reader').inner_text();count+=1
        page.locator('#spaces-query').fill('nothing matches')
        assert 'No spaces match' in page.locator('#spaces-list').inner_text();count+=1
        page.evaluate("window.__testLocation.search='?space=invalid';window.dispatchEvent(new PopStateEvent('popstate'))")
        assert page.locator('#spaces-status').get_attribute('class')=='spaces-error'
        assert page.evaluate('window.__draws.at(-1).nodes.length')==0;count+=1
        page.locator('#spaces-all').click()
        assert not page.locator('#spaces-status').evaluate("e=>e.classList.contains('spaces-error')");count+=1
        page.close()
        page,_=open_page(corrupt=True)
        assert 'digest mismatch' in page.locator('#spaces-status').inner_text()
        assert page.locator('#spaces-list button').count()==0;count+=1;page.close()
        page,_=open_page(query='?space='+'f'*64)
        assert 'absent' in page.locator('#spaces-status').inner_text()
        assert page.locator('#spaces-nodes button').count()==0;count+=1;page.close()
        page,_=open_page(renderer=False)
        page.wait_for_function("document.getElementById('spaces-graph-note').textContent.includes('unavailable')")
        assert page.locator('#spaces-nodes button').count()==5;count+=1
        if args.screenshots:
            args.screenshots.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(args.screenshots/'spaces-offline-desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        if args.screenshots:page.screenshot(path=str(args.screenshots/'spaces-offline-mobile.png'),full_page=True)
        count+=1;page.close()
        browser.close()
        print(f'PASS: {count} offline Chromium scenarios; startup/transport/history/renderer doubles; no WebGL or HTTP deployment verification.')

if __name__=='__main__':main()
