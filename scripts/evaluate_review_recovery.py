"""Two known synthetic crash/recovery tasks, once each; no models or real labels."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT/'tests')]
from review_crash_fixture import OPERATOR, interrupted_store
from finevidence.review_ledger import ReviewLedger
from finevidence.review_recovery import recover_review_store
from finevidence.server import make_server


def run():
    report={'classification':'SYNTHETIC_KNOWN_DEFECT_RECOVERY', 'started_utc':datetime.now(timezone.utc).isoformat(),
            'total':2, 'rows':[], 'model_calls':0, 'tokens':0, 'unknown_usage_calls':0,
            'hidden_cases':0, 'real_semantic_labels':0}
    report['source_commit']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    report['working_tree_dirty']=bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True))
    report['scenario_version']=1
    for action in ('record','revoke'):
        row={'action':action,'passed':False}
        start=time.perf_counter()
        try:
            with tempfile.TemporaryDirectory(prefix='finevidence-crash-eval-') as folder:
                root=Path(folder); source=root/'source'; output=root/'output';output.mkdir(mode=0o700)
                expected, original, revoke, pending=interrupted_store(source,action)
                before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in source.iterdir()}
                began=time.perf_counter(); result=recover_review_store(source,OPERATOR,output,stopped=True)
                row['recovery_seconds']=time.perf_counter()-began
                restored=ReviewLedger(result['directory'],OPERATOR)
                row['committed_history_equal']=restored.list()==expected
                row['prior_request_replays_preserved']=(restored.mutate('record',original)['state']=='recorded'
                                                       and restored.mutate('revoke',revoke)['state']=='revoked')
                first=restored.mutate(action,pending)
                row['interrupted_request_can_retry_once']=restored.mutate(action,pending)==first
                row['source_pair_unchanged']=before=={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in source.iterdir()}
                server=make_server(port=0,review_directory=result['directory'],reviewer=OPERATOR,
                                   review_token='synthetic-evaluation-token-123456789')
                try: row['server_started']=server.server_address[1]>0
                finally: server.server_close();server.workspace.close()
                row['passed']=all(row[k] for k in ('committed_history_equal','prior_request_replays_preserved',
                                 'interrupted_request_can_retry_once','source_pair_unchanged','server_started'))
        except Exception as error:
            row['error_type']=type(error).__name__
            row['error_code']=str(error) if str(error).startswith('REVIEW_') else 'EVALUATION_FAILED'
        row['total_seconds']=time.perf_counter()-start;report['rows'].append(row)
    report['passed']=sum(row['passed'] for row in report['rows'])
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    report=run();args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
    raise SystemExit(0 if report['passed']==report['total'] else 1)
