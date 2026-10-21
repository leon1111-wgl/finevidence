"""Real workflows and bounded model decisions; no external model calls in CI."""
import json
import unittest
from unittest.mock import patch
from finevidence.service import Workspace, RequestError
from finevidence.agent import run_agent
from finevidence.provider import ProviderError

class Decisions:
    def __init__(self, values): self.values=iter(values); self.calls=0
    def complete(self, messages, timeout):
        self.calls+=1
        v=next(self.values)
        if isinstance(v,Exception): raise v
        return {'content':json.dumps(v) if not isinstance(v,str) else v,
                'model':'offline_protocol_fixture','usage':{'total_tokens':0}}

def action(name,args=None): return {'tool':name,'arguments':args or {}}

class WorkbenchTests(unittest.TestCase):
    def setUp(self): self.w=Workspace()
    def tearDown(self): self.w.close()
    def test_actual_python_results_and_sources(self):
        r=self.w.run('gross-margin-change','Aurora Orchard',2024)
        self.assertEqual(r['calculations'][0]['display'],'5.00 pp')
        self.assertEqual(len(r['facts']),4)
        self.assertEqual(len(r['citations']),2)
        self.assertEqual(self.w.run('search','Aurora Orchard',2024,'revenue')['status'],'EVIDENCE_FOUND')
    def test_request_bounds_and_missing_year(self):
        for args in [('delete','Aurora Orchard',2024),('search','bad',2024),('search','Aurora Orchard',True)]:
            with self.assertRaises(RequestError): self.w.run(*args)
        with self.assertRaises(ValueError): self.w.run('revenue-growth','Aurora Orchard',2023)
    def test_model_selects_tools_but_does_not_author_numbers(self):
        p=Decisions([action('calculate_metric',{'metric':'revenue-growth'}),action('finish')])
        r=run_agent(self.w,'收入同比是多少？','Aurora Orchard',2024,provider=p)
        self.assertEqual(r['calculations'][0]['display'],'20.00%')
        self.assertEqual(r['mode'],'model_assisted_synthetic')
        self.assertEqual(p.calls,2)
        self.assertEqual([x['tool'] for x in r['tool_trace']],['calculate_metric','finish'])
    def test_model_cannot_change_selected_scope_or_run_code(self):
        for a in [action('shell',{'cmd':'id'}),action('calculate_metric',{'metric':'gross-margin','company':'Harbor Lantern'}),action('search_documents',{'query':'revenue','url':'https://example.com'})]:
            with self.subTest(a=a),self.assertRaises(ProviderError):
                run_agent(self.w,'查收入','Aurora Orchard',2024,provider=Decisions([a]))
    def test_model_repeat_empty_finish_and_budget_fail_closed(self):
        scenarios=[([action('finish')],'AGENT_NO_RESULT'),
                   ([action('get_financial_facts'),action('get_financial_facts')],'AGENT_REPEAT'),
                   ([action('search_documents',{'query':x}) for x in ['revenue','profit','water','safety']],'AGENT_BUDGET')]
        for values,code in scenarios:
            with self.subTest(code=code),self.assertRaisesRegex(ProviderError,code):
                run_agent(self.w,'查资料','Aurora Orchard',2024,provider=Decisions(values))
    def test_one_format_repair_and_provider_failure_not_fallback(self):
        p=Decisions(['bad',action('calculate_metric',{'metric':'gross-margin'}),action('finish')])
        self.assertEqual(run_agent(self.w,'毛利率','Aurora Orchard',2024,provider=p)['calculations'][0]['display'],'30.00%')
        for values in [['bad','bad'],[ProviderError('MODEL_TIMEOUT: no response')]]:
            with self.assertRaises(ProviderError): run_agent(self.w,'毛利率','Aurora Orchard',2024,provider=Decisions(values))
    def test_later_search_preserves_completed_calculation(self):
        p=Decisions([action('calculate_metric',{'metric':'revenue-growth'}),action('search_documents',{'query':'revenue'}),action('finish')])
        r=run_agent(self.w,'收入同比与原文','Aurora Orchard',2024,provider=p)
        self.assertEqual(r['calculations'][0]['display'],'20.00%')
        self.assertEqual(len(r['tool_results']),2)
        self.assertEqual(len(r['citations']),2)

    def test_total_budget_checked_after_provider_call(self):
        times=iter([0,0,46])
        p=Decisions([action('calculate_metric',{'metric':'gross-margin'})])
        with self.assertRaisesRegex(ProviderError,'AGENT_TIMEOUT'):
            run_agent(self.w,'毛利率','Aurora Orchard',2024,provider=p,clock=lambda:next(times))

    def test_missing_key_is_explicit(self):
        with patch.dict('os.environ',{'FINEVIDENCE_API_KEY':''}),self.assertRaisesRegex(ProviderError,'MODEL_NOT_CONFIGURED'):
            run_agent(self.w,'毛利率','Aurora Orchard',2024)

if __name__=='__main__': unittest.main()
