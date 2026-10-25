"""Opt-in single-operator local observations. Never an approved financial fact store."""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from urllib.parse import urlsplit
from uuid import UUID, uuid4
from .service import ROOT

MAX_RECORDS = 100

# Closed on-disk v1 format, including constraints and implicit indexes. Preserve
# the shipped SQL so existing v1 stores need no migration or write on reopening.
STORE_DDL = (
    'CREATE TABLE owner (singleton INTEGER PRIMARY KEY CHECK(singleton=1), label TEXT NOT NULL)',
    'CREATE TABLE records (id TEXT PRIMARY KEY, receipt TEXT NOT NULL)',
    'CREATE TABLE revocations (id TEXT PRIMARY KEY REFERENCES records(id), event TEXT NOT NULL)',
    'CREATE TABLE requests (id TEXT PRIMARY KEY, digest TEXT NOT NULL, response TEXT NOT NULL)',
)
SCHEMA_QUERY = 'SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name'

class ReviewError(ValueError):
    def __init__(self, code, status=422):
        super().__init__(code)
        self.status = status

def fail(code='REVIEW_INVALID', status=422):
    raise ReviewError(code, status)

def text(value, maximum, multiline=False):
    if (not isinstance(value, str) or not value.strip() or len(value.encode('utf-16-le', 'surrogatepass'))//2 > maximum
        or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ud800-\udfff]', value)
        or (not multiline and re.search(r'[\r\n\t]', value))):
        fail()
    return value

def keys(value, expected):
    if not isinstance(value, dict) or set(value) != set(expected.split()): fail()

def identifier(value):
    try:
        if not isinstance(value, str) or str(UUID(value)) != value: fail()
    except (ValueError, AttributeError): fail()
    return value

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)

def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def validate_draft(d):
    keys(d, 'classification review_status verified_by financial_calculation_eligible company title source_url metric raw_value normalized_value unit_scale currency period basis scope provenance')
    if (d['classification'] not in ('USER_SUPPLIED_UNVERIFIED', 'SYNTHETIC_DEMO_UNVERIFIED')
        or d['review_status'] != 'pending_human_review' or d['verified_by'] is not None
        or d['financial_calculation_eligible'] is not False): fail()
    for k in ('company', 'title', 'period', 'basis', 'scope'): text(d[k], 200 if k in ('company','title') else 120)
    if d['metric'] not in ('revenue','gross_profit') or d['currency'] not in (None,'CNY','HKD','USD','EUR','JPY'): fail()
    if d['unit_scale'] not in (None,'1','1000','10000','1000000','100000000'): fail()
    raw=text(d['raw_value'],64)
    if not re.fullmatch(r'(?:-?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?|\((?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?\))',raw): fail()
    number=raw.replace(',','').replace('(','-').replace(')','')
    whole,_,fraction=number.lstrip('-').partition('.')
    if len(whole)>40 or len(fraction)>18: fail()
    normalized=None
    if d['unit_scale']:
        with localcontext() as ctx:
            ctx.prec=80
            value=Decimal(number)*Decimal(d['unit_scale'])
            normalized=format(value,'f')
            if '.' in normalized: normalized=normalized.rstrip('0').rstrip('.')
            if value == 0: normalized='0'
    if d['normalized_value'] != normalized: fail()
    if d['source_url'] is not None:
        text(d['source_url'],1000)
        try:
            url=urlsplit(d['source_url'])
            if url.scheme != 'https' or not url.hostname or url.username is not None or url.password is not None: fail()
        except ValueError: fail()
    p=d['provenance']
    keys(p,'file_name file_sha256 page page_kind excerpt excerpt_start excerpt_end offset_unit parser')
    text(p['file_name'],512)
    if '/' in p['file_name'] or '\\' in p['file_name'] or p['file_name'] in ('.','..'): fail()
    if not isinstance(p['file_sha256'],str) or not re.fullmatch('[a-f0-9]{64}',p['file_sha256']): fail()
    if type(p['page']) is not int or not 1<=p['page']<=120 or p['page_kind']!='pdf_physical': fail()
    quote=text(p['excerpt'],4000,True)
    if raw not in quote: fail()
    if (type(p['excerpt_start']) is not int or type(p['excerpt_end']) is not int
        or not 0<=p['excerpt_start']<p['excerpt_end']<=100000
        or p['excerpt_end']-p['excerpt_start'] != len(quote.encode('utf-16-le'))//2
        or p['offset_unit']!='utf16_code_unit'): fail()
    keys(p['parser'],'name version')
    if p['parser']['name'] != 'PDF.js': fail()
    text(p['parser']['version'],40)
    return d

def validate_store(db, reviewer):
    try:
        version = db.execute('PRAGMA user_version').fetchone()[0]
        application = db.execute('PRAGMA application_id').fetchone()[0]
        schema = db.execute(SCHEMA_QUERY).fetchall()
        if application != 0:
            fail('REVIEW_STORE_SCHEMA')
        if version == 0 and not schema:
            return False
        if version != 1:
            fail('REVIEW_STORE_SCHEMA')
        reference = sqlite3.connect(':memory:')
        try:
            for statement in STORE_DDL:
                reference.execute(statement)
            expected = reference.execute(SCHEMA_QUERY).fetchall()
        finally:
            reference.close()
        if schema != expected:
            fail('REVIEW_STORE_SCHEMA')
        owners = db.execute('SELECT singleton, label FROM owner').fetchall()
        if len(owners) != 1 or owners[0][0] != 1:
            fail('REVIEW_STORE_SCHEMA')
        if owners[0][1] != reviewer:
            fail('REVIEW_OWNER_MISMATCH')
        return True
    except sqlite3.DatabaseError as error:
        if getattr(error, 'sqlite_errorcode', None) == sqlite3.SQLITE_READONLY_ROLLBACK:
            fail('REVIEW_RECOVERY_REQUIRED')
        # Malformed files have a stable refusal; busy/I/O errors retain
        # their separate storage-failure meaning, rather than being adopted.
        if getattr(error, 'sqlite_errorcode', 0) & 0xff in (sqlite3.SQLITE_CORRUPT, sqlite3.SQLITE_NOTADB):
            fail('REVIEW_STORE_SCHEMA')
        raise


class ReviewLedger:
    def __init__(self, directory, reviewer):
        self.reviewer=text(reviewer,120)
        directory=Path(directory).expanduser()
        if directory.is_symlink() or directory.resolve().is_relative_to(ROOT.resolve()):
            fail('REVIEW_PRIVATE_DIRECTORY')
        directory.mkdir(mode=0o700, parents=False, exist_ok=True)
        stat=directory.stat()
        if not directory.is_dir() or stat.st_uid != os.getuid() or stat.st_mode & 0o077:
            fail('REVIEW_PRIVATE_DIRECTORY')
        if (directory/'RECOVERY_INCOMPLETE').exists():
            fail('REVIEW_RECOVERY_INCOMPLETE')
        self.path=directory/'reviews.sqlite'
        if self.path.is_symlink(): fail('REVIEW_PRIVATE_DIRECTORY')
        fd=os.open(self.path,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        try:
            stat=os.fstat(fd)
            if stat.st_uid != os.getuid() or stat.st_mode & 0o077: fail('REVIEW_PRIVATE_DIRECTORY')
        finally: os.close(fd)
        # Inspect existing bytes in a read transaction. Never repair, claim or
        # migrate a store merely because another application also uses version 1.
        with self.connection(readonly=True) as db:
            db.execute('BEGIN')
            if validate_store(db, self.reviewer):
                return
        # Only an empty, unclaimed v0 database can be initialized. Recheck under
        # the write lock: a competing initializer may have completed meanwhile.
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            if not validate_store(db, self.reviewer):
                for statement in STORE_DDL:
                    db.execute(statement)
                db.execute('INSERT INTO owner VALUES (1,?)', (self.reviewer,))
                db.execute('PRAGMA user_version=1')
                # No executescript: it commits an existing transaction before
                # running statements. DDL, owner and version must commit together.

    def connection(self, readonly=False):
        # One connection per request; context below closes it, not just commits.
        from contextlib import contextmanager
        @contextmanager
        def connect():
            target = self.path.absolute().as_uri() + '?mode=ro' if readonly else self.path
            db = sqlite3.connect(target, timeout=1, uri=readonly)
            try:
                db.execute('PRAGMA foreign_keys=ON')
                with db: yield db
            finally: db.close()
        return connect()
    @staticmethod
    def current(db, record_id):
        row=db.execute('SELECT receipt FROM records WHERE id=?',(record_id,)).fetchone()
        if row is None: fail('REVIEW_NOT_FOUND',404)
        receipt=json.loads(row[0])
        rev=db.execute('SELECT event FROM revocations WHERE id=?',(record_id,)).fetchone()
        if rev:
            receipt['state']='revoked';receipt['revocation']=json.loads(rev[0])
        return receipt
    def list(self):
        with self.connection() as db:
            db.execute('BEGIN')
            ids=[r[0] for r in db.execute('SELECT id FROM records ORDER BY rowid DESC')]
            return {'reviewer':self.reviewer,'limit':MAX_RECORDS,'records':[self.current(db,i) for i in ids]}
    def mutate(self, action, body):
        if action=='record':
            keys(body,'request_id draft observation note')
            validate_draft(body['draft']);text(body['note'],2000,True)
            if body['observation'] not in ('needs_changes','reviewed_with_limits'): fail()
        else:
            keys(body,'request_id record_id reason')
            identifier(body['record_id']);text(body['reason'],2000,True)
        request_id=identifier(body['request_id'])
        request_hash=digest({'action':action,'body':body})
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            prior=db.execute('SELECT digest,response FROM requests WHERE id=?',(request_id,)).fetchone()
            if prior:
                if prior[0]!=request_hash: fail('REVIEW_REQUEST_CONFLICT',409)
                return self.current(db, json.loads(prior[1])['record_id'])
            now=datetime.now(timezone.utc).isoformat()
            if action=='record':
                if db.execute('SELECT count(*) FROM records').fetchone()[0]>=MAX_RECORDS: fail('REVIEW_LIMIT',409)
                record_id=str(uuid4())
                receipt={'schema_version':1,'kind':'local_review_observation','record_id':record_id,
                         'reviewer':self.reviewer,'identity_scope':'locally_configured_operator',
                         'recorded_at':now,'draft':body['draft'],'snapshot_sha256':digest(body['draft']),
                         'observation':body['observation'],'note':body['note'],'state':'recorded',
                         'revocation':None,'financial_calculation_eligible':False,
                         'licensing_status':'not_verified','source_verification':'not_performed_by_server'}
                db.execute('INSERT INTO records VALUES (?,?)',(record_id,canonical(receipt)))
            else:
                record_id=body['record_id'];receipt=self.current(db,record_id)
                if receipt['revocation'] is not None: fail('REVIEW_ALREADY_REVOKED',409)
                event={'reviewer':self.reviewer,'at':now,'reason':body['reason']}
                db.execute('INSERT INTO revocations VALUES (?,?)',(record_id,canonical(event)))
                receipt['state']='revoked';receipt['revocation']=event
            db.execute('INSERT INTO requests VALUES (?,?,?)',(request_id,request_hash,canonical(receipt)))
            return receipt
