import tempfile
import unittest
import subprocess
from pathlib import Path
from unittest.mock import patch
from lib.reading_views import Fragments, series, common_shell, add_spaces_navigation, render_research_groups, render_conjecture_groups

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

    def test_research_groups_are_collapsed_and_each_result_occurs_once(self):
        records,source=results();out=render_research_groups(source,{},records);p=Fragments(out)
        for name in ('oeis','erdos','other'):
            group=p.select(id='results-'+name)[0]
            self.assertNotIn('open',group.attrs)
            self.assertEqual(1,len(Fragments(p.raw(group)).select(cls='news-result')))
        for r in records:
            self.assertEqual(1,out.count(f'id="{r["id"]}"'))
            self.assertIn(f'Scope {r["id"]}',out)
            self.assertIn('https://example.org/proof/'+r['id'],out)
        self.assertIn('id="resolved-sequence"',out)

    def test_original_research_heading_and_papers_are_retained(self):
        records,source=results();out=render_research_groups(source,{},records)
        self.assertIn('class="news-heading"',out)
        self.assertIn('class="news-lede"',out)
        self.assertIn('class="news-index"',out)
        self.assertNotIn('class="reading-heading"',out)
        p=Fragments(source);self.assertIn(p.raw(p.select(id='publications')[0]),out)
        self.assertNotIn('href="spaces.html"',out)

    def test_research_only_displays_collections_with_results(self):
        records,source=results();out=render_research_groups(source,{},records[:1])
        self.assertTrue(Fragments(out).select(id='results-oeis'))
        self.assertFalse(Fragments(out).select(id='results-erdos'))
        self.assertFalse(Fragments(out).select(id='results-other'))
        populated=render_research_groups(source,{},records)
        self.assertTrue(Fragments(populated).select(id='results-erdos'))

    def test_missing_result_fails_instead_of_silently_omitting_it(self):
        records,source=results();records[0]['id']='absent'
        with self.assertRaisesRegex(ValueError,'absent'):render_research_groups(source,{},records)

    def test_style_and_legacy_redirect_are_before_body(self):
        records,source=results();out=render_research_groups(source,{},records)
        self.assertLess(out.index('assets/reading.css'),out.index('<body'))
        self.assertLess(out.index('assets/research-route.js'),out.index('<body'))

    def test_conjectures_preserve_layout_and_specific_question_destinations(self):
        snapshot,source=conjectures()
        with tempfile.TemporaryDirectory() as temp, patch('lib.reading_views.source_url',side_effect=lambda p:p['url']):
            out=render_conjecture_groups(source,snapshot,Path(temp))
        p=Fragments(out)
        self.assertNotIn('research/done/',p.raw(p.select(id='open-problems')[0]))
        self.assertIn('research/done/',p.raw(p.select(id='completed-dossiers')[0]))
        self.assertEqual('proved',p.select(id='resolved-done')[0].attrs['data-resolution-kind'])
        self.assertIn('href="research/q1/"',out);self.assertIn('href="research/q2/"',out)
        for cls in ['page-heading','research-stats','research-browser','problem-list','result-followups']:
            self.assertTrue(p.select(cls=cls),cls)
        self.assertIn('Original statistics',out)
        self.assertIn('id="research-workbench-slot"',out)
        self.assertIn('id="millennium-entry"',out)
        self.assertLess(out.index('assets/research-workbench.css'),out.index('<body'))

    def test_journey_precedes_catalog_and_preserves_all_completed_links(self):
        snapshot,source=conjectures()
        with tempfile.TemporaryDirectory() as temp, patch('lib.reading_views.source_url',side_effect=lambda p:p['url']):
            out=render_conjecture_groups(source,snapshot,Path(temp))
        self.assertLess(out.index('id="next-questions"'),out.index('id="source-questions"'))
        self.assertEqual(out.count('class="journey-direction"'),3)
        self.assertIn('Established result',out)
        self.assertIn('Next contribution',out)
        self.assertNotIn('Development activity',out)
        self.assertIn('id="completed-oeis"',out)
        self.assertIn('id="resolved-done"',out)
        self.assertNotIn('open',Fragments(out).select(id='source-questions')[0].attrs)

    def test_results_lead_and_raw_gaps_stay_in_conjectures(self):
        records,source=results()
        snapshot={'problems':[{'slug':'q','title':'Question','sections':{'Gap':'LONG RAW GAP'}}]}
        out=render_research_groups(source,snapshot,records)
        self.assertLess(out.index('id="results"'),out.index('id="publications"'))
        self.assertLess(out.index('id="publications"'),out.index('id="frontier"'))
        self.assertNotIn('LONG RAW GAP',out)

    def test_primary_navigation_is_restored_without_changing_evidence_links(self):
        raw=document('<main><a href="../../version-status.html">Diagnostic evidence</a></main>').replace('href="spaces.html"','href="../../spaces.html"')
        out=add_spaces_navigation(raw); p=Fragments(out)
        nav=next(n for n in p.select(tag='nav') if n.attrs.get('aria-label')=='Primary navigation')
        self.assertNotIn('spaces.html',p.raw(nav));self.assertNotIn('version-status.html',p.raw(nav))
        self.assertIn('href="../../version-status.html"',out)
        self.assertEqual(out,add_spaces_navigation(out))

    def test_titles_cannot_insert_markup(self):
        records,source=results();records[0]['title']='<img src=x onerror=bad()>'
        out=render_research_groups(source,{},records)
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
        self.assertIn("new URL('atlas.html'",page)
        self.assertIn('location.replace(target.href)',page)
        self.assertNotIn('spaces-compare',page)

    def test_display_annotation_contracts(self):
        subprocess.run(['node','--test','tests/js/evolution-labels.test.mjs'],cwd=ROOT,check=True,capture_output=True,text=True)

if __name__=='__main__':unittest.main()
