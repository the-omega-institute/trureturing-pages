"""Native browser acceptance: preserve the original visualization and academic theme."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import urljoin, urlsplit
from playwright.sync_api import sync_playwright

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(args.site.resolve())))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}/';events=[];errors=[];requests=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
        page.add_init_script("window.__shifts=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__shifts.push(e.value)}).observe({type:'layout-shift',buffered:true});")
        page.goto(base+'research.html?lang=en',wait_until='networkidle')
        assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(247, 248, 250)'
        assert 'Georgia' in page.locator('.news-heading h1').evaluate('e=>getComputedStyle(e).fontFamily')
        assert page.locator('#results [data-reading-group]').count()==3
        assert page.locator('#results [data-reading-group][open]').count()==0
        assert page.locator('nav[aria-label="Primary navigation"] a[href*="spaces.html"]:visible').count()==0
        assert page.locator('nav[aria-label="Primary navigation"] a[href*="version-status.html"]:visible').count()==0
        events.append('Research retains the original light academic palette and serif heading; results are grouped and collapsed')
        order=page.locator('main').evaluate("e=>['results','publications','frontier'].map(id=>[...e.children].indexOf(document.getElementById(id)))")
        assert order==sorted(order) and order[0]>=0
        assert page.locator('.research-focus-card').count()==0
        page.screenshot(path=str(args.output/'research-restored-desktop.png'),full_page=True)
        page.locator('#results-oeis > summary').click()
        total=page.locator('#results-oeis .reading-item').count()
        assert page.locator('#results-oeis .reading-item:visible').count()==min(12,total)
        if total>12:
            page.locator('#results-oeis .reading-more').click()
            assert page.locator('#results-oeis .reading-item:visible').count()==min(24,total)
        rows=page.locator('#results .news-result')
        if rows.count():
            identity=rows.last.get_attribute('id')
            page.goto(base+'research.html?lang=en#'+identity,wait_until='networkidle')
            assert page.locator('[id="'+identity+'"]').is_visible()
        events.append('Pagination and exact-result permalinks retain access to folded results')
        page.goto(base+'research.html?lang=en',wait_until='networkidle')
        title=page.locator('#results .result-item summary strong').first.text_content()
        page.locator('#results-query').fill(title)
        assert page.locator('#results [data-reading-group][open]:visible').count()>=1
        page.locator('#results [data-clear-search]').click()
        assert page.locator('#results [data-reading-group][open]').count()==0
        events.append('Search preserves the prior collection disclosure state')
        requests.clear();page.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
        assert not any('research-catalog.json' in u for u in requests)
        assert page.locator('.page-heading').count()==1
        assert page.locator('.research-browser > aside').count()==1
        assert page.locator('.research-stats').count()==1
        assert page.locator('#research-workbench').count()==0
        assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(247, 248, 250)'
        assert page.evaluate('getComputedStyle(document.documentElement).backgroundColor')=='rgb(247, 248, 250)'
        assert page.evaluate('window.__shifts.reduce((a,b)=>a+b,0)')<0.1
        events.append('Conjectures preserves its original heading, sidebar and statistics without the initial notebook prepend')
        page.screenshot(path=str(args.output/'conjectures-restored-desktop.png'),full_page=True)
        row=page.locator('.problem-row').first
        if page.locator('.problem-row').count():
            target=row.locator('h2').text_content()
            page.locator('#research-search').fill(target)
            page.wait_for_function("document.querySelector('#open-problems [data-reading-group][open]') !== null")
            assert row.is_visible()
            destination=urljoin(base,row.get_attribute('href'))
            assert urlsplit(destination).path.startswith('/research/')
            page.goto(destination,wait_until='networkidle');assert 'research.html' not in page.url
        events.append('The existing question filters still reveal the correct group and open a direct dossier')
        page.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
        page.locator('#research-directions > summary').click()
        page.wait_for_selector('#research-workbench-slot #research-workbench',timeout=30000)
        assert page.locator('#research-workbench').count()==1
        assert page.locator('.research-home > .research-stats').count()==1
        assert page.locator('.research-home > #open-problems').count()==1
        assert page.locator('.rw-release-browser').count()==0
        page.screenshot(path=str(args.output/'conjectures-notebook-desktop.png'),full_page=True)
        page.goto(base+'conjectures.html?lang=en#next-questions',wait_until='networkidle')
        assert page.locator('#next-questions').is_visible()
        assert page.locator('#research-workbench').count()==0
        assert not page.locator('#research-directions').evaluate('e=>e.open')
        events.append('Notebook leaves the original source browser in place; next-questions selects the real follow-ups')
        events.append('The notebook remains available on request in its reserved slot')
        page.goto(base+'evolution.html?lang=en',wait_until='networkidle')
        page.wait_for_function('typeof window.architectureHistoryDiagnostics === "function"',timeout=60000)
        before=page.evaluate('window.architectureHistoryDiagnostics()')
        assert before['sceneNodes']>0 and before['sceneEdges']>0
        assert page.locator('#evolution-map canvas').count()==1
        assert page.locator('#evolution-reader-status').count()==0
        assert page.locator('#lineage-release').count()==1
        assert page.locator('#release-play').count()==1
        assert page.locator('.lineage-guide').count()==1
        page.screenshot(path=str(args.output/'evolution-restored-desktop.png'),full_page=True)
        page.locator('#evolution-detail .architecture-rank').first.click()
        page.wait_for_function("document.querySelector('.group-explanation') && !document.querySelector('.group-explanation').textContent.startsWith('Loading')")
        assert page.locator('.group-connections').count()==2
        assert page.locator('#lineage-group .group-module').count()>0
        page.screenshot(path=str(args.output/'evolution-selected-desktop.png'),full_page=True)
        events.append('Selection shows sourced examples, a release-bound explanation and prerequisite/consumer groups')
        page.locator('[data-lineage="time"]').click()
        assert page.evaluate('window.architectureHistoryDiagnostics().mode')=='time'
        page.locator('[data-lineage="dependency"]').click()
        page.locator('#lineage-release').evaluate("e=>{e.value=0;e.dispatchEvent(new Event('input',{bubbles:true}))}")
        assert page.evaluate('window.architectureHistoryDiagnostics().observation')==0
        assert 'baseline' in page.locator('#release-change-summary').inner_text().lower()
        page.locator('#release-play').click()
        page.wait_for_function('window.architectureHistoryDiagnostics().observation > 1')
        page.locator('#release-play').click()
        assert page.locator('#release-play').get_attribute('aria-label')=='Play release evolution'
        events.append('Playback advances the original graph and pauses normally')
        events.append('The original graph, time view, controls and baseline semantics work with real history')
        page.locator('#publication-status > summary').click()
        page.wait_for_function("!['Publication status','Checking publication status'].includes(document.getElementById('publication-summary').textContent)")
        assert page.locator('#publication-stages li').count() in [0,5]
        events.append('Publication diagnostics are an optional inline disclosure in Evolution')
        page.goto(base+'spaces.html?lang=en',wait_until='domcontentloaded')
        page.wait_for_url('**/atlas.html?lang=en#*',timeout=30000)
        assert page.locator('#spaces-compare').count()==0
        events.append('Legacy Spaces opens the existing Atlas rather than comparing web sources with internal knowledge')
        for name in ['research','conjectures','evolution']:
            page.set_viewport_size({'width':390,'height':844})
            page.goto(base+name+'.html?lang=en',wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),name
            page.screenshot(path=str(args.output/(name+'-restored-mobile.png')),full_page=True)
        events.append('Restored pages fit a 390px viewport')
        browser.close()
    server.shutdown()
    report={'scenarios':events,'page_errors':errors,'transport':'native-local-http','modules':'native-esm',
        'inputs':json.loads((args.site/'preview-inputs.json').read_text()),'deployed':False}
    (args.output/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
    if errors:raise AssertionError(errors)
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
