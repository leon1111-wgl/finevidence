"""Offline protocol inputs; no provider request or real-model-quality claim."""
import http.client
import json
import threading
import unittest
from unittest.mock import patch

from finevidence.agent import run_agent
from finevidence.provider import ProviderError
from finevidence.server import make_server
from finevidence.service import Workspace
from tests.test_workbench import Decisions, action

CANARY='PRIVATE_DIAGNOSTIC_CANARY'
# Literal, independently chosen failure classes. Do not send these as model prompts.
CASES=[
    ('{'+CANARY,'INVALID_JSON','AGENT_FORMAT'),
    ('[]','DECISION_SCHEMA','AGENT_FORMAT'),
    (json.dumps({'tool':'finish'}),'DECISION_SCHEMA','AGENT_FORMAT'),
    (json.dumps({'tool':7,'arguments':{}}),'DECISION_SCHEMA','AGENT_FORMAT'),
    (json.dumps({'tool':'finish','arguments':[]}),'DECISION_SCHEMA','AGENT_FORMAT'),
    (json.dumps(action(CANARY)),'UNKNOWN_TOOL','AGENT_TOOL_REJECTED'),
    (json.dumps(action('finish',{CANARY:True})),'ARGUMENT_KEYS','AGENT_TOOL_REJECTED'),
    (json.dumps(action('get_financial_facts',{CANARY:True})),'ARGUMENT_KEYS','AGENT_TOOL_REJECTED'),
    (json.dumps(action('search_documents',{'query':'revenue','url':CANARY})),'ARGUMENT_KEYS','AGENT_TOOL_REJECTED'),
    (json.dumps(action('search_documents',{'query':True})),'ARGUMENT_VALUE','AGENT_TOOL_REJECTED'),
    (json.dumps(action('calculate_metric',{'metric':CANARY})),'ARGUMENT_VALUE','AGENT_TOOL_REJECTED'),
    (json.dumps(action('calculate_metric',{'metric':{CANARY:True}})),'ARGUMENT_VALUE','AGENT_TOOL_REJECTED'),
]

class AgentDiagnosticsTests(unittest.TestCase):
    def setUp(self):self.workspace=Workspace()
    def tearDown(self):self.workspace.close()
    def test_rejected_decisions_have_noncontent_categories_and_execute_no_tool(self):
        for raw,category,code in CASES:
            with self.subTest(category=category,code=code):
                # Format repair is already allowed once; invalid tools get no repair.
                calls=2 if code=='AGENT_FORMAT' else 1
                provider=Decisions([raw]*calls)
                with patch.object(self.workspace,'run',side_effect=AssertionError('Rejected decision reached business tool')):
                    with self.assertRaisesRegex(ProviderError,code) as caught:
                        run_agent(self.workspace,'核对收入','Aurora Orchard',2024,provider=provider)
                expected=[{'call':i,'category':category} for i in range(1,calls+1)]
                actual=getattr(caught.exception,'decision_diagnostics',None)
                self.assertEqual(actual,expected)
                self.assertNotIn(CANARY,str(caught.exception)+json.dumps(actual))
                self.assertEqual(caught.exception.model_audit['calls'],calls)
    def test_recovered_format_retains_category_without_invalid_content(self):
        p=Decisions(['{'+CANARY,action('calculate_metric',{'metric':'gross-margin'}),action('finish')])
        result=run_agent(self.workspace,'毛利率','Aurora Orchard',2024,provider=p)
        self.assertEqual(result['calculations'][0]['display'],'30.00%')
        self.assertEqual(result.get('decision_diagnostics'),[{'call':1,'category':'INVALID_JSON'}])
        self.assertNotIn(CANARY,json.dumps(result))
        self.assertEqual(result['model']['calls'],3)
    def test_format_then_transport_failure_keeps_diagnostics_and_unknown_usage(self):
        p=Decisions(['{'+CANARY,ProviderError('MODEL_TIMEOUT: no response')])
        with self.assertRaisesRegex(ProviderError,'MODEL_TIMEOUT') as caught:
            run_agent(self.workspace,'毛利率','Aurora Orchard',2024,provider=p)
        self.assertEqual(getattr(caught.exception,'decision_diagnostics',None),[{'call':1,'category':'INVALID_JSON'}])
        self.assertEqual(caught.exception.model_audit['calls'],2)
        self.assertFalse(caught.exception.model_audit['usage_complete'])
        self.assertEqual(caught.exception.model_audit['calls_with_unknown_usage'],1)
    def test_request_diagnostics_do_not_leak_into_next_request(self):
        with self.assertRaises(ProviderError):
            run_agent(self.workspace,'毛利率','Aurora Orchard',2024,provider=Decisions([action(CANARY)]))
        r=run_agent(self.workspace,'毛利率','Aurora Orchard',2024,provider=Decisions([action('calculate_metric',{'metric':'gross-margin'}),action('finish')]))
        self.assertEqual(r['calculations'][0]['display'],'30.00%')
        self.assertFalse(r.get('decision_diagnostics'))
    def test_real_http_serializes_categories_and_empty_financial_result(self):
        server=make_server(port=0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            port=server.server_address[1]
            for raw,category,code in CASES:
                with self.subTest(category=category,code=code):
                    calls=2 if code=='AGENT_FORMAT' else 1
                    with patch('finevidence.agent.ModelProvider',return_value=Decisions([raw]*calls)):
                        conn=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
                        try:
                            conn.request('POST','/api/run',json.dumps({'operation':'agent','company':'Aurora Orchard','year':2024,'query':'核对收入'}),{'Content-Type':'application/json','X-FinEvidence-CSRF':server.csrf})
                            response=conn.getresponse();body=response.read().decode();result=json.loads(body)
                            self.assertEqual(response.status,422)
                        finally:conn.close()
                    self.assertEqual(result['status'],code)
                    self.assertEqual(result.get('decision_diagnostics'),[{'call':i,'category':category} for i in range(1,calls+1)])
                    self.assertIsNone(result['answer']);self.assertEqual(result['facts'],[])
                    self.assertEqual(result['calculations'],[]);self.assertEqual(result['citations'],[])
                    self.assertNotIn(CANARY,body)
                    self.assertEqual(result['model']['calls'],calls)
        finally:
            server.shutdown();server.server_close();server.workspace.close();thread.join()
