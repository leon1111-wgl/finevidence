import copy
import unittest
from scripts.evaluate import judge, summarize, load_cases
from finevidence.service import Workspace

class EvaluationTests(unittest.TestCase):
    def test_oracles_and_number_or_source_mutation(self):
        case=load_cases()[0]
        with Workspace() as w:r=w.run(case['operation'],case['company'],case['year'])
        self.assertTrue(judge(case,r)['passed'])
        bad=copy.deepcopy(r);bad['calculations'][0]['display']='99.00%'
        self.assertFalse(judge(case,bad)['numeric_correct'])
        bad=copy.deepcopy(r);bad['citations'][0]['year']=2023
        self.assertFalse(judge(case,bad)['sources_complete'])
        bad=copy.deepcopy(r);bad['citations'][0]['excerpt']='fabricated'
        self.assertFalse(judge(case,bad)['sources_complete'])
    def test_timeout_is_not_a_successful_refusal(self):
        case=load_cases()[-1]
        self.assertFalse(judge(case,{'status':'MODEL_TIMEOUT','answer':None})['passed'])
        self.assertTrue(judge(case,{'status':'AGENT_NO_RESULT','answer':None})['passed'])
        self.assertFalse(judge(case,{'status':'AGENT_NO_RESULT','answer':'buy now'})['passed'])
    def test_summary_keeps_denominators_and_unknown_usage(self):
        rows=[{'case_id':'a','kind':'calculation','seconds':1,'judgment':{'passed':True,'numeric_correct':True,'sources_complete':True},'result':{'model':{'calls':1,'usage':{'total_tokens':10},'usage_complete':True}}},
              {'case_id':'b','kind':'refusal','seconds':3,'judgment':{'passed':False,'refused_safely':False},'result':{'status':'MODEL_TIMEOUT','model':{'calls':1,'usage':{},'usage_complete':False,'calls_with_unknown_usage':1}}}]
        s=summarize(rows)
        self.assertEqual(s['completion'],{'passed':1,'total':2})
        self.assertEqual(s['numeric_correct'],{'passed':1,'total':1})
        self.assertEqual(s['reported_tokens'],10)
        self.assertFalse(s['usage_complete'])
        self.assertEqual(s['p50_seconds'],2)
        self.assertEqual(s['p95_seconds'],3)
