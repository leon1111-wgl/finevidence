"""Offline comparison against the pinned, trusted pre-diagnostic repository function.

This is a development check, never a runtime/model tool. It executes only the
_decision function extracted from the fixed repository commit below.
"""
import ast
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from finevidence.agent import _decision
from finevidence.provider import ProviderError

BASE='c7189477a2cbff36c6d43c5691f740ca2487a24b'

def main():
    source=subprocess.check_output(['git','show',BASE+':finevidence/agent.py'],cwd=ROOT,text=True)
    node=next(x for x in ast.parse(source).body if isinstance(x,ast.FunctionDef) and x.name=='_decision')
    namespace={'json':json,'ProviderError':ProviderError}
    exec(compile(ast.Module(body=[node],type_ignores=[]),'<trusted-pinned-baseline>','exec'),namespace)
    baseline=namespace['_decision']
    values=[None,True,0,[],{},'', 'revenue','x'*500,'x'*501,'gross-margin','revenue-growth','gross-margin-change','not_supported']
    args=[{},[],None,{'company':'Aurora Orchard'},*({'query':v} for v in values),*({'metric':v} for v in values),*({'query':v,'year':2024} for v in values)]
    inputs=[json.dumps({'tool':tool,'arguments':arg}) for tool in ['finish','get_financial_facts','search_documents','calculate_metric','not_allowed',None,7,{}] for arg in args]
    inputs+=['{','[]','null','{}',json.dumps({'tool':'finish'})]
    def outcome(fn,raw):
        try:return ('accepted',fn(raw))
        except ProviderError as exc:return ('rejected',str(exc).split(':',1)[0])
    matched=0;accepted=0
    for raw in inputs:
        old=outcome(baseline,raw);new=outcome(_decision,raw)
        matched+=old==new;accepted+=new[0]=='accepted'
    print(json.dumps({'dataset':'OFFLINE_PROTOCOL_COMPATIBILITY','base_sha':BASE,'cases':len(inputs),
                      'matching_acceptance_and_status':matched,'accepted':accepted,'paid_calls':0},indent=2))
    return 0 if matched==len(inputs) else 1

if __name__=='__main__':sys.exit(main())
