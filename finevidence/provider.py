"""Bounded OpenAI-compatible transport; credentials stay in process memory."""
import json
import os
import math
import re
import signal
import subprocess
import sys
import time
from pathlib import Path
import socket
import ssl
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler, HTTPSHandler
from urllib.error import HTTPError, URLError

class ProviderError(ValueError): pass
class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

class _Transport:
    """Blocking transport used only inside the disposable worker."""
    def __init__(self, settings=None):
        settings = os.environ if settings is None else settings
        self.key=settings.get('FINEVIDENCE_API_KEY','')
        self.base=settings.get('FINEVIDENCE_API_BASE','https://apirouter.mornai.cn/v1').rstrip('/')
        self.model=settings.get('FINEVIDENCE_MODEL','deepseek-v4-1-flash')
        if not self.key: raise ProviderError('MODEL_NOT_CONFIGURED: configure the server environment')
        u=urlsplit(self.base)
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment:
            raise ProviderError('MODEL_CONFIGURATION: endpoint must be an HTTPS base URL')
        if not self.model or len(self.model)>200: raise ProviderError('MODEL_CONFIGURATION: invalid model')
        # macOS framework Python may have no default CA bundle. Use the system trust bundle,
        # never CERT_NONE. An explicit SSL_CERT_FILE remains authoritative.
        ca=settings.get('SSL_CERT_FILE')
        if not ca and ssl.get_default_verify_paths().cafile is None and Path('/etc/ssl/cert.pem').is_file():
            ca='/etc/ssl/cert.pem'
        self.ca = ca
        try: context=ssl.create_default_context(cafile=ca)
        except (OSError,ssl.SSLError) as exc:
            raise ProviderError('MODEL_TLS: trusted CA bundle unavailable') from exc
        self.opener=build_opener(_NoRedirect(),HTTPSHandler(context=context))
    def _body(self,messages):
        payload={'model':self.model,'messages':messages,'max_tokens':256,'stream':False,
                 'thinking':{'type':'disabled'},'response_format':{'type':'json_object'}}
        body=json.dumps(payload,ensure_ascii=False).encode('utf-8')
        if len(body)>24000: raise ProviderError('MODEL_INPUT_LIMIT: request too large')
        return body

    def complete(self,messages,timeout=15):
        body = self._body(messages)
        request=Request(self.base+'/chat/completions',data=body,headers={
            'Authorization':'Bearer '+self.key,'Content-Type':'application/json'})
        try:
            with self.opener.open(request,timeout=max(0.01,min(15,timeout))) as response:
                raw=response.read(65537)
            if len(raw)>65536: raise ProviderError('MODEL_OUTPUT_LIMIT: response exceeds limit')
            data=json.loads(raw.decode('utf-8'))
            choice=data['choices'][0]
            content=choice['message']['content']
            if choice.get('finish_reason')!='stop' or not isinstance(content,str) or len(content)>6000:
                raise ProviderError('MODEL_RESPONSE: incomplete or invalid output')
            usage=data.get('usage',{})
            if not isinstance(usage,dict): raise ProviderError('MODEL_RESPONSE: invalid usage object')
            clean_usage={k:v for k,v in usage.items() if k in ('prompt_tokens','completion_tokens','total_tokens') and type(v) is int and v>=0}
            return {'content':content,'model':str(data.get('model',self.model))[:200],'usage':clean_usage}
        except HTTPError as exc:
            # Never echo a provider body, which can contain credentials or prompts.
            raise ProviderError(f'MODEL_HTTP_{exc.code}: provider rejected the request') from None
        except (TimeoutError,socket.timeout): raise ProviderError('MODEL_TIMEOUT: provider deadline exceeded') from None
        except URLError as exc:
            code=('MODEL_TIMEOUT' if isinstance(exc.reason,TimeoutError) else
                  'MODEL_TLS' if isinstance(exc.reason,ssl.SSLError) else 'MODEL_NETWORK')
            raise ProviderError(code+': provider connection failed') from None
        except (UnicodeError,KeyError,IndexError,TypeError,ValueError,RecursionError) as exc:
            if isinstance(exc,ProviderError): raise
            raise ProviderError('MODEL_RESPONSE: invalid provider response') from None


_WORKER_CODES = frozenset({
    'MODEL_NOT_CONFIGURED', 'MODEL_CONFIGURATION', 'MODEL_TLS', 'MODEL_NETWORK',
    'MODEL_TIMEOUT', 'MODEL_INPUT_LIMIT', 'MODEL_OUTPUT_LIMIT', 'MODEL_RESPONSE', 'MODEL_WORKER',
})

def _safe_code(code):
    return isinstance(code, str) and (code in _WORKER_CODES or re.fullmatch(r'MODEL_HTTP_[1-5][0-9]{2}', code))


class ModelProvider(_Transport):
    """One local deadline per call; no retry and no surviving network worker."""
    def complete(self, messages, timeout=15):
        started = time.monotonic()
        if type(timeout) not in (int, float) or (type(timeout) is float and not math.isfinite(timeout)):
            raise ProviderError('MODEL_CONFIGURATION: invalid timeout')
        if timeout <= 0:
            raise ProviderError('MODEL_TIMEOUT: provider deadline exceeded')
        deadline = started + min(15, timeout)
        self._body(messages)  # Preserve the request bound before starting a process.
        envelope = json.dumps({'settings': {
            'FINEVIDENCE_API_KEY': self.key, 'FINEVIDENCE_API_BASE': self.base,
            'FINEVIDENCE_MODEL': self.model, 'SSL_CERT_FILE': self.ca,
        }, 'messages': messages, 'deadline': deadline}, ensure_ascii=False).encode('utf-8')
        if len(envelope) > 131072:
            raise ProviderError('MODEL_INPUT_LIMIT: request envelope too large')
        # Secret and prompt go through the private pipe, never argv or a file.
        environment = {k: v for k, v in os.environ.items() if not k.startswith('FINEVIDENCE_')}
        process = None
        try:
            process = subprocess.Popen([sys.executable, '-I', str(Path(__file__).resolve())],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.DEVNULL, env=environment)
            raw, _ = process.communicate(envelope, timeout=max(0, deadline-time.monotonic()))
            if time.monotonic() >= deadline:
                raise ProviderError('MODEL_TIMEOUT: provider deadline exceeded')
            # IPC JSON may escape 6,000 non-BMP characters to 72,000 ASCII bytes.
            # The upstream body still has its independent 65,536-byte limit.
            if process.returncode or len(raw) > 131072:
                raise ProviderError('MODEL_WORKER: local transport failed')
            reply = json.loads(raw)
            if isinstance(reply, dict) and set(reply) == {'error'} and _safe_code(reply['error']):
                raise ProviderError(reply['error'] + ': provider request failed')
            if not isinstance(reply, dict) or set(reply) != {'result'} or not isinstance(reply['result'], dict):
                raise ProviderError('MODEL_WORKER: invalid local response')
            return reply['result']
        except subprocess.TimeoutExpired:
            raise ProviderError('MODEL_TIMEOUT: provider deadline exceeded') from None
        except OSError:
            raise ProviderError('MODEL_WORKER: local transport unavailable') from None
        except (ValueError, UnicodeError) as exc:
            if isinstance(exc, ProviderError): raise
            raise ProviderError('MODEL_WORKER: invalid local response') from None
        finally:
            if process is not None:
                if process.poll() is None: process.kill()
                process.wait()  # Reap before returning/releasing the HTTP request slot.
                for stream in (process.stdin, process.stdout):
                    if stream is not None: stream.close()


def _worker():
    """Fixed single-request IPC entry; emits no provider exceptions or diagnostics."""
    try:
        raw = sys.stdin.buffer.read(131073)
        if len(raw) > 131072: raise ProviderError('MODEL_INPUT_LIMIT')
        request = json.loads(raw)
        # The server can exit without running its request-thread finally block.
        # Arm an OS default-action timer in this disposable worker: it remains
        # effective during blocking TLS/read work and after the parent dies.
        # Reset inherited ignored/blocked alarms; never change the server's mask.
        # Missing Unix timer support fails closed below, before any network I/O.
        signal.signal(signal.SIGALRM, signal.SIG_DFL)
        signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGALRM})
        remaining = request['deadline'] - time.monotonic()
        if remaining <= 0: raise ProviderError('MODEL_TIMEOUT')
        signal.setitimer(signal.ITIMER_REAL, remaining)
        # Keep the timer armed through response serialization and process exit.
        transport = _Transport(request['settings'])
        remaining = request['deadline'] - time.monotonic()
        if remaining <= 0: raise ProviderError('MODEL_TIMEOUT')
        reply = {'result': transport.complete(request['messages'], remaining)}
    except ProviderError as exc:
        code = str(exc).split(':', 1)[0]
        reply = {'error': code if _safe_code(code) else 'MODEL_WORKER'}
    except Exception:
        reply = {'error': 'MODEL_WORKER'}
    sys.stdout.write(json.dumps(reply, ensure_ascii=True))


if __name__ == '__main__':
    _worker()
