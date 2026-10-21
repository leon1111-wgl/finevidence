"""One local workspace consumed by HTTP, model tools and static-build checks."""
from dataclasses import asdict
from pathlib import Path
import tempfile
from .documents import import_documents, load_verified_documents, make_chunks
from .facts import load_fixture_facts
from .workflow import retrieve, calculate_margin, calculate_revenue_growth, calculate_margin_change

ROOT = Path(__file__).resolve().parents[1]
OPERATIONS = {'gross-margin': calculate_margin, 'revenue-growth': calculate_revenue_growth,
              'gross-margin-change': calculate_margin_change}

class RequestError(ValueError): pass

class Workspace:
    def __init__(self, root=ROOT):
        self.root=Path(root)
        self.sources=self.root/'data/synthetic'
        self.manifest=self.root/'data/facts/synthetic.json'
        self._temp=tempfile.TemporaryDirectory(prefix='finevidence-session-')
        self.index=Path(self._temp.name)/'index.json'
        try:
            import_documents(self.sources,self.index,sorted(p.name for p in self.sources.glob('*.json')))
            self.documents=load_verified_documents(self.index,self.sources)
        except Exception:
            self.close(); raise
    def close(self): self._temp.cleanup()
    def __enter__(self): return self
    def __exit__(self,*args): self.close()
    def validate_scope(self,company,year):
        if not isinstance(company,str) or company not in {d.company for d in self.documents}:
            raise RequestError('INVALID_COMPANY: select a published company')
        if type(year) is not int or year not in {d.year for d in self.documents if d.company==company}:
            raise RequestError('INVALID_YEAR: select an available reporting year')
    def run(self,operation,company,year,query=''):
        self.validate_scope(company,year)
        if operation=='search':
            if not isinstance(query,str) or len(query)>500:
                raise RequestError('INVALID_QUERY: query limit is 500 characters')
            result=retrieve(self.index,query,5,data_dir=self.sources,company=company,year=year).as_dict()
        elif operation in OPERATIONS:
            result=OPERATIONS[operation](self.index,self.manifest,self.sources,company,year)
        elif operation=='facts':
            facts,citations=load_fixture_facts(self.manifest,self.sources,self.index,company,year)
            result={'schema_version':'1.0','mode':'synthetic_facts','status':'FACTS_FOUND','answer':None,
                    'facts':[dict(asdict(f),normalized_value=format(f.normalized_value,'f')) for f in facts],
                    'citations':citations,'calculations':[],'claims':[],
                    'filters':{'company':company,'year':year}}
        else: raise RequestError('INVALID_OPERATION: operation is not allowed')
        result['resolved_operation']=operation
        return result
