"""Exercise the guided route's spatial continuity, navigation and fallbacks."""
import re


def check_guided_journey(page, base, output):
    page.set_viewport_size({'width':1440,'height':1000})
    page.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
    page.wait_for_selector('[data-route-enhanced]')
    active=page.locator('[data-guided-route]:visible')
    assert active.count()==1
    assert page.locator('[data-route-choice]').count()==3
    for node in active.locator('.route-node').all():
        colors=node.evaluate("e=>({bg:getComputedStyle(e).backgroundColor,text:getComputedStyle(e.querySelector('small')).color})")
        def lum(rgb):
            values=[int(n)/255 for n in re.findall(r'\d+',rgb)[:3]]
            return sum((v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)*w for v,w in zip(values,[.2126,.7152,.0722]))
        a,b=lum(colors['bg']),lum(colors['text'])
        assert a>.7,colors
        assert (max(a,b)+.05)/(min(a,b)+.05)>=4.5,colors
    active.locator('.route-visual').scroll_into_view_if_needed()
    page.screenshot(path=str(output/'guided-route-desktop.png'))
    for choice in page.locator('[data-route-choice]').all():
        choice.click()
        assert active.count()==1
        assert active.get_attribute('id')==choice.get_attribute('data-route-choice')
        assert active.locator('.route-connections path').count()==4
        before=active.locator('.route-map').evaluate('e=>[...e.querySelectorAll(".route-node")].map(n=>({x:n.offsetLeft,y:n.offsetTop}))')
        for stage in (1,2,0):
            active.locator(f'[data-route-step="{stage}"]').click()
            page.wait_for_function('(stage)=>document.querySelector("[data-guided-route]:not([hidden])").dataset.readingStage===String(stage)',arg=stage)
            assert active.locator('.route-map').evaluate('e=>[...e.querySelectorAll(".route-node")].map(n=>({x:n.offsetLeft,y:n.offsetTop}))')==before
            assert all(path.evaluate('e=>getComputedStyle(e).strokeDasharray')!='none' for path in active.locator('.route-connections path').all())
        # Native scrolling must move the reading emphasis as well as the buttons.
        active.locator('[data-route-chapter="1"]').evaluate('e=>e.scrollIntoView({block:"center"})')
        page.wait_for_function('document.querySelector("[data-guided-route]:not([hidden])").dataset.readingStage==="1"')
        proof=active.locator('[data-route-chapter="0"] > a').get_attribute('href')
        assert page.request.get(proof if proof.startswith('http') else base+proof).ok
    page.locator('[data-route-choice]').first.click()
    active.locator('[data-route-step="1"]').click()
    page.screenshot(path=str(output/'guided-route-contribute.png'))
    # Route selection survives an exact permalink reload.
    page.locator('[data-route-choice]').last.click()
    route_id=active.get_attribute('id')
    page.reload(wait_until='networkidle')
    assert active.get_attribute('id')==route_id
    assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(247, 248, 250)'
    assert not re.search(r'[\u3400-\u9fff]',page.locator('.research-journey').inner_text())
    for width in (390,320,768):
        page.set_viewport_size({'width':width,'height':900})
        page.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
        for stage in (1,2,0):
            active.locator(f'[data-route-step="{stage}"]').click()
            assert active.locator('[data-route-chapter]:visible').count()==1
            assert active.locator(f'[data-route-chapter="{stage}"]').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
        assert all(n.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=17 for n in active.locator('.route-node strong').all())
        active.locator('[data-route-node="target-0"]').click()
        assert active.locator('.route-target-detail').first.get_attribute('open') is not None
        assert active.locator('.route-focus').evaluate('e=>getComputedStyle(e).transitionDuration')=='0s'
        if width==390:
            active.locator('.route-visual').scroll_into_view_if_needed()
            page.screenshot(path=str(output/'guided-route-mobile.png'))
    # A direct chapter URL selects its route and stage on a narrow screen.
    page.goto(base+'conjectures.html?lang=en#direction-pochhammer-higher-even-intervals-horizon',wait_until='networkidle')
    assert active.get_attribute('id')=='direction-pochhammer-higher-even-intervals'
    assert active.get_attribute('data-reading-stage')=='2'
    assert active.locator('[data-route-chapter]:visible').count()==1
    page.goto(base+'conjectures.html?lang=zh-CN',wait_until='networkidle')
    assert page.locator('#next-questions-title').inner_text()=='从具体问题出发，建立更深的联系。'
    assert active.locator('[data-route-step="1"]').inner_text().endswith('贡献入口')
    # Check the actual moving frame as well as reduced-motion geometry.
    page.emulate_media(reduced_motion='no-preference')
    active.locator('[data-route-step="0"]').click()
    page.wait_for_timeout(750)
    start=active.locator('.route-focus').bounding_box()
    active.locator('[data-route-step="1"]').click()
    page.wait_for_timeout(200)
    middle=active.locator('.route-focus').bounding_box()
    page.wait_for_timeout(600)
    end=active.locator('.route-focus').bounding_box()
    assert start['y']!=middle['y'] and middle['y']!=end['y']
    page.emulate_media(reduced_motion='reduce')
    # Without scripts, proof and question links still work in every direction.
    offline=page.context.browser.new_context(java_script_enabled=False,viewport={'width':1000,'height':900})
    fallback=offline.new_page();fallback.goto(base+'conjectures.html?lang=en')
    assert fallback.locator('[data-guided-route]:visible').count()==3
    assert fallback.locator('.route-chapter:visible').count()==9
    offline.close()
    page.set_viewport_size({'width':1440,'height':1000})
