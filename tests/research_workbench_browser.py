"""Offline Chromium DOM smoke, using catalog-fetch and storage doubles.

The real DOM/filter/notebook code and CSS are exercised. Asset resolution is
adapted for an offline fixture. Native storage, production networking and the
full release-bound site are not tested. Requires Playwright and Chromium.
"""
from __future__ import annotations
import argparse
import base64
import html
import json
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    assets = Path(__file__).resolve().parents[1] / "site/assets"
    catalog = json.loads((assets / "research-catalog.json").read_text())
    total = sum(1 + len(f["targets"]) for f in catalog["families"])
    legacy = [f for f in catalog["families"] if "source" not in f]
    css = (assets / "research-workbench.css").read_text()
    core = (assets / "research-workbench-core.mjs").read_text().replace("export ", "")
    ui = (assets / "research-workbench.mjs").read_text()
    # Remove the static import only; core declarations are loaded in the same fixture.
    ui = "const el" + ui.split("const el", 1)[1]
    ui = ui.replace("export ", "").replace("import.meta.url", '"https://workbench.test/project/assets/research-workbench.mjs"')
    ui = ui.replace('new URL("./research-workbench.css", "https://workbench.test/project/assets/research-workbench.mjs").href',
                    json.dumps("data:text/css;base64," + base64.b64encode(css.encode()).decode()))
    rows = "".join(f'<a class="problem-row" href="https://workbench.test/project/research/{f["id"]}/">{html.escape(f["title"])}</a>' for f in legacy)
    fixture = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Research fixture</title>
<style>body{background:#090c10;color:#edf3f7;font:16px/1.5 system-ui;margin:0;padding:24px}
main{max-width:1200px;margin:auto}h1{font-size:42px}a{color:#acd7ee}.problem-row{display:block}
*{box-sizing:border-box}</style></head><body><main class="research-home">
<header><p>THE OMEGA INSTITUTE / RESEARCH FRONTIER</p><h1>Research</h1></header>
<div class="research-stats">Fixture release metadata</div><div class="research-browser">''' + rows + "</div></main></body></html>"
    key = "trureturing.pages.research-notes.v1"
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.chromium, headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width":1440,"height":1100}, accept_downloads=True)
        errors = []

        def mount(saved=None, failure=False, denied=False):
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.set_content(fixture)
            page.evaluate('''({catalog,saved,failure,denied}) => {
              window.__memory = saved || {};
              window.fetch = async () => { if(failure)throw new Error('fixture catalog failure');
                return new Response(JSON.stringify(catalog),{status:200}); };
              Object.defineProperty(window,'localStorage',{value:{
                getItem:key=>window.__memory[key] || null,
                setItem:(key,value)=>{if(denied)throw new Error('fixture storage denial');window.__memory[key]=value;}
              },configurable:true});
            }''', {"catalog":catalog,"saved":saved,"failure":failure,"denied":denied})
            page.add_script_tag(content=core + "\n" + ui + "\nwindow.mountFixture = mountResearchWorkbench;")
            result = page.evaluate("async()=>{try{await mountFixture();return 'ok';}catch(error){return error.message;}}")
            if result == "ok":
                page.locator("#research-bank > summary").click()
                page.locator(".rw-advanced > summary").click()
            return page, result

        page, result = mount()
        assert result == "ok", result
        expect(page.locator(".rw-card")).to_have_count(total)
        expect(page.locator("#research-release-dossiers .problem-row")).to_have_count(len(legacy))
        page.locator("#rw-literature").select_option("new")
        expect(page.locator(".rw-card")).to_have_count(18)
        page.locator("#rw-kind").select_option("open-question")
        expect(page.locator(".rw-card")).to_have_count(6)
        assert "rl=new" in page.evaluate("location.hash")
        page.get_by_role("button",name="Clear filters",exact=True).click()
        page.locator("#rw-sort").select_option("literature")
        assert page.locator(".rw-card").first.get_attribute("data-question-id").startswith(("balan-","omega-"))
        page.evaluate("location.hash='rp=suzuki-boundary-characteristic-limit'")
        card = page.locator("#question-suzuki-boundary-characteristic-limit")
        expect(card).to_have_attribute("open", "")
        expect(card.locator(".rw-source-locator").first).to_contain_text("Corollary 1.6")
        expect(card.locator(".rw-source-dates").first).to_contain_text("2026-06-08")
        assert card.get_by_role("link",name="Pinned arXiv source",exact=True).get_attribute("href") == "https://arxiv.org/abs/2606.09096v1"
        assert not card.locator('a[href*="Problems/suzuki-"]').count()
        expect(card.locator(".rw-anchors > summary")).to_contain_text("05c05729c5cb")
        page.evaluate("location.hash='rp=mub-six-fourth-basis'")
        expect(page.locator("#question-mub-six-fourth-basis")).to_have_attribute("open", "")
        expect(page.locator("#question-mub-six-fourth-basis .rw-source-status")).to_contain_text("Obstruction")
        expect(page.locator("#question-mub-six-fourth-basis .rw-meta")).to_contain_text("not rechecked")
        old = {"schema_version":"pages-research-notes.v1","catalog_revision":"2026-09-07.1","entries":{
            "dfao-finite-unsat":{"stage":"working","starred":True,"note":"Old notebook entry","updated":"2026-09-07T00:00:00Z"}}}
        restored, result = mount({key:json.dumps(old)})
        assert result == "ok", result
        expect(restored.locator("#rw-storage-status")).to_contain_text("Catalog changed")
        restored.locator("#question-dfao-finite-unsat > summary").click()
        expect(restored.locator("#note-dfao-finite-unsat")).to_have_value("Old notebook entry")
        restored.locator("#note-dfao-finite-unsat").fill("Private notes <script>window.bad=true</script>")
        issue = restored.locator("#question-dfao-finite-unsat").get_by_role("link",name="Record progress on GitHub").get_attribute("href")
        assert "Private" not in issue and "window.bad" not in issue
        assert not restored.evaluate("Boolean(window.bad)")
        reloaded, result = mount(restored.evaluate("window.__memory"))
        assert result == "ok", result
        reloaded.locator("#rw-starred").check()
        expect(reloaded.locator(".rw-card")).to_have_count(1)
        reloaded.locator("#question-dfao-finite-unsat > summary").click()
        expect(reloaded.locator("#note-dfao-finite-unsat")).to_have_value("Private notes <script>window.bad=true</script>")
        with reloaded.expect_download() as download:
            reloaded.get_by_role("button",name="Export notebook",exact=True).click()
        notebook = json.loads(Path(download.value.path()).read_text())
        notebook["entries"]["dfao-finite-unsat"]["stage"] = "blocked"
        reloaded.locator("input[type=file]").set_input_files({"name":"notes.json","mimeType":"application/json","buffer":json.dumps(notebook).encode()})
        expect(reloaded.locator("#rw-storage-status")).to_contain_text("Imported")
        expect(reloaded.locator("#stage-dfao-finite-unsat")).to_have_value("blocked")
        notebook["entries"]["dfao-finite-unsat"]["stage"] = "proved"
        reloaded.locator("input[type=file]").set_input_files({"name":"bad.json","mimeType":"application/json","buffer":json.dumps(notebook).encode()})
        expect(reloaded.locator("#rw-storage-status")).to_contain_text("Import rejected")
        expect(reloaded.locator("#stage-dfao-finite-unsat")).to_have_value("blocked")
        page.evaluate("location.hash='node=D5%2FS3%2FArith%2FGoldenApparition'")
        expect(page.locator(".rw-card")).to_have_count(3)
        page.evaluate("location.hash='rp=mub-projector-sos-scope'")
        expect(page.locator("#question-mub-projector-sos-scope")).to_have_attribute("open", "")
        expect(page.locator(".rw-card")).to_have_count(total)
        page.get_by_role("button",name="Clear filters",exact=True).click()
        page.locator("#rw-q").fill("2607.06249")
        expect(page.locator(".rw-card")).to_have_count(3)
        page.locator("#rw-q").fill("no-such-question")
        expect(page.locator(".rw-empty")).to_be_visible()
        page.get_by_role("button",name="Clear filters",exact=True).click()
        if args.screenshots:
            args.screenshots.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(args.screenshots / "research-desktop.png"))
        page.set_viewport_size({"width":375,"height":812})
        page.evaluate("location.hash='rp=balan-wang-universal-stability'")
        expect(page.locator("#question-balan-wang-universal-stability")).to_have_attribute("open", "")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        if args.screenshots: page.screenshot(path=str(args.screenshots / "research-mobile.png"))
        failure, result = mount(failure=True)
        assert "catalog failure" in result
        expect(failure.locator("#research-workbench")).to_have_count(0)
        expect(failure.locator(".research-browser")).to_be_visible()
        expect(failure.locator(".problem-row")).to_have_count(len(legacy))
        denied, result = mount(denied=True)
        assert result == "ok", result
        denied.locator("#question-dfao-finite-unsat > summary").click()
        denied.locator("#note-dfao-finite-unsat").fill("Kept in memory")
        expect(denied.locator("#rw-storage-status")).to_contain_text("remain in memory")
        assert not errors, errors
        browser.close()
    print("PASS: offline Chromium DOM, 41 cards, literature filters, source links, old notebook restore, import/export, hash navigation, mobile overflow and failure controls")


if __name__ == "__main__":
    main()
