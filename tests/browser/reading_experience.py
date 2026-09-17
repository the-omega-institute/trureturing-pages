"""Native browser acceptance: preserve the original visualization and academic theme."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
import gzip
import re
from pathlib import Path
import threading
from urllib.parse import urljoin, urlsplit
from playwright.sync_api import sync_playwright

def assert_readable_text(page):
    def luminance(rgb):
        values=[int(n)/255 for n in re.findall(r"\d+",rgb)[:3]]
        values=[v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4 for v in values]
        return sum(v*w for v,w in zip(values,[.2126,.7152,.0722]))
    background=luminance(page.evaluate('getComputedStyle(document.body).backgroundColor'))
    for selector,minimum in [('.rw-next-step',16),('.rw-next-label',14),('.rw-direction-title',20),('.rw-frontier-meta',14),('.rw-frontier-targets a',15)]:
        for item in page.locator(selector).all():
            style=item.evaluate('e=>({color:getComputedStyle(e).color,size:parseFloat(getComputedStyle(e).fontSize)})')
            ink=luminance(style['color'])
            assert style['size']>=minimum,(selector,style)
            assert (max(ink,background)+.05)/(min(ink,background)+.05)>=4.5,(selector,style)


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
        rows=page.locator('#results [data-result-row]')
        assert page.locator('#resolved-questions-archive, #resolved-questions').count()==0
        total=rows.count()
        assert total>0
        assert rows.locator(':scope > summary').count()==total
        assert page.locator('#results [data-result-row]:visible').count()==min(8,total)
        assert page.locator('nav[aria-label="Primary navigation"] a[href*="spaces.html"]:visible').count()==0
        assert page.locator('nav[aria-label="Primary navigation"] a[href*="version-status.html"]:visible').count()==0
        events.append('Research exposes results immediately with source labels, summaries and outcome badges')
        order=page.locator('main').evaluate("e=>['results','publications','frontier'].map(id=>[...e.children].indexOf(document.getElementById(id)))")
        assert order==sorted(order) and order[0]>=0
        page.screenshot(path=str(args.output/'research-restored-desktop.png'),full_page=True)
        if total>8:
            page.locator('[data-result-more]').click()
            assert page.locator('[data-result-row]:visible').count()==min(16,total)
            assert page.locator('[data-result-row] > summary').nth(8).evaluate('e=>e===document.activeElement')
        page.locator('#results-oeis').click()
        assert page.locator('#results-oeis').get_attribute('aria-pressed')=='true'
        assert all(row.get_attribute('data-collection')=='oeis' for row in page.locator('[data-result-row]:visible').all())
        page.locator('#results-outcome').select_option('refuted')
        assert all(row.get_attribute('data-kind')=='refuted' for row in page.locator('[data-result-row]:visible').all())
        page.locator('#results-query').fill('no-matching-result-0xdeadbeef')
        assert page.locator('[data-result-empty]').is_visible()
        assert page.locator('[data-result-row]:visible').count()==0
        page.locator('[data-clear-search]').click()
        assert page.locator('[data-result-collection="all"]').get_attribute('aria-pressed')=='true'
        assert page.locator('[data-result-row]:visible').count()==min(8,total)
        title=rows.first.locator('summary strong').text_content()
        page.locator('#results-query').fill(title)
        assert rows.first.is_visible()
        rows.first.locator(':scope > summary').click()
        assert rows.first.locator('.news-result').is_visible()
        assert rows.first.locator('.result-statement').is_visible()
        assert rows.first.locator('.result-statement').inner_text().strip()
        page.screenshot(path=str(args.output/'research-result-expanded.png'),full_page=True)
        identity=rows.last.locator('.news-result').get_attribute('id')
        page.goto(base+'research.html?lang=en#'+identity,wait_until='networkidle')
        assert page.locator('[id="'+identity+'"]').is_visible()
        page.goto(base+'research.html?lang=en#resolved-'+identity,wait_until='networkidle')
        assert page.locator('[id="'+identity+'"] .result-statement').is_visible()
        page.goto(base+'research.html?lang=en#results-oeis',wait_until='networkidle')
        assert page.locator('#results-oeis').get_attribute('aria-pressed')=='true'
        # Source intros such as "The OEIS entry states, verbatim:" must include
        # the following quote on the first expansion, not behind another toggle.
        records=json.loads((args.site/'assets/research-news.json').read_text())['results']
        quotations=[r for r in records if r.get('summary','').endswith(':') and '\n\n>' in r.get('scope','')]
        for record in quotations[:2]:
            page.goto(base+'research.html?lang=en#resolved-'+record['id'],wait_until='networkidle')
            card=page.locator('[id="'+record['id']+'"]')
            assert card.locator('.result-statement blockquote').first.is_visible()
            assert not card.locator('details').evaluate('e=>e.open')
        events.append('Full source quotations are visible on first expansion; duplicate archive is absent')
        events.append('Collection/outcome/search filters compose; reset, pagination, keyboard focus and old permalinks work')
        plain=browser.new_context(java_script_enabled=False)
        plain_page=plain.new_page()
        plain_page.goto(base+'research.html?lang=en')
        assert plain_page.locator('[data-result-row]:visible').count()==total
        plain_page.locator('[data-result-row] > summary').last.click()
        assert plain_page.locator('.news-result').last.is_visible()
        plain.close()
        events.append('All source results and their evidence remain accessible without JavaScript')
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
        assert page.locator('.research-activity').count()==0
        assert page.locator('.journey-direction').count()>0
        assert page.locator('#next-questions').bounding_box()['y'] < page.locator('#source-questions').bounding_box()['y']
        page.locator('#source-questions > summary').click()
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
        assert page.locator('#source-questions .research-stats').count()==1
        assert page.locator('#source-questions #open-problems').count()==1
        assert page.locator('.rw-release-browser').count()==0
        assert_readable_text(page)
        page.locator('.rw-directions').screenshot(path=str(args.output/'conjectures-directions-readable.png'))
        page.screenshot(path=str(args.output/'conjectures-notebook-desktop.png'),full_page=True)
        # Arrive from another document: a same-page hash change retains an already opened notebook.
        page.goto(base+'research.html?lang=en',wait_until='networkidle')
        page.goto(base+'conjectures.html?lang=en#next-questions',wait_until='networkidle')
        assert page.locator('#next-questions').is_visible()
        assert page.locator('#research-workbench').count()==0
        assert not page.locator('#research-directions').evaluate('e=>e.open')
        page.locator('#completed-dossiers > summary').click()
        page.locator('#completed-oeis > summary').click()
        assert page.locator('#completed-oeis .reading-item:visible').count()<=12
        link=page.locator('#completed-oeis .reading-item a').first
        link.hover()
        assert link.evaluate('e=>getComputedStyle(e).color')=='rgb(24, 59, 55)'
        page.screenshot(path=str(args.output/'conjectures-archive-desktop.png'),full_page=True)
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
        page.wait_for_selector('#release-content-changes[data-state="ready"]',state='attached',timeout=60000)
        assert page.locator('#evolution-map').bounding_box()['y'] < 320
        assert page.locator('#release-story').bounding_box()['y'] > page.locator('#evolution-map').bounding_box()['y']
        assert not page.locator('#release-story').evaluate('e=>e.open')
        page.locator('#release-story > summary').click()
        # Independently find a real adjacent pair with added source modules.
        library=json.loads((args.site/'data/library-history.v1.json').read_text())['entries']
        architecture=json.loads((args.site/'data/architecture-history.v1.json').read_text())['entries']
        archived={(e['truth_release_digest'],e['atlas_graph_digest']):e for e in library}
        def read_content(entry):
            data=(args.site/entry['path']).read_bytes()
            return json.loads(gzip.decompress(data) if entry['path'].endswith('.gz') else data)
        for target in range(len(architecture)-1,0,-1):
            pair=[archived.get((e['truth_release_digest'],e['atlas_graph_digest'])) for e in architecture[target-1:target+1]]
            if not all(pair):continue
            old,new=map(read_content,pair)
            old_ids={n['id'] for n in old['graph']['nodes'] if n['kind']=='truth'}
            new_ids={n['id'] for n in new['graph']['nodes'] if n['kind']=='truth'}
            if new_ids-old_ids:break
        else:raise AssertionError('Published history has no comparable module additions')
        page.locator('#lineage-release').evaluate("(e,i)=>{e.value=i;e.dispatchEvent(new Event('input',{bubbles:true}))}",target)
        page.wait_for_selector(f'#release-content-changes[data-state="ready"][data-observation="{target}"]',timeout=60000)
        assert int(page.locator('[data-change-count="added"] strong').inner_text())==len(new_ids-old_ids)
        page.locator('[data-change-kind="added"]').click()
        page.wait_for_function("[...document.querySelectorAll('[data-change-record]')].length>0")
        first_change=page.locator('[data-change-record]').first
        changed_id=first_change.get_attribute('data-change-record')
        assert changed_id in new_ids-old_ids
        href=first_change.locator('a').first.get_attribute('href')
        assert 'release/'+new['truth_release_digest'][7:]+'/node/' in href
        page.locator('[data-change-search]').fill('no-matching-change-0xdeadbeef')
        page.wait_for_function("document.querySelector('[data-change-record]')===null")
        assert 'No matches' in page.locator('[data-change-records]').inner_text()
        page.locator('[data-change-search]').fill('')
        page.wait_for_selector('[data-change-record]')
        page.locator('[data-change-record]').first.get_by_role('button',name='Locate on graph').click()
        assert page.evaluate('window.architectureHistoryDiagnostics().selected')==changed_id
        page.locator('#lineage-clear').click()
        # Rapid changes must settle on the last selected pair, even if earlier
        # snapshot requests complete later.
        page.locator('#lineage-release').evaluate("(e,i)=>{for(const n of [i,0,i-1,i]){e.value=n;e.dispatchEvent(new Event('input',{bubbles:true}))}}",target)
        page.wait_for_selector(f'#release-content-changes[data-state="ready"][data-observation="{target}"]',timeout=60000)
        assert int(page.locator('[data-change-count="added"] strong').inner_text())==len(new_ids-old_ids)
        page.screenshot(path=str(args.output/'evolution-release-changes.png'),full_page=True)
        page.locator('#lineage-release').evaluate("(e,i)=>{e.value=i;e.dispatchEvent(new Event('input',{bubbles:true}))}",before['observation'])
        page.wait_for_selector(f'#release-content-changes[data-state="ready"][data-observation="{before["observation"]}"]',timeout=60000)
        events.append('Exact adjacent release content yields readable counts, module explanations, pinned links, filters and synchronized graph selection')
        page.screenshot(path=str(args.output/'evolution-restored-desktop.png'),full_page=True)
        page.locator('#release-story > summary').click()
        page.locator('#evolution-detail .architecture-rank').first.click()
        page.wait_for_function("document.querySelector('.group-explanation') && !document.querySelector('.group-explanation').textContent.startsWith('Loading')")
        assert page.locator('.group-connections').count()==2
        assert page.locator('#lineage-group .group-module').count()>0
        page.screenshot(path=str(args.output/'evolution-selected-desktop.png'),full_page=True)
        events.append('Selection shows sourced examples, a release-bound explanation and prerequisite/consumer groups')
        selected_before=page.evaluate('window.architectureHistoryDiagnostics().selected')
        page.locator('[data-lineage="time"]').click()
        assert page.evaluate('window.architectureHistoryDiagnostics().mode')=='time'
        assert '→' in page.locator('#release-comparison').inner_text()
        page.locator('#previous-observation').click()
        assert page.evaluate('window.architectureHistoryDiagnostics().observation')==before['observation']-1
        assert page.evaluate('window.architectureHistoryDiagnostics().selected')==selected_before
        page.wait_for_function('Number(document.querySelector(".architecture-scrubber").value) === window.architectureHistoryDiagnostics().observation')
        assert page.locator('.architecture-observation strong').inner_text().startswith('Observation '+str(before['observation']))
        page.locator('.architecture-scrubber').press('ArrowLeft')
        page.wait_for_function('Number(document.querySelector(".architecture-scrubber").value) === Number(document.querySelector("#lineage-release").value)')
        page.screenshot(path=str(args.output/'evolution-time-comparison.png'),full_page=True)
        page.locator('#show-changes').uncheck()
        page.locator('#show-changes').check()
        page.locator('[data-lineage="dependency"]').click()
        page.locator('#lineage-release').evaluate("e=>{e.value=0;e.dispatchEvent(new Event('input',{bubbles:true}))}")
        assert page.evaluate('window.architectureHistoryDiagnostics().observation')==0
        assert 'baseline' in page.locator('#release-change-summary').inner_text().lower()
        page.wait_for_function("document.querySelector('#release-content-changes').dataset.state!=='loading'")
        assert page.locator('button[data-change-count]:visible').count()==0
        assert page.locator('#release-content-changes').get_attribute('data-state') in ('ready','unavailable')
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
        # A corrupt Library artifact must never turn into zero changes, and a
        # retry must evict the failed request instead of caching failure forever.
        latest_path=library[-1]['path']
        isolated=browser.new_context()
        unavailable=isolated.new_page()
        unavailable.on('pageerror',lambda e:errors.append(str(e)))
        unavailable.route('**/'+latest_path,lambda route:route.fulfill(status=200,body='corrupt snapshot'))
        unavailable.goto(base+'evolution.html?lang=en',wait_until='networkidle')
        unavailable.wait_for_selector('#release-content-changes[data-state="unavailable"]',state='attached',timeout=60000)
        unavailable.locator('#release-story > summary').click()
        assert unavailable.locator('button[data-change-count]:visible').count()==0
        assert unavailable.locator('#evolution-map canvas').count()==1
        unavailable.unroute('**/'+latest_path)
        unavailable.get_by_role('button',name='Retry comparison').click()
        unavailable.wait_for_selector('#release-content-changes[data-state="ready"]',timeout=60000)
        isolated.close()
        events.append('Corrupt content fails visibly without blocking the graph; retry recovers after the artifact is available')
        page.goto(base+'spaces.html?lang=en',wait_until='domcontentloaded')
        page.wait_for_url('**/atlas.html?lang=en#*',timeout=30000)
        assert page.locator('#spaces-compare').count()==0
        events.append('Legacy Spaces opens the existing Atlas rather than comparing web sources with internal knowledge')
        for name in ['research','conjectures','evolution']:
            page.set_viewport_size({'width':390,'height':844})
            page.goto(base+name+'.html?lang=en',wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),name
            page.screenshot(path=str(args.output/(name+'-restored-mobile.png')),full_page=True)
            if name=='conjectures':
                page.locator('#research-directions > summary').click()
                page.wait_for_selector('.rw-next-step')
                assert_readable_text(page)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
                page.locator('.rw-directions').screenshot(path=str(args.output/'conjectures-directions-mobile.png'))
        events.append('Conjectures direction text meets 4.5:1 contrast with readable sizes on desktop and mobile')
        events.append('Restored pages fit a 390px viewport')
        browser.close()
    server.shutdown()
    report={'scenarios':events,'page_errors':errors,'transport':'native-local-http','modules':'native-esm',
        'inputs':json.loads((args.site/'preview-inputs.json').read_text()),'deployed':False}
    (args.output/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
    if errors:raise AssertionError(errors)
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
