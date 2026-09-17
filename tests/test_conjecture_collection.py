import copy
import json
from pathlib import Path
import unittest
from lib.conjecture_collection import render_collection
from lib.reading_views import Fragments

ROOT=Path(__file__).resolve().parents[1]

class ConjectureCollectionTests(unittest.TestCase):
    def setUp(self):
        self.catalog=json.loads((ROOT/'site/assets/research-directions.json').read_text())
        self.problem={'slug':'campbell-currie-rampersad-eq-11','resolution':{'kind':'proved','kernel_verified':{'freeze_status':'frozen','frozen_node_id':'sha256:example'}}}

    def test_all_curated_questions_and_subquestions_are_in_static_html(self):
        html=render_collection(self.catalog,{'problems':[]})
        self.assertEqual(len(Fragments(html).select(cls='curated-question')),16)
        for family in self.catalog['families']:
            self.assertIn('id="direction-'+family['id']+'"',html)
            for target in family['targets']:self.assertIn('id="question-'+target['id']+'"',html)
        self.assertNotIn('data-related-result=',html)

    def test_related_result_is_scoped_and_requires_verification_in_the_selected_snapshot(self):
        html=render_collection(self.catalog,{'problems':[self.problem]})
        self.assertIn('data-related-result="campbell-currie-rampersad-eq-11"',html)
        self.assertIn('The sign and full recursion are separate questions.',html)
        self.assertIn('id="direction-thue-morse-reduced-abelian-even"',html)
        unverified=copy.deepcopy(self.problem);del unverified['resolution']['kernel_verified']
        self.assertNotIn('data-related-result=',render_collection(self.catalog,{'problems':[unverified]}))

    def test_resolved_parent_stays_curated_with_a_link_to_its_result(self):
        problem=copy.deepcopy(self.problem);problem['slug']=self.catalog['families'][3]['id']
        html=render_collection(self.catalog,{'problems':[problem]})
        self.assertIn('id="direction-'+problem['slug']+'"',html)
        self.assertIn('Released result ↗',html)
        self.assertEqual(len(Fragments(html).select(cls='curated-question')),16)

    def test_authored_text_is_escaped_and_unknown_areas_remain_accessible(self):
        catalog=copy.deepcopy(self.catalog);family=catalog['families'][0]
        family['display']['gap']='<script>bad()</script>';family['area']='New area'
        html=render_collection(catalog,{'problems':[]})
        self.assertNotIn('<script>bad',html);self.assertIn('&lt;script&gt;bad',html)
        self.assertIn('data-curated-field="other"',html)
        self.assertIn('data-field="other"',html)

if __name__=='__main__':unittest.main()
