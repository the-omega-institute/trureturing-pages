"""Real-release acceptance and matched cold-start measurements for the homepage.

Run against a local site prepared with the existing startup builder. The optional
baseline origin must serve the same release through the previous Atlas frontend.
"""
import argparse
import json
from pathlib import Path
from statistics import median
from playwright.sync_api import sync_playwright


def measure(browser, origin, foundation, throttled=False):
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    page = context.new_page()
    if throttled:
        session = context.new_cdp_session(page)
        session.send("Network.enable")
        session.send("Network.emulateNetworkConditions", {
            "offline": False, "latency": 100, "downloadThroughput": 625000,
            "uploadThroughput": 625000, "connectionType": "cellular4g",
        })
    page.goto(origin + "atlas.html?lang=en", wait_until="domcontentloaded")
    page.wait_for_function("window.foundationDiagnostics?.().ready" if foundation else
                           "window.atlasDiagnostics && document.querySelector('#loading').hidden", timeout=90000)
    result = page.evaluate("""() => ({
      readyMs: (window.foundationDiagnostics?.().timing || window.atlasDiagnostics().startup).readyMs,
      resources: performance.getEntriesByType('resource').map(r => ({path:new URL(r.name).pathname,
        transferBytes:r.transferSize,decodedBytes:r.decodedBodySize,durationMs:r.duration})),
      timing:window.foundationDiagnostics?.().timing || window.atlasDiagnostics().startup,
    })""")
    context.close()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--before-origin")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    origin = args.origin.rstrip('/') + '/'
    report = {"checks": [], "benchmarks": {}}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        errors, requests = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r.url))
        page.goto(origin + 'atlas.html?lang=en')
        page.wait_for_function('window.foundationDiagnostics?.().ready')
        initial = page.evaluate('window.foundationDiagnostics()')
        assert initial['totalNodes'] > 1000
        assert initial['shownNodes'] and initial['shownEdges']
        assert not any('architecture-history' in u or 'library-history' in u or '3d-force-graph' in u or 'research-news.json' in u for u in requests)
        assert len([u for u in requests if '/data/' in u]) == 3
        page.screenshot(path=str(args.output/'foundations-desktop.png'), full_page=True)
        report['checks'].append('Default homepage: verified compact data; no full graph, layout, research archive or history downloads')

        page.locator('.foundation-ranking .foundation-row').first.click()
        selected = page.evaluate('window.foundationDiagnostics().selected')
        assert selected
        assert page.get_by_role('link', name='Lean source', exact=True).get_attribute('href').endswith(selected + '.lean')
        assert '/blob/' in page.get_by_role('link', name='Lean source', exact=True).get_attribute('href')
        page.get_by_role('button').filter(has=page.get_by_text('Show dependency path', exact=False)).first.click()
        traced = page.evaluate('window.foundationDiagnostics()')
        assert len(traced['path']) >= 2 and traced['path'][0] == selected
        assert all([a,b] in traced['shownEdges'] for a,b in zip(traced['path'],traced['path'][1:]))
        page.screenshot(path=str(args.output/'foundations-path.png'), full_page=True)
        path_url = page.url
        page.reload(); page.wait_for_function('window.foundationDiagnostics?.().target')
        assert page.evaluate('window.foundationDiagnostics().path') == traced['path']
        page.get_by_role('button', name='Back to the shared core', exact=True).click()
        page.get_by_role('button', name='Starting points', exact=True).click()
        assert page.evaluate('window.foundationDiagnostics().mode') == 'roots'
        page.get_by_role('button', name='Direct reuse', exact=True).click()
        assert page.evaluate('window.foundationDiagnostics().mode') == 'direct'
        report['checks'].append('Selection, pinned Lean source, exact shortest path, deep-link reload and perspective switches')

        page.locator('#foundation-query').fill(selected)
        page.locator('#foundation-search-results .foundation-row').first.click()
        assert page.evaluate('window.foundationDiagnostics().selected') == selected
        page.locator('#foundation-query').fill('no-such-module-0xdeadbeef')
        assert page.locator('#foundation-search-results .foundation-row').count() == 0
        page.locator('#foundation-query').press('Escape')
        assert page.locator('#foundation-search-results').is_hidden()
        page.set_viewport_size({'width':390,'height':844})
        page.goto(path_url)
        page.wait_for_function('window.foundationDiagnostics?.().target')
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        page.screenshot(path=str(args.output/'foundations-mobile.png'), full_page=True)
        page.goto(origin+'atlas.html?lang=zh-CN')
        page.wait_for_function('window.foundationDiagnostics?.().ready')
        assert page.get_by_role('button',name='共享基础',exact=True).is_visible()
        assert '由此生长' in page.locator('h1').inner_text()
        page.screenshot(path=str(args.output/'foundations-mobile-zh.png'),full_page=True)
        report['checks'].append('Full-corpus search, empty search, Escape, Chinese interface and mobile overflow')

        # Old shared links retain their module selection in the original full explorer.
        page.set_viewport_size({'width':1440,'height':1000})
        requests.clear()
        page.goto(origin+'atlas.html?lang=en#mode=dependency&node='+selected)
        page.wait_for_function('window.atlasDiagnostics?.().selected',timeout=90000)
        assert '/atlas-explorer.html?' in page.url
        assert page.evaluate('window.atlasDiagnostics().selected') == selected
        assert not any('architecture-history' in u or 'library-history' in u for u in requests)
        report['checks'].append('Legacy Atlas link retains selection; full explorer also defers history and research')

        # Fail closed and retry, without replacing verification with a plausible map.
        page.route('**/data/atlas-startup/*.json.gz',lambda route:route.fulfill(status=200,body=b'corrupt'))
        page.goto(origin+'atlas.html?lang=en')
        page.get_by_role('button',name='Retry',exact=True).wait_for()
        assert page.locator('#foundation-map svg').count() == 0
        page.unroute('**/data/atlas-startup/*.json.gz')
        page.get_by_role('button',name='Retry',exact=True).click()
        page.wait_for_function('window.foundationDiagnostics?.().ready')
        report['checks'].append('Corrupted immutable artifact is rejected; retry restores the verified view')
        assert not errors, errors
        page.close()

        for name, target, foundation in [('after',origin,True)] + ([('before',args.before_origin.rstrip('/')+'/',False)] if args.before_origin else []):
            samples=[measure(browser,target,foundation) for _ in range(3)]
            slow=measure(browser,target,foundation,True)
            report['benchmarks'][name]={'cold_samples':samples,'median_ready_ms':median(x['readyMs'] for x in samples),
                'network_profile':{'download_bits_per_second':5000000,'latency_ms':100},'throttled':slow}
        browser.close()
    (args.output/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'checks':report['checks'],'timing':{k:{'median_ms':v['median_ready_ms'],'5mbps_ms':v['throttled']['readyMs']} for k,v in report['benchmarks'].items()}},indent=2))


if __name__ == '__main__':
    main()
