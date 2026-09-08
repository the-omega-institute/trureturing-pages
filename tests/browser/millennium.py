"""Offline Chromium component smoke test, not a full generated-site/deployment test.

Uses the actual core/renderer/CSS with only ESM imports joined in memory. Fetch,
History, Storage and download initiation are explicit test doubles. No browser
network or policy modifications. Install Playwright and Chromium, then run:
  CHROMIUM_PATH=/usr/bin/chromium python tests/browser/millennium.py
Omit CHROMIUM_PATH to use Playwright's installed Chromium.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'site/assets'
CORE = (ASSETS / 'millennium-core.mjs').read_text()
UI = (ASSETS / 'millennium.mjs').read_text()
CSS = (ASSETS / 'millennium.css').read_text()
DATA = json.loads((ASSETS / 'millennium-data.json').read_text())
# The production files remain unchanged. Only module joining and the module base
# URL are replaced; the graph algorithms and event handlers are the actual code.
JOINED = CORE.replace('export function ', 'function ') + '\n' + re.sub(
    r'^import\s+\{.*?\}\s+from\s+\x27\./millennium-core\.mjs\x27;\s*', '', UI, count=1, flags=re.S
).replace('export async function ', 'async function ').replace('import.meta.url', '"https://component.invalid/assets/millennium.mjs"')
PRELUDE = '''
const location = window.mmTest.location;
const history = {
  pushState(_s,_t,href) { window.mmTest.history.push(location.href); location.href=href; },
  replaceState(_s,_t,href) { location.href=href; }
};
const localStorage = {
  getItem(key) { if(window.mmTest.blocked) throw new Error('storage blocked'); return window.mmTest.storage[key] || null; },
  setItem(key,value) { if(window.mmTest.blocked) throw new Error('storage blocked'); window.mmTest.storage[key]=value; }
};
const fetch = async url => {
  if(new URL(url).pathname !== '/assets/millennium-data.json') throw new Error('Unexpected fixture request');
  return new Response(JSON.stringify(window.mmTest.payload), {status:200, headers:{'Content-Type':'application/json'}});
};
'''
SHELL = re.sub(r'<script\b[^>]*>.*?</script>', '', (ROOT/'site/millennium.html').read_text(), flags=re.S | re.I)
SHELL = re.sub(r'<link\b[^>]*>', '', SHELL)
ENTRY = '''<html><head><meta charset="utf-8"></head><body><main class="research-home">
<header class="page-heading"><h1>Conjectures</h1></header><nav class="conjecture-destinations">Existing navigation</nav>
<div class="research-stats">Original release statistics</div><div class="research-browser">
<a class="problem-row" href="#original">Original released dossier</a></div></main></body></html>'''

def run():
    checks=[]
    def passed(name): checks.append(name);print('PASS',name)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH'))
        context=browser.new_context(viewport={'width':1440,'height':1080})
        errors=[]
        def mount(query='',payload=None,storage=None,entry=False,blocked=False,viewport=None):
            page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            if viewport:page.set_viewport_size(viewport)
            page.set_content(ENTRY if entry else SHELL)
            page.add_style_tag(content=CSS)
            page.evaluate('''config => {
              window.mmTest=config;
              const s=document.createElement('style');s.dataset.millenniumStyle='';document.head.append(s);
              const original=URL.createObjectURL.bind(URL);window.mmTest.blobs={};
              URL.createObjectURL=blob=>{const u=original(blob);window.mmTest.blobs[u]=blob;return u;};
              const click=HTMLAnchorElement.prototype.click;
              HTMLAnchorElement.prototype.click=function(){if(this.download){window.mmTest.download=window.mmTest.blobs[this.href];return;}return click.call(this);};
            }''',dict(payload=DATA if payload is None else payload,storage=storage or {},blocked=blocked,
                     location={'href':'https://component.invalid/millennium.html'+query},history=[]))
            page.add_script_tag(type='module',content=PRELUDE+JOINED+('\nawait mountMillenniumEntry();await mountMillenniumEntry();' if entry else ''))
            return page
        def route(page,query):
            page.evaluate('q=>{window.mmTest.location.href="https://component.invalid/millennium.html"+q;window.dispatchEvent(new PopStateEvent("popstate"));}',query)
        page=mount('?problem=rh');expect(page.locator('.mm-heading h1')).to_have_text('Riemann Hypothesis')
        expect(page.locator('.mm-problems>a')).to_have_count(7);expect(page.locator('.mm-stats strong').first).to_have_text('93')
        passed('RH overview and seven problem routes render from actual static data')
        page.locator('#mm-family').select_option('F08');expect(page.locator('[data-mm-node="5040"]')).to_be_attached()
        page.locator('[data-mm-node="5040"]').click();expect(page.locator('#mm-detail')).to_contain_text('10080 实例')
        expect(page.locator('#mm-detail')).to_contain_text('n>5040');expect(page.locator('[data-mm-node="robin-universal"]')).to_be_attached()
        passed('finite Robin certificate and all-integer obligation remain distinct')
        page.locator('#mm-note-text').fill('T(x)=x needs its own definition and proof.')
        page.get_by_role('button',name='加入观察清单',exact=True).click()
        saved=page.evaluate('window.mmTest.storage');expect(page.locator('#mm-note-text')).to_have_value('T(x)=x needs its own definition and proof.')
        page.locator('#mm-detail').get_by_role('button',name='导出观察清单').click()
        note_json=page.evaluate('window.mmTest.download.text()');notes=json.loads(note_json)
        assert notes['entries']['rh:5040']['starred'];assert notes['entries']['rh:5040']['note'].startswith('T(x)=x')
        restored=mount('?problem=rh&node=5040',storage=saved);expect(restored.locator('#mm-note-text')).to_have_value('T(x)=x needs its own definition and proof.');restored.close()
        passed('latest note survives star toggle, simulated storage restore and JSON export')
        page.locator('#mm-specs').check();expect(page.locator('[data-mm-node="A045"]')).to_be_attached()
        route(page,'?problem=rh&node=A045');expect(page.locator('#mm-family')).to_have_value('F08')
        expect(page.locator('#mm-detail h2')).to_contain_text('n≥5041');expect(page.locator('#mm-detail')).to_contain_text('RH ⇒ 此表述：未核验')
        passed('individual specification route expands its own DAG node and direction states')
        page.get_by_role('button',name='等价目录',exact=True).click();page.locator('#mm-family').select_option('')
        expect(page.locator('.mm-spec-card')).to_have_count(93)
        page.locator('#mm-search').fill('A080');expect(page.locator('.mm-spec-card')).to_have_count(1);expect(page.locator('.mm-spec-card')).to_contain_text('预印本待核验')
        page.locator('#mm-search').fill('no-such-formulation');expect(page.locator('.mm-spec-card')).to_have_count(0)
        expect(page.locator('.mm-empty')).to_contain_text('没有匹配项')
        passed('all 93 specifications, live search, preprint warning and empty result')
        page.get_by_role('button',name='共享核心',exact=True).click()
        expect(page.locator('[data-mm-node="zeros"].mm-common')).to_be_attached();expect(page.locator('.mm-reuse>button')).to_have_count(9)
        page.get_by_text('查看结构闭包的稳定过程',exact=True).click()
        expect(page.locator('.mm-content')).to_contain_text('不是 RH、算子或动力系统的不动点证明')
        passed('common inputs and scoped reuse counts do not claim a mathematical fixed point')
        for pid in ['pnp','hodge','navier-stokes','yang-mills','bsd','poincare']:
            route(page,'?problem='+pid);expect(page.locator('.mm-node')).to_have_count(3)
            expect(page.locator('.mm-warning')).to_contain_text('起始图');expect(page.locator('.mm-stats strong').first).to_have_text('0')
        expect(page.locator('.mm-science')).to_contain_text('科学界：已解决');expect(page.locator('#mm-detail')).to_contain_text('库内未盘点')
        passed('six independent starter graphs and Poincare external-solution distinction')
        entry=mount(entry=True);expect(entry.locator('#millennium-entry')).to_have_count(1);expect(entry.locator('.mm-entry-cards>a')).to_have_count(7)
        expect(entry.get_by_text('Original released dossier')).to_be_visible();expect(entry.locator('.research-stats')).to_have_text('Original release statistics');entry.close()
        passed('Conjectures mount is idempotent and preserves pre-existing release content')
        route(page,'?problem=rh&family=F08&node=5040');page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
        page.locator('[data-mm-node="5040"]').focus();page.locator('[data-mm-node="5040"]').press('Enter')
        expect(page.locator('#mm-detail h2')).to_contain_text('5040')
        passed('390-pixel mobile containment and keyboard node activation')
        out=ROOT/'preview';out.mkdir(exist_ok=True)
        page.set_viewport_size({'width':1440,'height':1080});route(page,'?problem=rh&family=F08&node=5040')
        page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(out/'rh-robin-desktop.png'),full_page=True)
        route(page,'?problem=rh&view=shared');page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(out/'rh-shared-desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844});route(page,'?problem=rh&node=A045');page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(out/'rh-mobile.png'),full_page=True)
        bad=mount(payload={'schema':'wrong'});expect(bad.get_by_text('研究图暂不可用',exact=True)).to_be_visible();bad.close()
        bad_entry=mount(payload={'schema':'wrong'},entry=True);expect(bad_entry.locator('#millennium-entry')).to_contain_text('目录暂不可用');expect(bad_entry.get_by_text('Original released dossier')).to_be_visible();bad_entry.close()
        passed('malformed data fails closed and leaves original dossier content intact')
        blocked=mount(blocked=True);expect(blocked.locator('.mm-heading h1')).to_have_text('Riemann Hypothesis');expect(blocked.locator('#mm-message')).to_contain_text('不可用');blocked.close()
        passed('storage failure keeps graph usable and exposes volatile-note status')
        hostile=json.loads(json.dumps(DATA));hostile['problems'][0]['nodes'][0]['title']='<img src=x onerror="window.injected=true">'
        hp=mount(payload=hostile);expect(hp.locator('#mm-detail h2')).to_contain_text('<img');assert hp.evaluate('window.injected === undefined');assert hp.locator('#mm-app img').count()==0;hp.close()
        passed('editorial strings remain text and cannot inject HTML')
        assert not errors,errors;passed('no uncaught renderer exceptions across the component run')
        browser.close()
    print(json.dumps({'passed':len(checks),'scope':'offline Chromium component; Fetch/History/Storage/download test doubles','checks':checks},ensure_ascii=False,indent=2))
    return checks

if __name__=='__main__':run()
