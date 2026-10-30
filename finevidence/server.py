"""Loopback-only reviewer workbench. Not an authenticated public hosting server."""
import argparse,json,os,secrets,threading,sqlite3,time
from .review_ledger import ReviewLedger, ReviewError
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from socketserver import TCPServer
from pathlib import Path
from uuid import uuid4
from .service import Workspace,ROOT
from .agent import run_agent

BODY_TIMEOUT_SECONDS = 5

ASSETS={'/':('index.html','text/html'),'/index.html':('index.html','text/html'),
 '/bootstrap.mjs':('bootstrap.mjs','text/javascript'),
 '/workbench.mjs':('workbench.mjs','text/javascript'),
 '/styles.css':('styles.css','text/css'),'/app.mjs':('app.mjs','text/javascript'),
 '/engine.mjs':('engine.mjs','text/javascript'),'/replay.mjs':('replay.mjs','text/javascript'),'/handoff.mjs':('handoff.mjs','text/javascript'),'/state.mjs':('state.mjs','text/javascript'),
 '/fact-draft.mjs':('fact-draft.mjs','text/javascript'),'/fact-draft-panel.mjs':('fact-draft-panel.mjs','text/javascript'),
 '/fact-draft-import.mjs':('fact-draft-import.mjs','text/javascript'),'/fact-draft-import-panel.mjs':('fact-draft-import-panel.mjs','text/javascript'),
 '/draft-review.mjs':('draft-review.mjs','text/javascript'),
 '/review-ledger-panel.mjs':('review-ledger-panel.mjs','text/javascript'),
 '/file-name.mjs':('file-name.mjs','text/javascript'),
 '/review-brief.mjs':('review-brief.mjs','text/javascript'),
 '/source-catalog.mjs':('source-catalog.mjs','text/javascript'),
 '/pdf-preview.mjs':('pdf-preview.mjs','text/javascript'),'/pdf-preview-panel.mjs':('pdf-preview-panel.mjs','text/javascript'),
 '/pdf-intake.mjs':('pdf-intake.mjs','text/javascript'),'/pdf-panel.mjs':('pdf-panel.mjs','text/javascript'),
 '/vendor/pdf.min.mjs':('vendor/pdf.min.mjs','text/javascript'),'/vendor/pdf.worker.min.mjs':('vendor/pdf.worker.min.mjs','text/javascript'),
 '/pdf-demo.pdf':('pdf-demo.pdf','application/pdf'),
 '/bundle.json':('bundle.json','application/json'),'/manifest.json':('manifest.json','application/json')}

def error_payload(code):
    return {'schema_version':'1.0','trace_id':uuid4().hex,'mode':'local_workbench','status':code,
            'answer':None,'facts':[],'citations':[],'calculations':[],'claims':[]}

def _unique_request_object(pairs):
    """Reject ambiguous decoded names before scope, operation or review dispatch."""
    obj={}
    for key,value in pairs:
        if key in obj: raise ValueError()
        obj[key]=value
    return obj

class Handler(BaseHTTPRequestHandler):
    server_version='FinEvidence'
    def log_message(self,*args): pass  # No prompts, keys, user notes or provider bodies in access logs.
    def setup(self):
        super().setup();self.connection.settimeout(5)
    def _read_body(self, size):
        """Bound the whole body read, including clients that keep sending bytes."""
        deadline = time.monotonic() + BODY_TIMEOUT_SECONDS
        previous_timeout = self.connection.gettimeout()
        body = bytearray()
        try:
            while len(body) < size:
                remaining = deadline - time.monotonic()
                if remaining <= 0: raise TimeoutError('REQUEST_TIMEOUT')
                self.connection.settimeout(remaining)
                # read(size) may issue many raw reads, each resetting socket timeout.
                chunk = self.rfile.read1(size - len(body))
                if time.monotonic() >= deadline: raise TimeoutError('REQUEST_TIMEOUT')
                if not chunk: break  # Caller rejects a premature EOF as invalid input.
                body.extend(chunk)
            return bytes(body)
        finally:
            self.connection.settimeout(previous_timeout)
    def _send(self,status,data,kind='application/json'):
        raw=json.dumps(data,ensure_ascii=False).encode() if kind=='application/json' and not isinstance(data,bytes) else data
        self.send_response(status)
        for k,v in {'Content-Type':kind+'; charset=utf-8','Content-Length':str(len(raw)),
            'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
            'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}.items(): self.send_header(k,v)
        self.end_headers();self.wfile.write(raw)
    def _trusted(self):
        port=self.server.server_address[1]
        hosts={f'127.0.0.1:{port}',f'localhost:{port}'}
        if self.headers.get('Host') not in hosts or self.headers.get('Sec-Fetch-Site')=='cross-site': return False
        origin=self.headers.get('Origin')
        return origin is None or origin in {'http://'+h for h in hosts}
    def do_GET(self):
        if not self._trusted(): return self._send(403,error_payload('ORIGIN_REJECTED'))
        path=self.path.split('?',1)[0]
        if path in ('/api/session','/runtime.json'): return self._send(200,{'csrf':self.server.csrf,'runtime':'python_local','model_configured':bool(os.environ.get('FINEVIDENCE_API_KEY')),'review_enabled':self.server.review_ledger is not None})
        if path == '/api/reviews': return self._review(None)
        prefix = f'/assets/{self.server.asset_version}/'
        versioned = bool(self.server.asset_version) and path.startswith(prefix)
        if versioned: path = '/' + path[len(prefix):]
        if path not in ASSETS: return self._send(404,error_payload('NOT_FOUND'))
        name,kind=ASSETS[path]
        if versioned:
            if name == 'index.html': return self._send(404,error_payload('NOT_FOUND'))
            name = prefix.lstrip('/') + name
        try: raw=(self.server.root/'web'/name).read_bytes()
        except OSError: return self._send(503,error_payload('ASSET_MISSING'))
        return self._send(200,raw,kind)
    def do_POST(self):
        csrf = self.headers.get('X-FinEvidence-CSRF', '')
        if not self._trusted() or not csrf.isascii() or not secrets.compare_digest(csrf,self.server.csrf):
            return self._send(403,error_payload('ORIGIN_REJECTED'))
        if self.path in ('/api/reviews','/api/reviews/revoke'):
            return self._review('record' if self.path=='/api/reviews' else 'revoke')
        if self.path!='/api/run': return self._send(404,error_payload('NOT_FOUND'))
        if self.headers.get('Content-Type','').split(';')[0]!='application/json' or self.headers.get('Transfer-Encoding'):
            return self._send(400,error_payload('INVALID_REQUEST'))
        try: size=int(self.headers.get('Content-Length','-1'))
        except ValueError: size=-1
        if size<0 or size>16384: return self._send(413,error_payload('REQUEST_LIMIT'))
        if not self.server.slots.acquire(blocking=False): return self._send(429,error_payload('SERVER_BUSY'))
        try:
            raw=self._read_body(size)
            if len(raw)!=size: return self._send(400,error_payload('INVALID_REQUEST'))
            try:
                d=json.loads(raw.decode('utf-8'),object_pairs_hook=_unique_request_object)
                if not isinstance(d,dict) or set(d)!={'operation','company','year','query'} or not all(isinstance(d[k],str) for k in ['operation','company','query']) or type(d['year']) is not int: raise ValueError()
            except (ValueError,UnicodeError,RecursionError): return self._send(400,error_payload('INVALID_REQUEST'))
            try:
                if d['operation']=='agent': result=run_agent(self.server.workspace,d['query'],d['company'],d['year'])
                else: result=self.server.workspace.run(d['operation'],d['company'],d['year'],d['query'])
            except ValueError as exc:
                code=str(exc).split(':',1)[0]
                if not code.replace('_','').isalnum() or len(code)>64: code='REQUEST_FAILED'
                payload=error_payload(code)
                if hasattr(exc,'model_audit'):payload['model']=exc.model_audit
                if hasattr(exc,'decision_diagnostics'):payload['decision_diagnostics']=exc.decision_diagnostics
                return self._send(422,payload)
            return self._send(200,result)
        except (OSError,TimeoutError): return self._send(408,error_payload('REQUEST_TIMEOUT'))
        except Exception: return self._send(500,error_payload('INTERNAL_ERROR'))
        finally: self.server.slots.release()

    def _review(self, action):
        if self.server.review_ledger is None: return self._send(503,error_payload('REVIEW_DISABLED'))
        auth=self.headers.get('Authorization','')
        if not auth.isascii() or not secrets.compare_digest(auth,'Bearer '+self.server.review_token):
            return self._send(401,error_payload('REVIEW_AUTH_REQUIRED'))
        if not self.server.slots.acquire(blocking=False): return self._send(429,error_payload('SERVER_BUSY'))
        try:
            if action is None: return self._send(200,self.server.review_ledger.list())
            if self.headers.get('Content-Type','').split(';')[0]!='application/json' or self.headers.get('Transfer-Encoding'):
                return self._send(400,error_payload('INVALID_REQUEST'))
            try: size=int(self.headers.get('Content-Length','-1'))
            except ValueError: size=-1
            if not 0<=size<=32768: return self._send(413,error_payload('REQUEST_LIMIT'))
            raw=self._read_body(size)
            if len(raw)!=size: return self._send(400,error_payload('INVALID_REQUEST'))
            try: body=json.loads(raw.decode('utf-8'),object_pairs_hook=_unique_request_object,parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
            except (ValueError,UnicodeError,RecursionError): return self._send(400,error_payload('INVALID_REQUEST'))
            return self._send(200,self.server.review_ledger.mutate(action,body))
        except ReviewError as exc: return self._send(exc.status,error_payload(str(exc)))
        except sqlite3.Error: return self._send(503,error_payload('REVIEW_STORE_UNAVAILABLE'))
        except (OSError,TimeoutError): return self._send(408,error_payload('REQUEST_TIMEOUT'))
        except Exception: return self._send(500,error_payload('INTERNAL_ERROR'))
        finally: self.server.slots.release()

class LoopbackHTTPServer(ThreadingHTTPServer):
    def server_bind(self):
        # HTTPServer's bind performs synchronous reverse DNS just for metadata.
        # This numeric-loopback service needs no hostname or external resolver.
        TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


def make_server(port=8765,root=ROOT,*,review_directory=None,reviewer=None,review_token=None):
    ledger=None
    if any(v is not None for v in (review_directory,reviewer,review_token)):
        if (not review_directory or not reviewer or not isinstance(review_token,str)
            or not 32<=len(review_token)<=256 or not review_token.isascii()
            or any(ord(c)<33 or ord(c)>126 for c in review_token)):
            raise ValueError('REVIEW_CONFIG_INVALID')
        ledger=ReviewLedger(review_directory,reviewer)
    server=LoopbackHTTPServer(('127.0.0.1',port),Handler)
    try: server.workspace=Workspace(root)
    except Exception: server.server_close();raise
    server.review_ledger=ledger;server.review_token=review_token
    server.root=Path(root);server.csrf=secrets.token_urlsafe(32);server.slots=threading.BoundedSemaphore(4)
    try: server.asset_version=json.loads((server.root/'web/manifest.json').read_text()).get('asset_version')
    except (OSError,ValueError): server.asset_version=None
    return server

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--review-directory',type=Path)
    parser.add_argument('--reviewer')
    args=parser.parse_args()
    from scripts.build_web import build
    build()
    config={}
    if args.review_directory or args.reviewer:
        import getpass
        token=os.environ.get('FINEVIDENCE_REVIEW_TOKEN') or getpass.getpass('Local review secret (32+ characters, keep in your password manager): ')
        config={'review_directory':args.review_directory,'reviewer':args.reviewer,'review_token':token}
    try: server=make_server(args.port,**config)
    except ReviewError as error:
        import sys
        print(str(error) + ': Keep the original database and journal together.', file=sys.stderr)
        if str(error) == 'REVIEW_RECOVERY_REQUIRED':
            print('Stop all writers, then use python3 -m finevidence.review_recovery --help; see docs/LOCAL_REVIEW_LEDGER.md.', file=sys.stderr)
        elif str(error) == 'REVIEW_STORE_PATH':
            print('reviews.sqlite must be an accessible regular file. Preserve the existing path; use a new private directory if needed.', file=sys.stderr)
        return 2
    print(f'FinEvidence: http://127.0.0.1:{server.server_address[1]} (loopback only)',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close();server.workspace.close()
if __name__=='__main__': raise SystemExit(main())
