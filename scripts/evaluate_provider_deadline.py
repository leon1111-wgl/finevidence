"""Six fixed offline TLS development faults; never contacts a real provider.

Slow cases intentionally take about 78 seconds on the updated implementation.
Use --implementation-root for the unchanged Git checkout comparison. This plan
uses one fixed judge for both versions and retains every first result.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
PLAN = [
    {'id': 'fast', 'timeout': .2, 'duration': 0, 'mode': 'fast', 'expected': 'RETURNED_RESPONSE', 'limit': .2},
    {'id': 'silent', 'timeout': .2, 'duration': .6, 'mode': 'silent', 'expected': 'MODEL_TIMEOUT', 'limit': .2},
    {'id': 'body-trickle-scaled', 'timeout': .2, 'duration': .9, 'mode': 'body-trickle', 'expected': 'MODEL_TIMEOUT', 'limit': .2},
    {'id': 'body-trickle-default15', 'timeout': 15, 'duration': 18, 'mode': 'body-trickle', 'expected': 'MODEL_TIMEOUT', 'limit': 15},
    {'id': 'agent-first-call', 'timeout': 45, 'duration': 50, 'mode': 'body-trickle', 'expected': 'MODEL_TIMEOUT', 'limit': 15},
    {'id': 'agent-remaining-budget', 'timeout': 45, 'duration': [14, 14, 14, 10], 'mode': 'body-trickle', 'expected': 'MODEL_TIMEOUT', 'limit': 45},
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--implementation-root', type=Path, default=ROOT)
    args = parser.parse_args()
    implementation = args.implementation_root.resolve()
    sys.path.insert(0, str(ROOT/'tests'))
    sys.path.insert(0, str(implementation))
    from tls_provider_fixture import TLSPeer
    from finevidence.provider import ModelProvider, ProviderError
    from finevidence.agent import MeteredProvider, run_agent
    from finevidence.service import Workspace
    result = {'classification': 'OFFLINE_SYNTHETIC_TLS_DEVELOPMENT', 'judge_version': 1,
              'sha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=implementation, text=True).strip(),
              'dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=implementation)),
              'plan_sha256': hashlib.sha256(json.dumps(PLAN, sort_keys=True).encode()).hexdigest(),
              'planned': len(PLAN), 'completed': 0, 'passed': 0, 'external_requests': 0,
              'real_model_calls': 0, 'hidden_cases': 0, 'real_financial_labels': 0, 'rows': []}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for case in PLAN:
        peer = TLSPeer(); peer.mode = case['mode']; peer.duration = case['duration']
        if case['id'] == 'agent-remaining-budget':
            decisions = [('get_financial_facts', {}), ('search_documents', {'query': 'revenue'}),
                         ('search_documents', {'query': 'cost'}), ('finish', {})]
            peer.plan = [('body-trickle', duration, json.dumps({'model': 'SYNTHETIC_TLS_FIXTURE',
                'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({'tool': tool, 'arguments': arguments})}}],
                'usage': {'total_tokens': 0}}).encode()) for duration, (tool, arguments) in zip(case['duration'], decisions)]
        row = dict(case); row['tolerance_seconds'] = .15 if case['limit'] < 1 else .75
        started = time.monotonic(); workspace = None; metered = None
        try:
            with peer.environment():
                provider = ModelProvider()
                if case['id'].startswith('agent-'):
                    workspace = Workspace()
                    run_agent(workspace, 'synthetic transport budget', 'Aurora Orchard', 2024, provider=provider)
                else:
                    metered = MeteredProvider(provider)
                    metered.complete([{'role': 'user', 'content': 'synthetic transport test'}], timeout=case['timeout'])
                row['outcome'] = 'RETURNED_RESPONSE'
        except ProviderError as error:
            row['outcome'] = str(error).split(':', 1)[0]
            if hasattr(error, 'model_audit'): row['model_audit'] = error.model_audit
        except Exception as error:
            row['outcome'] = 'HARNESS_' + type(error).__name__
        finally:
            row['elapsed_seconds'] = round(time.monotonic()-started, 6)
            row['tls_requests'] = len(peer.requests)
            if metered: row['model_audit'] = metered.audit()
            if workspace: workspace.close()
            peer.close()
        row['passed'] = (row['outcome'] == case['expected'] and
                         row['elapsed_seconds'] <= case['limit']+row['tolerance_seconds'])
        result['rows'].append(row); result['completed'] += 1; result['passed'] += int(row['passed'])
        args.output.write_text(json.dumps(result, indent=2)+'\n')
        print(json.dumps(row), flush=True)
    return 0 if result['passed'] == result['planned'] else 1

if __name__ == '__main__': raise SystemExit(main())
