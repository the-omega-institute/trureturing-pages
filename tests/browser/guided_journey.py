"""Full-page research narrative: real geometry, evidence links and fallbacks."""
import json
import re


def check_guided_journey(page, base, output):
    page.set_viewport_size({'width':1440,'height':1000})
    page.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
    page.wait_for_selector('.story-ready')
    root=page.locator('.research-journey')
    data=json.loads(page.locator('#research-story-data').text_content())
    assert len(data['areas'])==3
    assert len(data['nodes'])==21
    assert root.locator('.story-edges path[data-kind="proposed"]').count()==12
    assert root.locator('.story-edges path[data-kind="outline"]').count()==9
    positions=[]
    for i,key in enumerate(['questions','proofs','bridges','horizons']):
        root.locator(f'[data-scene-link="{i}"]').click()
        page.wait_for_function('(i)=>document.querySelector(".story-stage").dataset.scene===String(i)',arg=i)
        page.wait_for_timeout(150)
        assert root.locator('.story-copy:visible').count()==1
        assert root.locator(f'[data-scene-copy="{i}"]').is_visible()
        positions.append(root.locator('.story-node[data-kind="result"]').first.evaluate('e=>getComputedStyle(e).transform'))
        page.screenshot(path=str(output/f'story-{key}-desktop.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert all(e.evaluate('e=>getComputedStyle(e).strokeDasharray')!='none' for e in root.locator('.story-edges path[data-kind="proposed"]').all())
    assert len(set(positions))==4
    root.locator('[data-scene-link="1"]').click()
    page.wait_for_function('document.querySelector(".story-stage").dataset.scene==="1"')
    for node in root.locator('.story-node[data-kind="result"]').all():
        node.focus();page.keyboard.press('Enter')
        assert root.locator('dialog[open]').count()==1
        href=root.locator('.story-detail-link').get_attribute('href')
        assert page.request.get(href if href.startswith('http') else base+href).ok
        assert root.locator('.story-detail-scope').inner_text()
        page.keyboard.press('Escape')
        assert root.locator('dialog[open]').count()==0
    root.locator('[data-scene-link="2"]').click()
    page.wait_for_function('document.querySelector(".story-stage").dataset.scene==="2"')
    root.locator('.story-node[data-kind="target"]').first.click()
    assert root.locator('.story-scope-heading').inner_text()=='Success means'
    assert '#rp=' in root.locator('.story-detail-link').get_attribute('href')
    page.keyboard.press('Escape')
    page.reload(wait_until='networkidle')
    page.wait_for_function('document.querySelector(".story-stage").dataset.scene==="2"')
    assert not re.search(r'[\u3400-\u9fff]',root.inner_text())
    for width in [390,320,768]:
        page.set_viewport_size({'width':width,'height':900})
        page.goto(base+'conjectures.html?lang=en#story-questions',wait_until='networkidle')
        for i in range(4):
            root.locator(f'[data-scene-link="{i}"]').click()
            page.wait_for_function('(i)=>document.querySelector(".story-stage").dataset.scene===String(i)',arg=i)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
            if width==390:
                page.screenshot(path=str(output/f'story-{i}-mobile.png'))
        for button in root.locator('.story-node:visible').all():
            box=button.bounding_box()
            assert box['x']>=0 and box['x']+box['width']<=width+1,(width,box)
    page.set_viewport_size({'width':1440,'height':1000})
    page.emulate_media(reduced_motion='no-preference')
    page.goto(base+'conjectures.html?lang=en#story-questions',wait_until='networkidle')
    node=root.locator('.story-node[data-kind="result"]').first
    start=node.evaluate('e=>getComputedStyle(e).transform')
    page.evaluate('()=>{const e=document.querySelector(".story-scroll");scrollTo(0,e.getBoundingClientRect().top+scrollY+(e.offsetHeight-document.querySelector(".story-stage").offsetHeight)/3)}')
    page.wait_for_timeout(140)
    mid=node.evaluate('e=>getComputedStyle(e).transform')
    page.wait_for_timeout(850)
    end=node.evaluate('e=>getComputedStyle(e).transform')
    assert start!=mid and mid!=end
    page.emulate_media(reduced_motion='reduce')
    page.goto(base+'conjectures.html?lang=zh-CN#story-bridges',wait_until='networkidle')
    assert root.locator('[data-scene-copy="2"] h2').inner_text()=='现在，看看\n还缺少什么。'
    offline=page.context.browser.new_context(java_script_enabled=False)
    fallback=offline.new_page();fallback.goto(base+'conjectures.html?lang=en')
    assert fallback.locator('.story-directory .journey-direction:visible').count()==3
    assert fallback.locator('.story-directory-links a').count()==9
    offline.close()
