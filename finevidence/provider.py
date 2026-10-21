"""Bounded OpenAI-compatible transport; credentials stay in process memory."""
import json
import os
from pathlib import Path
import socket
import ssl
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler, HTTPSHandler
from urllib.error import HTTPError, URLError

class ProviderError(ValueError): pass
class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

class ModelProvider:
    def __init__(self):
        self.key=os.environ.get('FINEVIDENCE_API_KEY','')
        self.base=os.environ.get('FINEVIDENCE_API_BASE','https://apirouter.mornai.cn/v1').rstrip('/')
        self.model=os.environ.get('FINEVIDENCE_MODEL','deepseek-v4-1-flash')
        if not self.key: raise ProviderError('MODEL_NOT_CONFIGURED: configure the server environment')
        u=urlsplit(self.base)
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment:
            raise ProviderError('MODEL_CONFIGURATION: endpoint must be an HTTPS base URL')
        if not self.model or len(self.model)>200: raise ProviderError('MODEL_CONFIGURATION: invalid model')
        # macOS framework Python may have no default CA bundle. Use the system trust bundle,
        # never CERT_NONE. An explicit SSL_CERT_FILE remains authoritative.
        ca=os.environ.get('SSL_CERT_FILE')
        if not ca and ssl.get_default_verify_paths().cafile is None and Path('/etc/ssl/cert.pem').is_file():
            ca='/etc/ssl/cert.pem'
        try: context=ssl.create_default_context(cafile=ca)
        except (OSError,ssl.SSLError) as exc:
            raise ProviderError('MODEL_TLS: trusted CA bundle unavailable') from exc
        self.opener=build_opener(_NoRedirect(),HTTPSHandler(context=context))
    def complete(self,messages,timeout=15):
        payload={'model':self.model,'messages':messages,'max_tokens':256,'stream':False,
                 'thinking':{'type':'disabled'},'response_format':{'type':'json_object'}}
        body=json.dumps(payload,ensure_ascii=False).encode('utf-8')
        if len(body)>24000: raise ProviderError('MODEL_INPUT_LIMIT: request too large')
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
            code='MODEL_TLS' if isinstance(exc.reason,ssl.SSLError) else 'MODEL_NETWORK'
            raise ProviderError(code+': provider connection failed') from None
        except (UnicodeError,KeyError,IndexError,TypeError,ValueError,RecursionError) as exc:
            if isinstance(exc,ProviderError): raise
            raise ProviderError('MODEL_RESPONSE: invalid provider response') from None
