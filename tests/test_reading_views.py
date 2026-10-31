import tempfile
import unittest
import subprocess
import json
from pathlib import Path
from unittest.mock import patch
from lib.reading_views import Fragments, series, common_shell, add_spaces_navigation, render_research_groups, render_conjecture_groups, render_result_index

ROOT = Path(__file__).resolve().parents[1]

def document(main):
    return '<!doctype html><html lang="en"><head><title>Test</title></head><body class="site-themed research-editorial"><header class="knowledge-header"><a class="brand">trureturing</a><nav aria-label="Primary navigation"><a href="atlas.html">Explore</a><a href="research.html">Research</a><a href="conjectures.html">Conjectures</a><a href="knowledge/">Library</a><a href="evolution.html">Evolution</a><a href="spaces.html">Spaces</a><a href="version-status.html">Version status</a></nav></header>'+main+'</body></html>'

def results():
    records=[dict(id='sequence',title='Sequence recurrence',kind='proved',module='D5/Seq',source_url='https://oeis.org/A000001'),
        dict(id='erdos-case',title='An Erdos special case',kind='refuted',module='D5/Case',source_url='https://www.erdosproblems.com/123'),
        dict(id='paper',title='A theorem in a paper',kind='proved',module='D5/General',source_url='https://example.org/paper')]
    cards=''.join(f'<article class="news-result" id="{r["id"]}"><h3>{r["title"]}</h3><details><summary>Exact scope</summary><p>Scope {r["id"]}</p><a href="https://example.org/proof/{r["id"]}">Proof</a></details></article>' for r in records)
    return records,document('<main>'+cards+'<section id="resolved-questions"><article id="resolved-sequence">Original proof record</article></section><section id="publications"><h2>Publications</h2></section></main>')

def conjectures():
    problems=[dict(slug='q1',title='Open sequence',url='https://oeis.org/A000001',motivation_gids=['D5/Seq']),
        dict(slug='done',title='Resolved target',url='https://oeis.org/A000002',resolution={'kind':'proved', 'kernel_verified': {'frozen_node_id': 'sha256:example', 'freeze_status': 'frozen'}},motivation_gids=[]),
        dict(slug='q2',title='Open paper question',url='https://example.org/paper',motivation_gids=[])]
    rows=''.join(f'<a class="problem-row" href="research/{p["slug"]}/"><div><h2>{p["title"]}</h2></div></a>' for p in problems)
    return {'problems':problems},document('<main class="site-main research-home"><header class="page-heading"><h1>Conjectures</h1></header>'
        '<div class="research-stats">Original statistics</div><div id="open-problems" class="research-browser"><aside>'
        '<input id="research-search"><select id="research-triage"></select><p id="research-count"></p></aside>'
        '<section class="problem-list">'+rows+'</section></div><section class="result-followups"><article class="result-followup">'
        '<a href="#rp=subgoal">Followup</a></article></section></main>')

class ReadingViewsTests(unittest.TestCase):
    def test_collections_use_exact_source_hosts(self):
        self.assertEqual(series('https://oeis.org/A1')[0],'oeis')
        self.assertEqual(series('https://erdosproblems.com/1')[0],'erdos')
        self.assertEqual(series('https://oeis.org.evil.example/A1')[0],'other')
        self.assertEqual(series('https://example.org/OEIS')[0],'other')

    def test_fragments_preserve_nested_evidence_and_math_bytes(self):
        text='<main><details id="x"><summary>Proof</summary><details><summary>Input</summary><code>&lt;x&gt;</code></details></details></main>'
        p=Fragments(text);self.assertEqual(p.raw(p.select(id='x')[0]),text[6:-7])

    def test_unified_list_preserves_each_result_and_its_evidence(self):
        records,source=results();out=render_result_index(source,{},records);p=Fragments(out)
        self.assertEqual(len(p.select(cls='result-item')), len(records))
        self.assertEqual(len(p.select(cls='result-impact-tag')), len(records))
        self.assertNotIn('data-result-collection', out)
        self.assertNotIn('data-rank-dimension', out)
        self.assertNotIn('Assessment pending', out)
        for r in records:
            self.assertEqual(1,out.count(f'id="{r["id"]}"'))
            self.assertIn(f'Scope {r["id"]}',out)
            self.assertIn('https://example.org/proof/'+r['id'],out)
        self.assertIn('data-result-row',p.select(id='resolved-sequence')[0].attrs)
        self.assertNotIn('id="resolved-questions"',out)

    def test_original_research_heading_and_papers_are_retained(self):
        records,source=results();out=render_research_groups(source,{},records)
        self.assertIn('class="news-heading"',out)
        self.assertIn('class="news-lede"',out)
        self.assertIn('class="research-highlights"',out)
        # Low-evidence fixtures must not be padded into the news selection.
        self.assertNotIn('class="highlight-card"',out)
        self.assertIn('class="discovery-empty"',out)
        self.assertLess(out.index('id="highlights"'), out.index('id="publications"'))
        self.assertNotIn('data-result-row',out)
        self.assertNotIn('class="reading-heading"',out)
        p=Fragments(source);self.assertIn(p.raw(p.select(id='publications')[0]),out)
        self.assertNotIn('href="spaces.html"',out)

    def test_reader_does_not_have_to_choose_a_source_or_ranking(self):
        records, source = results()
        out = render_result_index(source, {}, records)
        self.assertEqual(len(Fragments(out).select(tag='input')), 1)
        self.assertFalse(Fragments(out).select(tag='select'))
        self.assertNotIn('What matters to you?', out)
        self.assertNotIn('data-result-score', out)

    def test_research_is_publication_focused(self):
        records, source = results()
        source = source.replace('</main>', '<section id="activities">Old news</section></main>')
        out = render_research_groups(source, {}, records)
        self.assertNotIn('id="activities"', out)
        self.assertNotIn('data-result-row', out)
        self.assertIn('id="publications"', out)
        self.assertIn('href="conjectures.html#results"', out)
        self.assertIn('id="legacy-result-ids"', out)

    def test_missing_result_fails_instead_of_silently_omitting_it(self):
        records,source=results();records[0]['id']='absent'
        with self.assertRaisesRegex(ValueError,'absent'):render_result_index(source,{},records)

    def test_style_and_legacy_redirect_are_before_body(self):
        records,source=results();out=render_research_groups(source,{},records)
        self.assertLess(out.index('assets/reading.css'),out.index('<body'))
        self.assertLess(out.index('assets/research-route.js'),out.index('<body'))

    def test_conjectures_are_a_curated_library_without_project_archive_or_notebook(self):
        snapshot,source=conjectures()
        with tempfile.TemporaryDirectory() as temp:
            out=render_conjecture_groups(source,snapshot,Path(temp))
        p=Fragments(out)
        self.assertEqual(len(p.select(cls='curated-question')),19)
        for identity in ['source-questions','curated-search','question-thue-morse-nonautomaticity']:
            self.assertTrue(p.select(id=identity),identity)
        for identity in ['completed-dossiers','research-directions','research-workbench-slot','research-search']:
            self.assertFalse(p.select(id=identity),identity)
        self.assertFalse(p.select(cls='research-stats'))
        self.assertFalse(p.select(cls='problem-row'))
        self.assertNotIn('data-curated-source=',out)
        self.assertTrue(p.select(id='more-questions'))
        self.assertIn('https://www.erdosproblems.com/3',out)
        self.assertLess(out.index('assets/conjecture-collection.css'),out.index('<body'))

    def test_open_questions_are_grouped_without_unrelated_future_pursuits(self):
        snapshot, source = conjectures()
        with tempfile.TemporaryDirectory() as temp:
            out = render_conjecture_groups(source, snapshot, Path(temp))
        parsed = Fragments(out)
        self.assertFalse(parsed.select(cls='horizon-card'))
        self.assertEqual(len(parsed.select(cls='curated-group-heading')), 3)
        self.assertNotIn('Future pursuits', out)
        self.assertNotIn('direction-erdos-2-covering-systems', out)
        self.assertIn('Connes', out)
        self.assertIn('Zauner', out)

    def test_contributions_precede_open_questions_and_keep_evidence(self):
        records, result_document = results()
        snapshot, source = conjectures()
        with tempfile.TemporaryDirectory() as temp:
            out = render_conjecture_groups(source, snapshot, Path(temp), result_document, records)
            index = json.loads((Path(temp) / 'assets/contribution-index.json').read_text())
        self.assertLess(out.index('id="results"'), out.index('id="source-questions"'))
        self.assertEqual(len(index['results']), len(records))
        self.assertTrue(all(isinstance(item['score'], (int,float)) for item in index['results']))
        self.assertIn('Scope sequence', out)
        self.assertNotIn('Awaiting assessments', out)

    def test_conjectures_open_with_release_overview_and_accessible_map(self):
        records, result_document = results()
        snapshot, source = conjectures()
        with tempfile.TemporaryDirectory() as temp:
            out = render_conjecture_groups(source, snapshot, Path(temp), result_document, records)
        self.assertIn('id="conjecture-overview"', out)
        self.assertIn('id="conjecture-overview-title"', out)
        self.assertIn('class="overview-map"', out)
        self.assertIn('aria-labelledby="overview-map-title overview-map-desc"', out)
        self.assertIn('>3</strong><span>resolved results</span>', out)
        self.assertIn('>2</strong><span>proved</span>', out)
        self.assertIn('>1</strong><span>refuted</span>', out)
        self.assertLess(out.index('id="conjecture-overview"'), out.index('id="results"'))

    def test_primary_navigation_is_restored_without_changing_evidence_links(self):
        raw=document('<main><a href="../../version-status.html">Diagnostic evidence</a></main>').replace('href="spaces.html"','href="../../spaces.html"')
        out=add_spaces_navigation(raw); p=Fragments(out)
        nav=next(n for n in p.select(tag='nav') if n.attrs.get('aria-label')=='Primary navigation')
        self.assertNotIn('spaces.html',p.raw(nav));self.assertNotIn('version-status.html',p.raw(nav))
        self.assertIn('href="../../version-status.html"',out)
        self.assertEqual(out,add_spaces_navigation(out))
        clean = add_spaces_navigation(raw.replace('spaces.html', 'spaces').replace('version-status.html', 'version-status'))
        clean_parsed = Fragments(clean)
        clean_nav = next(n for n in clean_parsed.select(tag='nav') if n.attrs.get('aria-label') == 'Primary navigation')
        self.assertNotIn('version-status', clean_parsed.raw(clean_nav))
        self.assertNotIn('spaces', clean_parsed.raw(clean_nav))
        self.assertIn('href="../../version-status"', clean)

    def test_titles_cannot_insert_markup(self):
        records,source=results();records[0]['title']='<img src=x onerror=bad()>'
        out=render_result_index(source,{},records)
        self.assertNotIn('<img src=x',out);self.assertIn('&lt;img',out)

    def test_prepaint_keeps_authored_light_palette(self):
        source=document('<main></main>').replace('<head>','<head><meta name="theme-color" content="#f7f8fa"><style>html,body{background:#f7f8fa;color:#232629}body{transition:background-color .24s ease,color .24s ease}</style>')
        out=common_shell(source)
        self.assertIn('html,body{background:#f7f8fa;color:#232629}',out)
        self.assertIn('body{transition:none}',out)
        self.assertNotIn('#090c10',out)
        css=(ROOT/'site/assets/reading.css').read_text()
        self.assertNotIn('color-scheme:',css)
        self.assertNotIn('--background:',css)
        self.assertNotIn('Georgia',css)  # The original editorial stylesheet owns typography.

    def test_common_shell_remains_idempotent(self):
        value=common_shell(document('<main></main>'));self.assertEqual(value,common_shell(value))

    def test_evolution_keeps_original_graph_and_controls(self):
        page=(ROOT/'site/evolution.html').read_text()
        for identity in ['evolution-map','lineage-release','release-play','lineage-fit','lineage-zoom-in','evolution-detail']:
            self.assertIn('id="'+identity+'"',page)
        self.assertNotIn('evolution-reader.mjs',page)
        self.assertIn('architecture-history.js',page)
        self.assertIn('id="publication-status"',page)
        self.assertIn('Point size = modules grouped here',page)

    def test_spaces_is_only_a_compatibility_route_to_the_atlas(self):
        page=(ROOT/'site/spaces.html').read_text()
        self.assertIn("new URL('atlas'",page)
        self.assertIn('location.replace(target.href)',page)
        self.assertNotIn('spaces-compare',page)

    def test_display_annotation_contracts(self):
        subprocess.run(['node','--test','tests/js/evolution-labels.test.mjs','tests/js/evolution.test.mjs','tests/js/reading.test.mjs'],cwd=ROOT,check=True,capture_output=True,text=True)

if __name__=='__main__':unittest.main()
