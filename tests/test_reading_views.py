import tempfile
import unittest
import subprocess
from pathlib import Path
from unittest.mock import patch
from lib.reading_views import Fragments, series, common_shell, add_spaces_navigation, render_research_groups, render_conjecture_groups


def document(main):
    return '<!doctype html><html lang="en"><head><title>Test</title></head><body class="site-themed research-editorial"><header class="knowledge-header"><a class="brand">trureturing</a><nav aria-label="Primary navigation"><a href="atlas.html">Explore</a><a href="research.html">Research</a><a href="conjectures.html">Conjectures</a><a href="knowledge/">Library</a><a href="evolution.html">Evolution</a></nav></header>'+main+'</body></html>'


def results():
    records=[dict(id='sequence',title='Sequence recurrence',kind='proved',module='D5/Seq',source_url='https://oeis.org/A000001'),
        dict(id='erdos-case',title='An Erdos special case',kind='refuted',module='D5/Case',source_url='https://www.erdosproblems.com/123'),
        dict(id='paper',title='A theorem in a paper',kind='proved',module='D5/General',source_url='https://example.org/paper')]
    cards=''.join(f'<article class="news-result" id="{r["id"]}"><h3>{r["title"]}</h3><details><summary>Exact scope</summary><p>Scope {r["id"]}</p><a href="https://example.org/proof/{r["id"]}">Proof</a></details></article>' for r in records)
    return records,document('<main>'+cards+'<section id="resolved-questions"><article id="resolved-sequence">Original proof record</article></section><section id="publications"><h2>Publications</h2></section></main>')


def conjectures():
    problems=[dict(slug='q1',title='Open sequence',url='https://oeis.org/A000001',motivation_gids=['D5/Seq']),
              dict(slug='done',title='Resolved target',url='https://oeis.org/A000002',resolution={'kind':'proved'},motivation_gids=[]),
              dict(slug='q2',title='Open paper question',url='https://example.org/paper',motivation_gids=[])]
    rows=''.join(f'<a class="problem-row" href="research/{p["slug"]}/"><div><h2>{p["title"]}</h2></div></a>' for p in problems)
    return {'problems':problems},document('<main class="site-main research-home">'+rows+'<article class="result-followup"><a href="#rp=subgoal">Followup</a></article></main>')


class ReadingViewsTests(unittest.TestCase):
    def test_collections_use_exact_source_hosts(self):
        self.assertEqual(series('https://oeis.org/A1')[0],'oeis')
        self.assertEqual(series('https://erdosproblems.com/1')[0],'erdos')
        self.assertEqual(series('https://oeis.org.evil.example/A1')[0],'other')
        self.assertEqual(series('https://example.org/OEIS')[0],'other')

    def test_fragments_preserve_nested_evidence_and_math_bytes(self):
        text='<main><details id="x"><summary>Proof</summary><details><summary>Input</summary><code>&lt;x&gt;</code></details></details></main>'
        parsed=Fragments(text)
        self.assertEqual(parsed.raw(parsed.select(id='x')[0]),text[6:-7])

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

    def test_empty_collection_is_explicit(self):
        records,source=results();out=render_research_groups(source,{},records[:1])
        self.assertIn('0 results',Fragments(out).raw(Fragments(out).select(id='results-erdos')[0]))

    def test_missing_result_fails_instead_of_silently_omitting_it(self):
        records,source=results();records[0]['id']='absent'
        with self.assertRaisesRegex(ValueError,'absent'):render_research_groups(source,{},records)

    def test_style_and_legacy_redirect_are_before_body(self):
        records,source=results();out=render_research_groups(source,{},records)
        self.assertLess(out.index('assets/reading.css'),out.index('<body'))
        self.assertLess(out.index('assets/research-route.js'),out.index('<body'))
        self.assertIn('reading-page',out)

    def test_conjectures_hide_resolved_and_keep_question_destinations(self):
        snapshot,source=conjectures()
        with tempfile.TemporaryDirectory() as temp, patch('lib.reading_views.source_url',side_effect=lambda p:p['url']):
            out=render_conjecture_groups(source,snapshot,Path(temp))
        parsed=Fragments(out)
        self.assertNotIn('research/done/',parsed.raw(parsed.select(id='open-problems')[0]))
        self.assertIn('research/done/',parsed.raw(parsed.select(id='completed-dossiers')[0]))
        self.assertIn('href="research/q1/"',out)
        self.assertIn('href="research/q2/"',out)
        main=Fragments(out).raw(Fragments(out).select(tag='main')[0])
        tabs=next(e for e in Fragments(main).select(tag='nav') if e.attrs.get('aria-label')=='Open question views')
        self.assertNotIn('href="research.html',Fragments(main).raw(tabs))
        self.assertIn('id="research-workbench-slot"',main)
        self.assertIn('id="millennium-entry"',main)
        self.assertIn('class="result-followup"',main)
        self.assertLess(out.index('assets/research-workbench.css'),out.index('<body'))

    def test_spaces_navigation_is_idempotent_and_preserves_relative_root(self):
        raw=document('<main></main>').replace('href="evolution.html"','href="../../evolution.html"')
        out=add_spaces_navigation(raw)
        self.assertIn('href="../../spaces.html"',out)
        self.assertEqual(out,add_spaces_navigation(out))

    def test_titles_cannot_insert_markup(self):
        records,source=results();records[0]['title']='<img src=x onerror=bad()>'
        out=render_research_groups(source,{},records)
        self.assertNotIn('<img src=x',out)
        self.assertIn('&lt;img',out)

    def test_javascript_reader_contracts(self):
        subprocess.run(["node","--test","tests/js/reading.test.mjs"], cwd=Path(__file__).resolve().parents[1],check=True,capture_output=True,text=True)

    def test_light_prepaint_cannot_leak_into_dark_reading_page(self):
        source=document('<main></main>').replace('<head>', '<head><meta name="theme-color" content="#f7f8fa"><style>html,body{background:#f7f8fa;color:#232629}body{transition:background-color .24s ease,color .24s ease}</style>')
        out=common_shell(source)
        self.assertNotIn('#f7f8fa',out)
        self.assertIn('html,body{background:#090c10',out)
        self.assertIn('body{transition:none}',out)

    def test_common_shell_remains_idempotent(self):
        value=common_shell(document('<main></main>'))
        self.assertEqual(value,common_shell(value))


class PublicationRoutingTests(unittest.TestCase):
    def test_merged_presentation_uses_existing_rebuild_path(self):
        workflow=(Path(__file__).resolve().parents[1]/'.github/workflows/refresh-presentation.yml').read_text()
        self.assertIn('branches: [dev]',workflow)
        self.assertIn('gh workflow run pages.yml',workflow)
        self.assertIn('-f rebuild_current=true',workflow)
        self.assertNotIn('actions/deploy-pages',workflow)
        self.assertNotIn('truth_release_digest=mock',workflow)
        self.assertNotIn('pull_request:',workflow)
