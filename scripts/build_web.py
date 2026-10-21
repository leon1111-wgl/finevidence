"""Validate sources through Python, then build a public-only browser bundle."""
import hashlib,json,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from finevidence.service import Workspace, ROOT
from finevidence.documents import make_chunks

def build(root=ROOT,output=None):
    root=Path(root);output=Path(output or root/'web');output.mkdir(exist_ok=True)
    with Workspace(root) as w:
        sources=[{'filename':d.filename,'sha256':d.sha256,'raw':(w.sources/d.filename).read_text()} for d in w.documents]
        # Every source and fact is checked by actual workflows before public export.
        expected=[]
        for company in sorted({d.company for d in w.documents}):
            for year in [2023,2024]:
                for operation in ['gross-margin']+(['revenue-growth','gross-margin-change'] if year==2024 else []):
                    r=w.run(operation,company,year)
                    expected.append({'operation':operation,'company':company,'year':year,'display':r['calculations'][0]['display']})
                for query in ['revenue','water','safety','zzzzmissing']:
                    r=w.run('search',company,year,query)
                    expected.append({'operation':'search','company':company,'year':year,'query':query,'ids':[c['citation_id'] for c in r['citations']]})
        bundle={'schema_version':1,'classification':'SYNTHETIC','sources':sources,'facts':json.loads(w.manifest.read_text())['facts']}
        raw=(json.dumps(bundle,ensure_ascii=False,separators=(',',':'))+'\n').encode()
        (output/'bundle.json').write_bytes(raw)
        (output/'runtime.json').write_text(json.dumps({'runtime':'browser','model_configured':False})+'\n')
        sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
        (output/'manifest.json').write_text(json.dumps({'schema_version':1,'bundle_sha256':hashlib.sha256(raw).hexdigest(),'commit':sha})+'\n')
        (root/'tests/web-oracles.json').write_text(json.dumps(expected,indent=2)+'\n')
        return {'sources':len(sources),'facts':len(bundle['facts']),'oracle_cases':len(expected),'bundle_bytes':len(raw)}
if __name__=='__main__': print(json.dumps(build()))
