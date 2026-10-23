import http.client,json,threading,unittest
from finevidence.server import make_server

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=make_server(port=0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.port=cls.server.server_address[1]
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.server.workspace.close();cls.thread.join()
    def req(self,path,method='GET',data=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=3)
        c.request(method,path,body=data,headers=headers or {});r=c.getresponse();raw=r.read();out=(r.status,dict(r.getheaders()),raw);c.close();return out
    def session(self): return json.loads(self.req('/api/session')[2])
    def post(self,data,headers=None):
        h={'Content-Type':'application/json','X-FinEvidence-CSRF':self.session()['csrf']};h.update(headers or {})
        return self.req('/api/run','POST',json.dumps(data),h)
    def test_workflow_uses_python_and_session_does_not_leak_key(self):
        self.assertNotIn('key',self.session())
        code,headers,raw=self.post({'operation':'gross-margin','company':'Aurora Orchard','year':2024,'query':''})
        self.assertEqual(code,200);self.assertEqual(json.loads(raw)['calculations'][0]['display'],'30.00%')
        self.assertNotIn('Access-Control-Allow-Origin',headers)
    def test_origin_host_csrf_and_input_boundaries(self):
        for headers in [{'Origin':'https://evil.invalid'},{'Host':'evil.invalid'},{'X-FinEvidence-CSRF':'bad'}]:
            self.assertEqual(self.post({'operation':'search','company':'Aurora Orchard','year':2024,'query':'revenue'},headers)[0],403)
        self.assertEqual(self.req('/api/session',headers={'Sec-Fetch-Site':'cross-site'})[0],403)
        self.assertEqual(self.post({'operation':'search','company':'Aurora Orchard','year':2024,'query':'revenue','sql':'SELECT 1'})[0],400)
        self.assertEqual(self.post({'operation':[],'company':'Aurora Orchard','year':2024,'query':'revenue'})[0],400)
        self.assertEqual(self.req('/../finevidence/provider.py')[0],404)
    def test_invalid_json_and_oversize(self):
        h={'Content-Type':'application/json','X-FinEvidence-CSRF':self.session()['csrf']}
        self.assertEqual(self.req('/api/run','POST','{',h)[0],400)
        self.assertEqual(self.req('/api/run','POST','a'*17000,h)[0],413)
    def test_missing_prior_year_is_structured_failure(self):
        code,_,raw=self.post({'operation':'revenue-growth','company':'Aurora Orchard','year':2023,'query':''})
        r=json.loads(raw);self.assertEqual(code,422);self.assertIsNone(r['answer']);self.assertEqual(r['citations'],[])

    def test_non_ascii_csrf_is_structured_rejection_and_server_remains_usable(self):
        for value in ['é', 'badÿtoken']:
            with self.subTest(value=value):
                code, _, raw = self.post({'operation':'gross-margin','company':'Aurora Orchard','year':2024,'query':''}, {'X-FinEvidence-CSRF':value})
                self.assertEqual(code, 403)
                payload = json.loads(raw)
                self.assertEqual(payload['status'], 'ORIGIN_REJECTED')
                self.assertIsNone(payload['answer'])
                self.assertEqual(payload['calculations'], [])
        code, _, raw = self.post({'operation':'gross-margin','company':'Aurora Orchard','year':2024,'query':''})
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(raw)['calculations'][0]['display'], '30.00%')

    def test_draft_modules_are_served_locally(self):
        for path in ['/fact-draft.mjs', '/fact-draft-panel.mjs']:
            code, headers, raw = self.req(path)
            self.assertEqual(code, 200)
            self.assertIn('text/javascript', headers['Content-Type'])
            self.assertGreater(len(raw), 100)
