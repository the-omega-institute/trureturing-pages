"""Offline Chromium DOM smoke test, with in-memory catalog and storage doubles.

Run: python tests/research_workbench_browser.py --chromium /usr/bin/chromium
This does not test the production archive, network delivery or native storage.
"""
import argparse
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--chromium', default='/usr/bin/chromium')
parser.add_argument('--screenshots', type=Path)
args = parser.parse_args()
assets = Path(__file__).resolve().parents[1] / 'site/assets'
catalog = json.loads((assets/'research-catalog.json').read_text())
css = (assets/'research-workbench.css').read_text()
core = (assets/'research-workbench-core.mjs').read_text().replace('export ', '')
ui = (assets/'research-workbench.mjs').read_text()
ui = 'const el' + ui.split('const el', 1)[1]
ui = ui.replace('export ', '').replace('import.meta.url', '"https://workbench.test/assets/research-workbench.mjs"')
# Only the asset loader is adapted: all DOM, filter and notebook code is unchanged.
ui = ui.replace('new URL("./research-workbench.css", "https://workbench.test/assets/research-workbench.mjs").href',
                json.dumps('data:text/css;base64,' + base64.b64encode(css.encode()).decode()))
rows = ''.join(f'<a class="problem-row" href="https://workbench.test/research/{f["id"]}/">{f["title"]}</a>' for f in catalog['families'])
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Isolated research DOM fixture</title><style>body{background:#090c10;color:#edf3f7;font:16px/1.5 system-ui;margin:0;padding:24px}main{max-width:1200px;margin:auto}h1{font-size:42px}a{color:#acd7ee}.problem-row{display:block}*{box-sizing:border-box}</style>
<body><main class="research-home"><header><p>THE OMEGA INSTITUTE / RESEARCH FRONTIER</p><h1>Research</h1></header>
<div class="research-stats">Fixture release metadata</div><div class="research-browser">''' + rows + '</div></main></body></html>'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440, 'height':1100}, accept_downloads=True)
    errors = []
    def mount(saved=None, failure=False, blocked=False):
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(html)
        page.evaluate('''({catalog,saved,failure,blocked}) => {
          window.__memory = saved || {};
          window.fetch = async () => { if (failure) throw new Error('fixture network failure');
            return new Response(JSON.stringify(catalog), {status:200}); };
          Object.defineProperty(window,'localStorage',{value:{
            getItem: key => window.__memory[key] || null,
            setItem: (key,value) => {if(blocked)throw new Error('fixture storage denied');window.__memory[key]=value;}
          },configurable:true});
        }''', {'catalog':catalog,'saved':saved,'failure':failure,'blocked':blocked})
        page.add_script_tag(content=core+'\n'+ui+'\nwindow.mountFixture = mountResearchWorkbench;')
        result = page.evaluate("async () => {try {await mountFixture();return 'ok';}catch(error){return error.message;}}")
        return page,result
    page,result = mount()
    assert result=='ok',result
    assert page.locator('.rw-card').count()==21
    assert page.locator('#research-release-dossiers .problem-row').count()==7
    page.locator('#rw-q').fill('六维');assert page.locator('.rw-card').count()==3
    page.locator('#rw-kind').select_option('bridge');assert page.locator('.rw-card').count()==1
    page.get_by_role('button',name='Clear filters',exact=True).click()
    page.locator('#rw-q').fill('no-such-question');assert page.locator('.rw-empty').is_visible()
    page.get_by_role('button',name='Clear filters',exact=True).click()
    target='dfao-finite-unsat'
    card=page.locator(f'#question-{target}');card.locator('summary').first.click()
    card.locator('select').select_option('working')
    card.locator('textarea').fill('Exact sample first. <script>window.bad=true</script>')
    card.get_by_role('button',name='Add to shortlist',exact=True).click()
    page.locator('#rw-starred').check();assert page.locator('.rw-card').count()==1
    saved=page.evaluate('window.__memory')
    restored,result=mount(saved)
    restored.locator('#rw-starred').check();assert restored.locator('.rw-card').count()==1
    card=restored.locator(f'#question-{target}');card.locator('summary').first.click()
    assert card.locator('select').input_value()=='working'
    assert 'Exact sample' in card.locator('textarea').input_value()
    assert not restored.evaluate('Boolean(window.bad)')
    with restored.expect_download() as download:
        restored.get_by_role('button',name='Export notebook',exact=True).click()
    notebook=json.loads(Path(download.value.path()).read_text())
    assert notebook['entries'][target]['stage']=='working'
    notebook['entries'][target]['stage']='blocked'
    restored.locator('input[type=file]').set_input_files({'name':'notes.json','mimeType':'application/json','buffer':json.dumps(notebook).encode()})
    restored.wait_for_function("document.querySelector('#rw-storage-status').textContent.includes('Imported')")
    assert restored.locator(f'#stage-{target}').input_value()=='blocked'
    notebook['entries'][target]['stage']='proved'
    restored.locator('input[type=file]').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(notebook).encode()})
    restored.wait_for_function("document.querySelector('#rw-storage-status').textContent.includes('Import rejected')")
    assert restored.locator(f'#stage-{target}').input_value()=='blocked'
    page.evaluate("location.hash='node=D5%2FS3%2FArith%2FGoldenApparition'")
    page.wait_for_function("document.querySelectorAll('.rw-card').length===3")
    page.evaluate("location.hash='rp=mub-basis-context'")
    page.wait_for_selector('#question-mub-basis-context[open]')
    assert page.locator('.rw-card').count()==21
    page.get_by_role('button',name='Clear filters',exact=True).click()
    if args.screenshots:
        args.screenshots.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(args.screenshots/'research-desktop.png'),full_page=True)
    page.set_viewport_size({'width':375,'height':812})
    page.evaluate("location.hash='rp=mub-basis-context'")
    page.wait_for_selector('#question-mub-basis-context[open]')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    if args.screenshots:page.screenshot(path=str(args.screenshots/'research-mobile.png'),full_page=True)
    failed,result=mount(failure=True)
    assert 'network failure' in result
    assert failed.locator('#research-workbench').count()==0
    assert failed.locator('.research-browser').is_visible()
    assert failed.locator('.problem-row').count()==7
    memory,result=mount(blocked=True)
    memory.locator('#question-dfao-finite-unsat > summary').click()
    memory.locator('#note-dfao-finite-unsat').fill('Kept in memory')
    assert 'remain in memory' in memory.locator('#rw-storage-status').inner_text()
    assert memory.locator('#note-dfao-finite-unsat').input_value()=='Kept in memory'
    assert not errors,errors
    browser.close()
    print('PASS: isolated Chromium DOM, filters, notebook restore, import/export, hash navigation, mobile layout, catalog failure and denied-storage handling')
