"""Ambiguous model JSON is refused before tools; synthetic offline decisions only."""
import http.client
import json
import threading
import unittest
from unittest.mock import patch

from finevidence.agent import _decision, run_agent, DecisionError
from finevidence.server import make_server
from finevidence.service import Workspace
from tests.test_workbench import Decisions, action

CANARY = 'SYNTHETIC_DUPLICATE_PRIVATE_CANARY'
# Literal raw JSON is necessary: serializing a dict would erase the defect.
DUPLICATES = [
    ('tool-overwrite', '{"tool":"'+CANARY+'","tool":"calculate_metric","arguments":{"metric":"gross-margin"}}'),
    ('same-tool', '{"tool":"calculate_metric","tool":"calculate_metric","arguments":{"metric":"gross-margin"}}'),
    ('arguments-overwrite', '{"tool":"calculate_metric","arguments":{"'+CANARY+'":true},"arguments":{"metric":"gross-margin"}}'),
    ('metric-overwrite', '{"tool":"calculate_metric","arguments":{"metric":"'+CANARY+'","metric":"gross-margin"}}'),
    ('escaped-metric', r'{"tool":"calculate_metric","arguments":{"met\u0072ic":"bad","metric":"gross-margin"}}'),
    ('query-overwrite', '{"tool":"search_documents","arguments":{"query":"'+CANARY+'","query":"revenue"}}'),
    ('escaped-tool', r'{"to\u006fl":"bad","tool":"calculate_metric","arguments":{"metric":"gross-margin"}}'),
    ('empty-arguments', '{"tool":"get_financial_facts","arguments":{},"arguments":{}}'),
]

class AgentJsonKeyTests(unittest.TestCase):
    def setUp(self): self.workspace = Workspace()
    def tearDown(self): self.workspace.close()

    def test_duplicate_names_are_rejected_before_tool_execution(self):
        for name, raw in DUPLICATES:
            with self.subTest(name=name):
                provider = Decisions([raw, action('finish')])
                with patch.object(self.workspace, 'run', wraps=self.workspace.run) as run:
                    with self.assertRaisesRegex(DecisionError, 'AGENT_TOOL_REJECTED') as caught:
                        run_agent(self.workspace, '核对收入', 'Aurora Orchard', 2024, provider=provider)
                    run.assert_not_called()
                self.assertEqual(provider.calls, 1, 'ambiguous decisions do not get a retry')
                self.assertEqual(caught.exception.decision_diagnostics, [{'call':1,'category':'DUPLICATE_KEYS'}])
                self.assertNotIn(CANARY, str(caught.exception)+json.dumps(caught.exception.decision_diagnostics))

    def test_duplicate_rejection_preserves_reported_usage(self):
        class Measured(Decisions):
            def complete(self, messages, timeout):
                result = super().complete(messages, timeout)
                result['usage'] = {'total_tokens': 17}
                return result
        with self.assertRaises(DecisionError) as caught:
            run_agent(self.workspace, '核对收入', 'Aurora Orchard', 2024,
                      provider=Measured([DUPLICATES[0][1], action('finish')]))
        self.assertEqual(caught.exception.model_audit['calls'], 1)
        self.assertEqual(caught.exception.model_audit['usage'], {'total_tokens':17})
        self.assertTrue(caught.exception.model_audit['usage_complete'])

    def test_prior_format_failure_and_unknown_usage_are_retained(self):
        class Unmetered(Decisions):
            def complete(self, messages, timeout):
                result = super().complete(messages, timeout); result['usage'] = {}; return result
        with self.assertRaises(DecisionError) as caught:
            run_agent(self.workspace, '核对收入', 'Aurora Orchard', 2024,
                      provider=Unmetered(['{', DUPLICATES[3][1], action('finish')]))
        self.assertEqual(caught.exception.decision_diagnostics,
                         [{'call':1,'category':'INVALID_JSON'},{'call':2,'category':'DUPLICATE_KEYS'}])
        self.assertEqual(caught.exception.model_audit['calls'], 2)
        self.assertEqual(caught.exception.model_audit['calls_with_unknown_usage'], 2)
        self.assertEqual(caught.exception.model_audit['usage'], {})

    def test_unambiguous_escaped_keys_and_key_like_strings_stay_valid(self):
        self.assertEqual(_decision(r'{"to\u006fl":"calculate_metric","arguments":{"met\u0072ic":"gross-margin"}}'),
                         ('calculate_metric', {'metric':'gross-margin'}))
        query = '{"query":"one","query":"two"} 财务'
        self.assertEqual(_decision(json.dumps(action('search_documents', {'query':query}))),
                         ('search_documents', {'query':query}))
        result = run_agent(self.workspace, '毛利率', 'Aurora Orchard', 2024,
                           provider=Decisions([action('calculate_metric', {'metric':'gross-margin'}),action('finish')]))
        expected = self.workspace.run('gross-margin', 'Aurora Orchard', 2024)
        for key in ('calculations','facts','citations'): self.assertEqual(result[key], expected[key])
        self.assertEqual(result['calculations'][0]['display'], '30.00%')
        self.assertNotIn('decision_diagnostics', result)

    def test_distinct_extra_key_is_still_an_argument_error(self):
        with self.assertRaises(DecisionError) as caught:
            _decision('{"tool":"calculate_metric","arguments":{"metric":"gross-margin","Metric":"gross-margin"}}')
        self.assertEqual(caught.exception.category, 'ARGUMENT_KEYS')
        with self.assertRaises(DecisionError) as caught:
            _decision(json.dumps(action(CANARY)))
        self.assertEqual(caught.exception.category, 'UNKNOWN_TOOL')

    def test_real_http_refuses_duplicate_names_without_financial_output(self):
        server = make_server(port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            for name, raw in DUPLICATES:
                with self.subTest(name=name), patch('finevidence.agent.ModelProvider', return_value=Decisions([raw,action('finish')])):
                    conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
                    try:
                        conn.request('POST','/api/run',json.dumps({'operation':'agent','company':'Aurora Orchard','year':2024,'query':'核对收入'}),
                                     {'Content-Type':'application/json','X-FinEvidence-CSRF':server.csrf})
                        response = conn.getresponse(); body = response.read().decode(); result = json.loads(body)
                    finally: conn.close()
                    self.assertEqual(response.status, 422)
                    self.assertEqual(result['status'], 'AGENT_TOOL_REJECTED')
                    self.assertEqual(result['decision_diagnostics'], [{'call':1,'category':'DUPLICATE_KEYS'}])
                    self.assertIsNone(result['answer'])
                    for key in ('facts','calculations','citations'): self.assertEqual(result[key], [])
                    self.assertEqual(result['model']['calls'], 1)
                    self.assertNotIn(CANARY, body)
        finally:
            server.shutdown(); server.server_close(); server.workspace.close(); thread.join()

if __name__ == '__main__': unittest.main()
