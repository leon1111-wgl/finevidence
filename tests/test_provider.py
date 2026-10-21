import json,os,ssl,unittest
from unittest.mock import patch
from urllib.error import HTTPError,URLError
from finevidence.provider import ModelProvider,ProviderError,_NoRedirect

class Reply:
    def __init__(self,raw):self.raw=raw
    def __enter__(self):return self
    def __exit__(self,*a):pass
    def read(self,n):return self.raw[:n]
class Transport:
    def __init__(self,value):self.value=value;self.requests=[]
    def open(self,r,timeout):
        self.requests.append((r,timeout))
        if isinstance(self.value,Exception):raise self.value
        return Reply(self.value)
class ProviderTests(unittest.TestCase):
    def provider(self,value):
        with patch.dict(os.environ,{'FINEVIDENCE_API_KEY':'test-only','FINEVIDENCE_API_BASE':'https://example.invalid/v1','FINEVIDENCE_MODEL':'test-model'}):p=ModelProvider()
        p.opener=Transport(value);return p
    def test_bounded_request_and_filtered_usage(self):
        raw=json.dumps({'model':'test-model','choices':[{'finish_reason':'stop','message':{'content':'{"tool":"finish","arguments":{}}'}}],'usage':{'total_tokens':12,'internal':'private'}}).encode()
        p=self.provider(raw);r=p.complete([{'role':'user','content':'fixture'}],100)
        request,timeout=p.opener.requests[0];body=json.loads(request.data)
        self.assertEqual(timeout,15);self.assertEqual(body['max_tokens'],256);self.assertFalse(body['stream']);self.assertEqual(r['usage'],{'total_tokens':12})
    def test_transport_errors_are_safe_and_no_retry(self):
        for exc,code in [(HTTPError('https://example.invalid',401,'private-value',{},None),'MODEL_HTTP_401'),(TimeoutError(),'MODEL_TIMEOUT'),(URLError(ssl.SSLError('private-value')),'MODEL_TLS')]:
            p=self.provider(exc)
            with self.assertRaisesRegex(ProviderError,code) as got:p.complete([])
            self.assertNotIn('private-value',str(got.exception));self.assertEqual(len(p.opener.requests),1)
    def test_partial_invalid_and_oversize_results_rejected(self):
        for raw in [b'bad',b'x'*65537,json.dumps({'choices':[{'finish_reason':'length','message':{'content':'{}'}}]}).encode(),b'{}',json.dumps({'choices':[{'finish_reason':'stop','message':{'content':'{}'}}],'usage':[]}).encode()]:
            with self.assertRaises(ProviderError):self.provider(raw).complete([])
    def test_endpoint_and_redirect_cannot_forward_key(self):
        for base in ['http://example.invalid/v1','https://user:pass@example.invalid/v1','https://example.invalid/v1?key=a']:
            with patch.dict(os.environ,{'FINEVIDENCE_API_KEY':'test-only','FINEVIDENCE_API_BASE':base}),self.assertRaises(ProviderError):ModelProvider()
        self.assertIsNone(_NoRedirect().redirect_request(None,None,302,'Found',{},'https://other.invalid'))
