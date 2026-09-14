"""Whole-catalog coverage, strategy-only edges and a reachable full collection."""
import json
import re


def check_guided_journey(page, base, output):
    page.set_viewport_size({'width':1440,'height':1000})
    page.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
    page.wait_for_selector('.story-ready')
    root=page.locator('.research-journey')
    data=json.loads(page.locator('#research-story-data').text_content())
    catalog=page.request.get(base+'assets/research-catalog.json').json()
    fields={f['area'] for f in catalog['families']}
    assert {n['label'] for n in data['nodes'] if n['kind']=='field'}==fields
    assert root.locator('.story-directory .journey-direction').count()==len(catalog['families'])
    assert page.locator('#source-questions').get_attribute('open') is not None
    for family in catalog['families']:
        assert root.locator('[id="direction-'+family['id']+'"]').count()==1
    assert root.locator('.story-node[data-kind=field]:visible').count()==len(fields)
    assert root.locator('[data-node=source-oeis]').is_visible()
    assert root.locator('[data-node=source-erdos]').is_visible()
    assert 'Current focus: OEIS and Erdős' in root.locator('[data-scene-copy="0"]').inner_text()
    assert all(e['source'].startswith('source-') or e['source'] in {'precise','general','representations','transfer'} for e in data['edges'])
    page.screenshot(path=str(output/'conjectures-introduction-desktop.png'))
    # Every topic reveals the actual questions it contains.
    for button in root.locator('.story-node[data-kind=field]').all():
        button.focus();page.keyboard.press('Enter')
        assert root.locator('dialog[open]').count()==1
        for link in root.locator('.story-detail-links a').all():
            assert page.locator('[id="'+link.get_attribute('href')[1:]+'"]').count()==1
        page.keyboard.press('Escape')
    root.locator('[data-node=source-erdos]').click()
    assert str(data['source_counts'].get('erdos',0))+' source dossiers' in root.locator('.story-detail-scope').inner_text()
    page.keyboard.press('Escape')
    positions=[]
    for i,key in enumerate(['questions','proofs','bridges','horizons']):
        root.locator(f'[data-scene-link="{i}"]').click()
        page.wait_for_function('(i)=>document.querySelector(".story-stage").dataset.scene===String(i)',arg=i)
        assert root.locator('.story-copy:visible').count()==1
        positions.append(root.locator('[data-node=precise]').evaluate('e=>getComputedStyle(e).transform'))
        page.screenshot(path=str(output/f'story-{key}-desktop.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert all(e.evaluate('e=>getComputedStyle(e).strokeDasharray')!='none' for e in root.locator('.story-edges path').all())
    assert len(set(positions))>=3
    root.locator('[data-node=understanding]').click()
    assert root.locator('.story-detail-status').inner_text()=='Research objective'
    page.keyboard.press('Escape')
    root.locator('[data-scene-link="2"]').click()
    page.reload(wait_until='networkidle')
    page.wait_for_function('document.querySelector(".story-stage").dataset.scene==="2"')
    assert not re.search(r'[\u3400-\u9fff]',root.inner_text())
    # Navigation is to the full catalogue, with all question links retained.
    root.locator('.story-shortcuts a').first.click()
    assert page.locator('#research-paths').is_visible()
    page.screenshot(path=str(output/'full-catalogue-desktop.png'))
    for width in [390,320,768]:
        page.set_viewport_size({'width':width,'height':1000})
        page.goto(base+'conjectures.html?lang=en#story-questions',wait_until='networkidle')
        for i in range(4):
            root.locator(f'[data-scene-link="{i}"]').click()
            page.wait_for_function('(i)=>document.querySelector(".story-stage").dataset.scene===String(i)',arg=i)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
            boxes=[b.bounding_box() for b in root.locator('.story-node:visible').all()]
            for j,box in enumerate(boxes):
                assert box['x']>=-1 and box['x']+box['width']<=width+1,(width,box)
                for other in boxes[j+1:]:
                    overlap_x=min(box['x']+box['width'],other['x']+other['width'])-max(box['x'],other['x'])
                    overlap_y=min(box['y']+box['height'],other['y']+other['height'])-max(box['y'],other['y'])
                    assert overlap_x<=1 or overlap_y<=1,(width,i,box,other)
            if width==390:page.screenshot(path=str(output/f'story-{i}-mobile.png'))
    page.set_viewport_size({'width':1440,'height':1000})
    page.emulate_media(reduced_motion='no-preference')
    page.goto(base+'conjectures.html?lang=en#story-questions',wait_until='networkidle')
    samples=page.evaluate("""async()=>{
      const node=document.querySelector('[data-node=source-oeis]'),values=[getComputedStyle(node).transform],started=performance.now();
      const e=document.querySelector('.story-scroll');
      scrollTo(0,e.getBoundingClientRect().top+scrollY+(e.offsetHeight-document.querySelector('.story-stage').offsetHeight)/3);
      return await new Promise(resolve=>{function sample(){values.push(getComputedStyle(node).transform);if(performance.now()-started>1000)resolve(values);else requestAnimationFrame(sample);}requestAnimationFrame(sample);});
    }""")
    assert len(set(samples))>2
    page.emulate_media(reduced_motion='reduce')
    page.goto(base+'conjectures.html?lang=zh-CN#story-bridges',wait_until='networkidle')
    assert root.locator('[data-scene-copy="2"] h2').inner_text()=='连接不同的表示'
    offline=page.context.browser.new_context(java_script_enabled=False)
    fallback=offline.new_page();fallback.goto(base+'conjectures.html?lang=en')
    assert fallback.locator('.story-directory .journey-direction:visible').count()==len(catalog['families'])
    assert fallback.locator('#source-questions').get_attribute('open') is not None
    offline.close()


def check_journey_loading(page, base, output):
    """Loading failures must leave useful content, never an empty sticky stage."""
    browser=page.context.browser
    for failure in ('journey', 'i18n', 'gsap', 'data', 'no-js'):
        context=browser.new_context(viewport={'width':1440,'height':1000},java_script_enabled=failure!='no-js',reduced_motion='reduce')
        probe=context.new_page()
        if failure in ('journey','i18n','gsap'):
            pattern={'journey':'**/research-journey.mjs*','i18n':'**/i18n.mjs*','gsap':'**/vendor/*gsap*'}[failure]
            context.route(pattern,lambda route:route.abort())
        if failure=='data':
            def incompatible_data(route):
                response=route.fetch()
                # Simulate a cached page from a different map schema.
                route.fulfill(response=response,body=response.text().replace('"field_count":', '"old_field_count":'))
            context.route('**/conjectures.html*',incompatible_data)
        probe.goto(base+'conjectures.html?lang=en',wait_until='networkidle')
        if failure in ('journey','data','no-js'):
            assert probe.locator('.story-ready').count()==0
            data=json.loads(probe.locator('#research-story-data').text_content())
            assert probe.locator('.story-node[data-kind=field]:visible').count()==sum(n['kind']=='field' for n in data['nodes'])
            assert probe.locator('.story-scroll').bounding_box()['height']<1200
            probe.locator('[data-node=field-sequence-complexity]').click()
            assert '#direction-' in probe.url
            for width in (320,390,1440):
                probe.set_viewport_size({'width':width,'height':1000})
                assert probe.evaluate('document.documentElement.scrollWidth<=innerWidth')
            probe.locator('.story-map').scroll_into_view_if_needed()
            probe.screenshot(path=str(output/f'story-fallback-{failure}.png'))
        else:
            probe.wait_for_selector('.story-ready')
            probe.locator('[data-scene-link="2"]').click()
            probe.wait_for_function('document.querySelector(".story-stage").dataset.scene==="2"')
            assert probe.locator('[data-node=representations]').is_visible()
            probe.reload(wait_until='networkidle')
            probe.wait_for_function('document.querySelector(".story-stage").dataset.scene==="2"')
            assert probe.locator('[data-node=representations]').is_visible()
        context.close()
    # Normal restored scroll and browser Back must also have an actual graph.
    page.goto(base+'conjectures.html?lang=en#story-horizons',wait_until='networkidle')
    page.wait_for_function('document.querySelector(".story-stage").dataset.scene==="3"')
    page.goto(base+'research.html?lang=en',wait_until='networkidle')
    page.go_back(wait_until='networkidle')
    page.wait_for_function('document.querySelector(".story-stage").dataset.scene==="3"')
    assert page.locator('[data-node=understanding]').is_visible()
