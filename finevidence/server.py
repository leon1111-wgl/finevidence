"""Loopback-only reviewer workbench. Not an authenticated public hosting server."""
import argparse,json,os,secrets,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4
from .service import Workspace,ROOT
from .agent import run_agent

ASSETS={'/':('index.html','text/html'),'/index.html':('index.html','text/html'),
 '/bootstrap.mjs':('bootstrap.mjs','text/javascript'),
 '/workbench.mjs':('workbench.mjs','text/javascript'),
 '/styles.css':('styles.css','text/css'),'/app.mjs':('app.mjs','text/javascript'),
 '/engine.mjs':('engine.mjs','text/javascript'),'/replay.mjs':('replay.mjs','text/javascript'),'/handoff.mjs':('handoff.mjs','text/javascript'),'/state.mjs':('state.mjs','text/javascript'),
 '/fact-draft.mjs':('fact-draft.mjs','text/javascript'),'/fact-draft-panel.mjs':('fact-draft-panel.mjs','text/javascript'),
 '/fact-draft-import.mjs':('fact-draft-import.mjs','text/javascript'),'/fact-draft-import-panel.mjs':('fact-draft-import-panel.mjs','text/javascript'),
 '/file-name.mjs':('file-name.mjs','text/javascript'),
 '/source-catalog.mjs':('source-catalog.mjs','text/javascript'),
 '/pdf-preview.mjs':('pdf-preview.mjs','text/javascript'),'/pdf-preview-panel.mjs':('pdf-preview-panel.mjs','text/javascript'),
 '/pdf-intake.mjs':('pdf-intake.mjs','text/javascript'),'/pdf-panel.mjs':('pdf-panel.mjs','text/javascript'),
 '/vendor/pdf.min.mjs':('vendor/pdf.min.mjs','text/javascript'),'/vendor/pdf.worker.min.mjs':('vendor/pdf.worker.min.mjs','text/javascript'),
 '/pdf-demo.pdf':('pdf-demo.pdf','application/pdf'),
 '/bundle.json':('bundle.json','application/json'),'/manifest.json':('manifest.json','application/json')}

def error_payload(code):
    return {'schema_version':'1.0','trace_id':uuid4().hex,'mode':'local_workbench','status':code,
            'answer':None,'facts':[],'citations':[],'calculations':[],'claims':[]}

class Handler(BaseHTTPRequestHandler):
    server_version='FinEvidence'
    def log_message(self,*args): pass  # No prompts, keys, user notes or provider bodies in access logs.
    def setup(self):
        super().setup();self.connection.settimeout(5)
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
        if path in ('/api/session','/runtime.json'): return self._send(200,{'csrf':self.server.csrf,'runtime':'python_local','model_configured':bool(os.environ.get('FINEVIDENCE_API_KEY'))})
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
        if self.path!='/api/run': return self._send(404,error_payload('NOT_FOUND'))
        if self.headers.get('Content-Type','').split(';')[0]!='application/json' or self.headers.get('Transfer-Encoding'):
            return self._send(400,error_payload('INVALID_REQUEST'))
        try: size=int(self.headers.get('Content-Length','-1'))
        except ValueError: size=-1
        if size<0 or size>16384: return self._send(413,error_payload('REQUEST_LIMIT'))
        if not self.server.slots.acquire(blocking=False): return self._send(429,error_payload('SERVER_BUSY'))
        try:
            raw=self.rfile.read(size)
            if len(raw)!=size: return self._send(400,error_payload('INVALID_REQUEST'))
            try:
                d=json.loads(raw.decode('utf-8'))
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

def make_server(port=8765,root=ROOT):
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    try: server.workspace=Workspace(root)
    except Exception: server.server_close();raise
    server.root=Path(root);server.csrf=secrets.token_urlsafe(32);server.slots=threading.BoundedSemaphore(4)
    try: server.asset_version=json.loads((server.root/'web/manifest.json').read_text()).get('asset_version')
    except (OSError,ValueError): server.asset_version=None
    return server

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=8765);args=parser.parse_args()
    from scripts.build_web import build
    build()
    server=make_server(args.port)
    print(f'FinEvidence: http://127.0.0.1:{server.server_address[1]} (loopback only)',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close();server.workspace.close()
if __name__=='__main__': main()
