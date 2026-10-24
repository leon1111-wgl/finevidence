"""Validate sources through Python, then build a public-only browser bundle."""
import hashlib,json,subprocess,sys,shutil
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
        # All module-relative imports, Workers, CSS and public data live under
        # one immutable directory. Querying only the entry would leave children
        # vulnerable to cached previous releases. Include dirty source bytes too.
        source = root/'web'
        files = {f.name: f.read_bytes() for f in source.iterdir()
                 if f.is_file() and f.suffix in {'.mjs', '.css', '.pdf'}}
        files.update({'vendor/'+f.name: f.read_bytes() for f in (source/'vendor').iterdir() if f.is_file()})
        files['bundle.json'] = raw
        template = (source/'index.template.html').read_text()
        digest = hashlib.sha256(sha.encode()+template.encode())
        for name, content in sorted(files.items()):
            digest.update(name.encode()+b'\0'+hashlib.sha256(content).digest())
        version = digest.hexdigest()
        manifest = {'schema_version':1,'bundle_sha256':hashlib.sha256(raw).hexdigest(),
                    'commit':sha,'asset_version':version}
        files['manifest.json'] = (json.dumps(manifest)+'\n').encode()
        assets = output/'assets'
        # The output directory belongs to this builder; no old deployment graph
        # is silently served as the current release. Old HTML can explicitly reload.
        if assets.exists(): shutil.rmtree(assets)
        graph = assets/version
        for name, content in files.items():
            target = graph/name; target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
            target = output/name; target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
        html = template.replace('./bootstrap.mjs', f'./assets/{version}/bootstrap.mjs')
        html = html.replace('./styles.css', f'./assets/{version}/styles.css')
        html = html.replace('id="startup-reload" href="./"', f'id="startup-reload" href="./?_fe_reload={version}"')
        (output/'index.html').write_text(html)
        (root/'tests/web-oracles.json').write_text(json.dumps(expected,indent=2)+'\n')
        return {'sources':len(sources),'facts':len(bundle['facts']),'oracle_cases':len(expected),'bundle_bytes':len(raw)}
if __name__=='__main__': print(json.dumps(build()))
