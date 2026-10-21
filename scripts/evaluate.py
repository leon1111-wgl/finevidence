"""Versioned synthetic development evaluation. Live calls require explicit --live."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from finevidence.service import Workspace

CASES=ROOT/'evaluation/development_cases.json'

def load_cases():
    return json.loads(CASES.read_text())

def judge(case,result):
    if case['kind']=='refusal':
        safe=(result.get('status') in case['expected_statuses'] and not result.get('answer')
              and not result.get('calculations') and not result.get('facts') and not result.get('citations'))
        return {'passed':safe,'refused_safely':safe}
    calculations=result.get('calculations',[])
    numeric=(result.get('status')=='CALCULATED' and result.get('resolved_operation')==case['operation']
             and len(calculations)==1 and calculations[0].get('display')==case['expected_display'])
    citations=result.get('citations',[])
    ids=[c.get('citation_id') for c in citations]
    sources=(set(ids)==set(case['expected_citation_ids']) and len(ids)==len(set(ids)))
    # Independently inspect source bytes/first paragraph, not a model's self-rating.
    originals={p.name:(json.loads(p.read_text()),hashlib.sha256(p.read_bytes()).hexdigest())
               for p in (ROOT/'data/synthetic').glob('*.json')}
    for c in citations:
        source=originals.get(c.get('source_file'))
        if not source:sources=False;continue
        doc,digest=source
        sources = sources and all([c.get('company')==case['company'],c.get('year')==doc['year'],
            c.get('doc_id')==doc['doc_id'],c.get('page')==1,c.get('source_sha256')==digest,
            c.get('excerpt')==doc['pages'][0].split('\n\n')[0],
            c.get('citation_id')==doc['doc_id']+':p1:c1',c.get('classification')=='SYNTHETIC'])
    sources = bool(sources and len(calculations)==1 and set(calculations[0].get('citation_ids',[]))==set(ids))
    return {'passed':bool(numeric and sources),'numeric_correct':bool(numeric),'sources_complete':sources}

def summarize(rows):
    def rate(key,selected):
        return {'passed':sum(bool(r['judgment'].get(key)) for r in selected),'total':len(selected)}
    positive=[r for r in rows if r['kind']=='calculation'];negative=[r for r in rows if r['kind']=='refusal']
    latencies=sorted(r['seconds'] for r in rows)
    models=[r['result']['model'] for r in rows if 'model' in r['result']]
    return {'completion':rate('passed',rows),'numeric_correct':rate('numeric_correct',positive),
            'sources_complete':rate('sources_complete',positive),'safe_refusal':rate('refused_safely',negative),
            'latency_n':len(latencies),'p50_seconds':statistics.median(latencies),
            'p95_seconds':latencies[math.ceil(.95*len(latencies))-1],
            'model_calls':sum(m.get('calls',0) for m in models),
            'reported_tokens':sum(m.get('usage',{}).get('total_tokens',0) for m in models),
            'usage_complete':all(m.get('usage_complete',False) for m in models),
            'calls_with_unknown_usage':sum(m.get('calls_with_unknown_usage',0) for m in models)}

class LocalHTTP:
    def __init__(self,url):
        parsed=urlsplit(url)
        if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost') or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
            raise ValueError('Evaluation server must be a loopback HTTP origin')
        self.url=url.rstrip('/')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs):return None
        self.opener=urllib.request.build_opener(NoRedirect())
        with self.opener.open(self.url+'/api/session',timeout=5) as r:self.csrf=json.load(r)['csrf']
    def run(self,operation,company,year,query):
        request=urllib.request.Request(self.url+'/api/run',data=json.dumps(dict(operation=operation,company=company,year=year,query=query)).encode(),headers={'Content-Type':'application/json','X-FinEvidence-CSRF':self.csrf})
        try:
            with self.opener.open(request,timeout=55) as r:return json.load(r)
        except urllib.error.HTTPError as e:
            return json.loads(e.read(262144))
        except (OSError,ValueError):
            return {'status':'EVALUATOR_TRANSPORT_ERROR','model':{'calls':0,'usage':{},'usage_complete':False,'calls_with_unknown_usage':0}}

def evaluate(live=False,base_url='http://127.0.0.1:8765',output=None):
    cases=load_cases()
    if len(cases)!=8:raise ValueError('This protocol requires exactly eight tasks')
    report={'schema_version':1,'dataset':'SYNTHETIC_DEVELOPMENT_V1','not_holdout':True,
            'timestamp_utc':datetime.now(timezone.utc).isoformat(),
            'cases_sha256':hashlib.sha256(CASES.read_bytes()).hexdigest(),
            'code_sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
            'tracked_diff_sha256':hashlib.sha256(subprocess.check_output(['git','diff','HEAD'],cwd=ROOT)).hexdigest(),
            'protocol':'One pass in listed order; no best-of-N; median p50; nearest-rank p95; no monetary price inferred.',
            'transport':'loopback HTTP for both arms' if live else 'in-process deterministic baseline only',
            'budgets':{'tasks':8,'max_model_calls_per_task':4,'max_output_tokens_per_call':256,'max_model_calls_total':32},'arms':{}}
    client=LocalHTTP(base_url) if live else None
    with Workspace() as workspace:
        for arm in (['deterministic','live_model'] if live else ['deterministic']):
            rows=[]
            for case in cases:
                start=time.perf_counter()
                operation='agent' if arm=='live_model' else case['operation']
                # Expected labels and operation names are NOT included in model questions.
                query=case['question'] if arm=='live_model' else ''
                if client:result=client.run(operation,case['company'],case['year'],query)
                else:
                    try:result=workspace.run(operation,case['company'],case['year'],query)
                    except ValueError as exc:result={'status':str(exc).split(':',1)[0],'answer':None}
                row={'case_id':case['id'],'kind':case['kind'],'seconds':round(time.perf_counter()-start,6),'result':result,'judgment':judge(case,result)}
                rows.append(row)
                print(json.dumps({'arm':arm,'case':case['id'],'status':result['status'],'passed':row['judgment']['passed'],'seconds':row['seconds']},ensure_ascii=False),flush=True)
                report['arms'][arm]={'rows':rows,'summary':summarize(rows)}
                if output:Path(output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',action='store_true',help='Explicitly invoke configured local model service; may incur charges')
    parser.add_argument('--base-url',default='http://127.0.0.1:8765')
    parser.add_argument('--output',default='evaluation-result.json')
    args=parser.parse_args()
    report=evaluate(args.live,args.base_url,args.output)
    print(json.dumps({k:v['summary'] for k,v in report['arms'].items()},ensure_ascii=False,indent=2))
    sys.exit(0 if all(r['judgment']['passed'] for a in report['arms'].values() for r in a['rows']) else 1)
