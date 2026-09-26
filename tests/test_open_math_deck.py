"""The discussion deck stays navigable and fully localized."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
DECK = ROOT / 'site/open-math.html'
# Mirrors the skip selector in site/assets/i18n.mjs.
SKIPPED_TAGS = {'script', 'style', 'noscript', 'code', 'pre', 'textarea', 'math'}
VOID_TAGS = {'meta', 'link', 'br', 'img', 'input', 'hr', 'source', 'line', 'circle'}
TRANSLATED_ATTRIBUTES = ('aria-label', 'title', 'placeholder')
# Names, numbers, symbols, pull-request links and paper titles stay in the original.
UNTRANSLATED = {
    'trureturing', 'GitHub ↗', '→', '↺', '←', '↗', '✓', 'A', 'B', 'C', 'D',
    '01', '02', '03', '04', '05', '06', '1', '2', '3', '4', '5',
    '7,904', '5,061', '4,963', '406', '164', '48,223',
    'PR #9405 ↗', 'PR #10124 ↗', 'PR #10147 ↗', 'PR #10054 ↗',
    'A certificate-producing cascade for equational implication: the SAIR EQT2 Stage 2 solver',
    'Mechanism-level routing failure in LLMs over Lean-verified algebraic structures',
}
# Labels written by site/assets/open-math-deck.mjs at runtime.
RUNTIME_LABELS = {'Slide view', 'Reading view'}


class _Strings(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.strings, self.in_body = [], [], False

    def _skipping(self):
        return any(tag in SKIPPED_TAGS or no_translate for tag, no_translate in self.stack)

    def _attributes(self, attrs):
        if self.in_body and not self._skipping():
            self.strings += [value.strip() for key, value in attrs if key in TRANSLATED_ATTRIBUTES and value]

    def handle_starttag(self, tag, attrs):
        self.in_body = self.in_body or tag == 'body'
        self._attributes(attrs)
        if tag not in VOID_TAGS:
            self.stack.append((tag, dict(attrs).get('translate') == 'no'))

    def handle_startendtag(self, tag, attrs):
        self._attributes(attrs)

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        while self.stack and self.stack.pop()[0] != tag:
            pass

    def handle_data(self, data):
        if self.in_body and not self._skipping() and data.strip():
            self.strings.append(data.strip())


class OpenMathDeckTests(unittest.TestCase):
    def setUp(self):
        self.html = DECK.read_text(encoding='utf-8')
        self.zh = json.loads((ROOT / 'site/assets/locales/zh-CN.json').read_text(encoding='utf-8'))

    def test_every_display_string_has_a_chinese_translation(self):
        parser = _Strings()
        parser.feed(self.html)
        missing = sorted({s for s in parser.strings if s not in UNTRANSLATED and s not in self.zh})
        self.assertEqual(missing, [])
        for label in RUNTIME_LABELS:
            self.assertIn(label, self.zh)

    def test_slide_labels_match_the_slide_count(self):
        sections = re.findall(r'<section class="deck-slide[^"]*" id="s(\d+)" data-no="(\d+) / (\d+)"[^>]*aria-label="(\d+) of (\d+)"', self.html)
        total = len(re.findall(r'<section class="deck-slide', self.html))
        self.assertEqual(len(sections), total)
        for position, (ident, number, count, label, label_count) in enumerate(sections, 1):
            self.assertEqual({int(ident), int(number), int(label)}, {position})
            self.assertEqual({int(count), int(label_count)}, {total})

    def test_deck_assets_are_wired_and_parse(self):
        self.assertIn('assets/open-math-deck.css', self.html)
        self.assertIn('assets/open-math-deck.mjs', self.html)
        for element in ('id="deck"', 'id="deck-prev"', 'id="deck-next"', 'id="deck-counter"',
                        'id="deck-progress-bar"', 'id="deck-notes-toggle"', 'id="deck-read-toggle"',
                        'id="deck-fullscreen"', 'id="deck-notes-panel"'):
            self.assertIn(element, self.html)
        result = subprocess.run(['node', '--check', 'site/assets/open-math-deck.mjs'], cwd=ROOT,
                                capture_output=True, text=True, timeout=15, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_excerpt_edges_match_import_records(self):
        data = json.loads((ROOT / 'site/assets/open-math/atlas-excerpt.json').read_text())
        nodes = {n['id']: n for n in data['nodes']}
        visible = set(data['visible'])
        expected = {(parent, ident) for ident in visible for parent in nodes[ident]['parents'] if parent in visible}
        actual = {(edge['source'], edge['target']) for edge in data['edges']}
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual), len(data['edges']))
        self.assertEqual(data['granularity'], 'module-import')
        for node in nodes.values():
            self.assertEqual(node['in_degree'], len(node['parents']))
            self.assertEqual(node['out_degree'], len(node['children']))

    def test_excerpt_contains_the_complete_seed_downstream_network(self):
        data = json.loads((ROOT / 'site/assets/open-math/atlas-excerpt.json').read_text())
        nodes = {n['id']: n for n in data['nodes']}
        seen, frontier = set(), {data['seed']}
        while frontier:
            seen.update(frontier)
            frontier = {child for ident in frontier for child in nodes[ident]['children']} - seen
        self.assertEqual(len(seen) - 1, nodes[data['seed']]['descendant_count'])
        self.assertEqual(set(data['visible']), seen | set(nodes[data['seed']]['parents']))
        self.assertEqual(set(data['positions']), set(data['visible']))
        # These are the user-facing counts on the cover and graph controls.
        self.assertEqual((len(data['visible']), len(data['edges']), len(seen) - 1), (79, 97, 75))

    def test_showcase_evidence_is_pinned_and_local(self):
        data = json.loads((ROOT / 'site/assets/open-math/atlas-excerpt.json').read_text())
        for node in data['nodes']:
            self.assertTrue(node['release_page'].startswith('release/' + data['release'].split(':')[1] + '/node/'))
        self.assertEqual(data['observations'][-1]['source_commit'], data['source_commit'])
        self.assertEqual(data['observations'][-1]['atlas_graph_digest'], data['atlas_graph_digest'])
        self.assertEqual([o['reach'] for o in data['observations']], [67, 69, 74, 75, 75])
        self.assertEqual(len(data['source_excerpts']), 3)
        for excerpt in data['source_excerpts'].values():
            self.assertTrue(excerpt['text'].startswith('theorem '))
            self.assertRegex(excerpt['sha256'], r'^[a-f0-9]{64}$')
        self.assertIn('assets/open-math-showcase.mjs', self.html)
        result = subprocess.run(['node', '--check', 'site/assets/open-math-showcase.mjs'], cwd=ROOT,
                                capture_output=True, text=True, timeout=15, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
