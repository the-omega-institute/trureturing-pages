"""Render the bilingual deck and exercise its public reading/presentation controls.

Usage: python tests/browser/open_math_deck.py --output /tmp/open-math-review
Uses a temporary HTTP server and an isolated headless Chrome profile.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'site')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/open-math.html'
    report, errors, layout_errors = [], [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome', headless=True)
            for lang in ['en', 'zh-CN']:
                page = browser.new_page(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(f'{base}?lang={lang}', wait_until='networkidle')
                assert page.locator('html').get_attribute('lang') == lang
                assert page.locator('body').get_attribute('data-mode') == 'present'
                assert page.locator('.deck-slide:visible').count() == 1
                count = page.locator('.deck-slide').count()
                assert count == 12
                for i in range(count):
                    page.locator('#deck-jump').select_option(str(i))
                    assert page.locator('#deck-counter').inner_text() == f'{i+1} / {count}'
                    assert page.url.endswith(f'#s{i+1}')
                    slide = page.locator(f'#s{i+1}')
                    # Screen geometry catches clipped children even if the stage has overflow:clip.
                    overflow = slide.evaluate('''s => {
                      const box=s.getBoundingClientRect();
                      return [...s.querySelectorAll('h1,h2,h3,p,figure,table,li,.evidence-links,.cover-bottom,.scope-grid')]
                        .filter(e=>e.getClientRects().length && !e.closest('.deck-notes'))
                        .filter(e=>{const r=e.getBoundingClientRect();return r.bottom>box.bottom-12 || r.right>box.right+1 || r.left<box.left-1;})
                        .map(e=>e.tagName+': '+e.textContent.slice(0,100));
                    }''')
                    if overflow:
                        layout_errors.append((lang, i+1, overflow))
                    page.screenshot(path=str(args.output / f'{lang}-{i+1:02}.png'))
                page.locator('#deck-jump').select_option('0')
                page.locator('#deck-jump').blur()
                page.keyboard.press('ArrowRight')
                assert page.locator('#deck-counter').inner_text() == '2 / 12'
                page.locator('#deck-notes-toggle').click()
                assert page.locator('#deck-notes-panel').is_visible()
                assert page.locator('#deck-notes-panel').inner_text().strip()
                page.locator('#deck-notes-toggle').click()
                page.locator('#deck-read-toggle').click()
                assert page.locator('.deck-slide:visible').count() == 12
                page.locator('#deck-next').click()
                assert page.locator('#deck-counter').inner_text() == '3 / 12'
                page.locator('#deck-prev').click()
                assert page.locator('#deck-counter').inner_text() == '2 / 12'
                page.locator('#deck-jump').select_option('5')
                assert abs(page.locator('#s6').bounding_box()['y']-78) < 5
                page.locator('#deck-read-toggle').click()
                assert page.locator('#s6').is_visible()
                assert page.locator('#deck-counter').inner_text() == '6 / 12'
                # Standard presentation size remains readable and completely contained.
                page.set_viewport_size({'width': 1024, 'height': 768})
                page.wait_for_function("() => { const r = document.querySelector('#s6').getBoundingClientRect(); return r.x >= 0 && r.y >= 63 && r.bottom <= 707; }")
                rect=page.locator('#s6').bounding_box()
                assert rect['x'] >= 0 and rect['y'] >= 63 and rect['y']+rect['height'] <= 707
                # Printing must include every slide even from presentation mode.
                page.emulate_media(media='print')
                assert page.locator('.deck-slide:visible').count() == 12
                # Shared PDFs must point to the public site, never this ephemeral server.
                page.evaluate('''() => {
                  const root = 'https://the-omega-institute.github.io/trureturing-pages/';
                  for (const a of document.querySelectorAll('.deck a[href]')) {
                    const u = new URL(a.href);
                    if (u.origin === location.origin)
                      a.href = root + u.pathname.slice(1) + u.search + u.hash;
                  }
                }''')
                assert page.locator('.deck a[href^="http://127.0.0.1"]').count() == 0
                page.pdf(path=str(args.output / f'trureturing-open-math-{lang}.pdf'), prefer_css_page_size=True, print_background=True)
                page.close()
                mobile = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
                mobile.goto(f'{base}?lang={lang}', wait_until='networkidle')
                assert mobile.locator('body').get_attribute('data-mode') == 'read'
                assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
                for i in [0,4,5,8,9]:
                    mobile.locator(f'#s{i+1}').screenshot(path=str(args.output / f'{lang}-mobile-{i+1:02}.png'))
                mobile.close()
                report.append(f'{lang}: 12 slides, navigation, notes, reading position, 1024px presentation, 390px reading and print')
            plain = browser.new_context(java_script_enabled=False, viewport={'width':390,'height':844})
            page = plain.new_page()
            page.goto(base)
            assert page.locator('.deck-slide:visible').count() == 12
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.locator('#deck-print').is_hidden()
            plain.close()
            assert not errors, errors
            assert not layout_errors, layout_errors
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    (args.output / 'verification.json').write_text(json.dumps({'checks':report,'browser_errors':errors},indent=2)+'\n')
    print('\n'.join(report))
    print('No-JavaScript reading passes; no browser errors.')


if __name__ == '__main__':
    main()
