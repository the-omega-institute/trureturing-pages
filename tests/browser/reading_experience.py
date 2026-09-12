"""Native HTTP/ESM browser checks against a PR-only preview. No transport/DOM doubles."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import urljoin, urlsplit
from playwright.sync_api import sync_playwright


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--site',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(args.site.resolve())))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}/';events=[];errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
        page.on('pageerror',lambda e:errors.append(str(e)))
        requests=[];page.on('request',lambda r:requests.append(r.url))
        page.add_init_script("window.__shifts=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__shifts.push(e.value)}).observe({type:'layout-shift',buffered:true});")
        page.goto(base+'research.html?lang=en',wait_until='networkidle')
        assert page.locator('#results [data-reading-group]').count()==3
        assert page.locator('#results [data-reading-group][open]').count()==0
        assert page.locator('nav[aria-label="Primary navigation"] a',has_text='Spaces').count()==1
        events.append('Research initial groups are collapsed and Spaces is in the primary navigation')
        page.screenshot(path=str(args.output/'research-desktop.png'),full_page=True)
        page.locator('#results-oeis > summary').click()
        total = page.locator('#results-oeis .reading-item').count()
        assert page.locator('#results-oeis .reading-item:visible').count() == min(12,total)
        if total > 12:
            page.locator('#results-oeis .reading-more').click()
            assert page.locator('#results-oeis .reading-item:visible').count() == min(24,total)
        events.append('Large collections reveal 12 results at a time')
        rows=page.locator('#results .news-result')
        if rows.count():
            identity=page.locator('#results-oeis .news-result').last.get_attribute('id') if total else rows.last.get_attribute('id')
            page.goto(base+'research.html?lang=en#'+identity,wait_until='networkidle')
            assert page.locator('[id="'+identity+'"]').is_visible()
            events.append('Result permalink unfolds both collection and result without losing evidence')
        page.goto(base+'research.html?lang=en',wait_until='networkidle')
        title=page.locator('#results .result-item summary strong').first.text_content() if rows.count() else None
        if title:
            page.locator('#results-query').fill(title)
            assert page.locator('#results [data-reading-group][open]:visible').count()>=1
            page.locator('#results [data-clear-search]').click()
            assert page.locator('#results [data-reading-group][open]').count()==0
            events.append('Search opens matching groups and clear restores the collapsed state')
        requests.clear()
        page.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
        assert not any('research-catalog.json' in u for u in requests)
        assert page.locator('#millennium-entry').count()==1
        assert page.locator('#research-workbench').count()==0
        assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(9, 12, 16)'
        assert page.evaluate('getComputedStyle(document.documentElement).backgroundColor')=='rgb(9, 12, 16)'
        assert page.evaluate('window.__shifts.reduce((a,b)=>a+b,0)')<0.1
        events.append('Conjectures is dark before notebook enhancement and initial layout shift stays below 0.1')
        assert not page.locator('main .reading-tabs a').evaluate_all("links=>links.some(a=>new URL(a.href).pathname.endsWith('/research.html'))")
        page.screenshot(path=str(args.output/'conjectures-desktop.png'),full_page=True)
        rows=page.locator('a.problem-row')
        if rows.count():
            href=rows.first.get_attribute('href')
            destination=urljoin(base,href)
            assert urlsplit(destination).path.startswith('/research/')
            page.goto(destination,wait_until='networkidle')
            assert '/research/' in page.url and 'research.html' not in page.url
            assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(9, 12, 16)'
            events.append('A source question opens its individual dossier on the same dark reading surface')
        page.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
        page.locator('#research-directions > summary').click()
        page.wait_for_selector('#research-workbench-slot #research-workbench',timeout=30000)
        assert page.locator('#research-workbench').count()==1
        events.append('Notebook loads once in its requested section without initial-page prepend')
        page.goto(base+'evolution.html?lang=en',wait_until='networkidle')
        page.wait_for_function("!document.getElementById('evolution-reader-status').textContent.includes('Checking')&&!document.getElementById('evolution-reader-status').textContent.includes('Verifying')")
        assert 'unavailable' not in page.locator('#evolution-reader-status').inner_text().lower()
        assert page.locator('a[href*="evolution-structure.html"]').count()==1
        assert page.locator('#evolution-map').count()==0
        events.append('Evolution starts with verified named changes; the old map is a separate destination')
        page.screenshot(path=str(args.output/'evolution-desktop.png'),full_page=True)
        page.locator('#evolution-release-select').select_option('0')
        page.wait_for_function("document.getElementById('evolution-reader-status').textContent.includes('starting snapshot')")
        events.append('First release is explicitly a baseline')
        page.goto(base+'spaces.html?lang=en',wait_until='networkidle')
        page.wait_for_function("document.getElementById('spaces-status').textContent.includes('released modules')",timeout=60000)
        assert page.locator('#spaces-list button').count()>0
        page.wait_for_selector('#spaces-scene canvas',timeout=60000)
        page.screenshot(path=str(args.output/'spaces-desktop.png'),full_page=True)
        events.append('Spaces resolves the actual published snapshot, generated catalog and WebGL canvas')
        page.goto(base+'conjectures.html?lang=en#next-questions',wait_until='networkidle')
        page.wait_for_selector('#research-workbench-slot #research-workbench',timeout=30000)
        assert page.locator('#research-directions').get_attribute('open') is not None
        assert page.locator('#research-workbench').count()==1
        events.append('The saved next-questions URL opens the requested notebook')
        for route in ['millennium.html?problem=rh', 'millennium.html?problem=navier-stokes', 'discover.html']:
            page.goto(base+route+'&lang=en' if '?' in route else base+route+'?lang=en',wait_until='networkidle')
            assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(9, 12, 16)'
            page.screenshot(path=str(args.output/(route.replace('?','-').replace('=','-')+'-desktop.png')),full_page=True)
        events.append('RH, Navier–Stokes and Discovery share the reading surface')
        for name in ['research','conjectures','evolution','millennium','discover']:
            page.set_viewport_size({'width':390,'height':844})
            page.goto(base+name+'.html?lang=en',wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),name
            page.screenshot(path=str(args.output/(name+'-mobile.png')),full_page=True)
        events.append('Research, Conjectures, Evolution, Millennium and Discovery fit a 390px viewport')
        browser.close()
    server.shutdown()
    report={'scenarios':events,'page_errors':errors,'transport':'native-local-http','modules':'native-esm','inputs':json.loads((args.site/'preview-inputs.json').read_text()),'deployed':False}
    (args.output/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
    if errors:raise AssertionError(errors)
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
