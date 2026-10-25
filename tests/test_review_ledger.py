"""Synthetic operators and declarations; never a human financial review score."""
import copy
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from finevidence.server import make_server

TOKEN = 'synthetic-test-credential-' + 'x' * 40

def draft():
    return dict(classification='SYNTHETIC_DEMO_UNVERIFIED', review_status='pending_human_review',
                verified_by=None, financial_calculation_eligible=False, company='SYNTHETIC Example',
                title='Synthetic report', source_url=None, metric='revenue', raw_value='120',
                normalized_value='120000000', unit_scale='1000000', currency='USD', period='2024',
                basis='IFRS', scope='consolidated', provenance=dict(file_name='text.pdf',
                file_sha256='a'*64, page=1, page_kind='pdf_physical', excerpt='Revenue 120',
                excerpt_start=0, excerpt_end=11, offset_unit='utf16_code_unit',
                parser=dict(name='PDF.js',version='5.4.624')))

class ReviewLedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.directory=Path(self.tmp.name)/'private'
        self.start()
    def start(self,token=TOKEN):
        self.server=make_server(port=0,review_directory=self.directory,
                                reviewer='Synthetic reviewer',review_token=token)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.port=self.server.server_address[1]
    def stop(self):
        self.server.shutdown();self.server.server_close();self.server.workspace.close();self.thread.join()
    def tearDown(self): self.stop();self.tmp.cleanup()
    def req(self,body=None,token=TOKEN,path='/api/reviews',headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
        h={'Authorization':'Bearer '+token,'X-FinEvidence-CSRF':self.server.csrf,'Content-Type':'application/json'}
        h.update(headers or {})
        c.request('POST' if body is not None else 'GET',path,
                  None if body is None else json.dumps(body),h)
        r=c.getresponse();raw=r.read();c.close()
        return r.status,json.loads(raw)
    def create(self,**kw):
        return dict(request_id=str(uuid4()),draft=draft(),observation='needs_changes',note='Check the period',**kw)
    def test_disabled_default_and_no_secret_in_runtime(self):
        status,body=self.req(path='/runtime.json')
        self.assertTrue(body['review_enabled']);self.assertNotIn(TOKEN,json.dumps(body))
        s=make_server(port=0)
        try: self.assertIsNone(s.review_ledger)
        finally: s.server_close();s.workspace.close()
    def test_auth_origin_csrf_all_enforced_without_side_effect(self):
        for token in ['', 'wrong', 'é']:
            for body in [None,self.create()]:
                self.assertEqual(self.req(body,token=token)[0],401)
        for h in [{'Origin':'https://evil.invalid'},{'Host':'evil.invalid'},{'Sec-Fetch-Site':'cross-site'},{'X-FinEvidence-CSRF':'bad'}]:
            self.assertEqual(self.req(self.create(),headers=h)[0],403)
        self.assertEqual(self.req()[1]['records'],[])
    def test_receipt_is_bound_to_server_identity_and_exact_snapshot(self):
        body=self.create();code,r=self.req(body)
        self.assertEqual(code,200);self.assertEqual(r['reviewer'],'Synthetic reviewer')
        self.assertEqual(r['draft'],body['draft']);self.assertEqual(r['state'],'recorded')
        self.assertFalse(r['financial_calculation_eligible']);self.assertEqual(r['licensing_status'],'not_verified')
        self.assertEqual(len(r['snapshot_sha256']),64);self.assertIsNone(r['revocation'])
        for field,value in [('reviewer','Administrator'),('approved',True),('source_url','file:///private')]:
            forged=self.create();forged[field]=value
            self.assertEqual(self.req(forged)[0],422)
        self.assertEqual(len(self.req()[1]['records']),1)
    def test_retry_is_idempotent_and_conflicting_id_rejected(self):
        body=self.create();first=self.req(body)
        self.assertEqual(self.req(body),first)
        conflict=copy.deepcopy(body);conflict['note']='Different opinion'
        self.assertEqual(self.req(conflict)[0],409)
        self.assertEqual(len(self.req()[1]['records']),1)
    def test_restart_keeps_snapshot_and_revocation_with_secret_rotation(self):
        _,r=self.req(self.create());self.stop();self.start(TOKEN+'rotated')
        self.assertEqual(self.req(token=TOKEN)[0],401)
        self.assertEqual(self.req(token=TOKEN+'rotated')[1]['records'],[r])
        body=dict(request_id=str(uuid4()),record_id=r['record_id'],reason='Wrong period')
        code,rev=self.req(body,token=TOKEN+'rotated',path='/api/reviews/revoke')
        self.assertEqual(code,200);self.assertEqual(rev['state'],'revoked')
        self.assertEqual(rev['draft'],r['draft']);self.assertEqual(rev['note'],r['note'])
        self.assertEqual(rev['revocation']['reason'],'Wrong period')
        self.assertEqual(self.req(body,token=TOKEN+'rotated',path='/api/reviews/revoke'),(code,rev))
        self.stop();self.start();self.assertEqual(self.req()[1]['records'],[rev])
    def test_concurrent_duplicate_is_one_record_and_revoke_only_once(self):
        body=self.create()
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(lambda _:self.req(body),range(2)))
        self.assertEqual(results[0],results[1]);self.assertEqual(results[0][0],200)
        record=results[0][1]
        def revoke(_):
            return self.req(dict(request_id=str(uuid4()),record_id=record['record_id'],reason='Retracted'),path='/api/reviews/revoke')[0]
        with ThreadPoolExecutor(max_workers=2) as pool: statuses=list(pool.map(revoke,range(2)))
        self.assertEqual(sorted(statuses),[200,409])
        self.assertEqual(len(self.req()[1]['records']),1)
    def test_unknown_record_and_failed_requests_do_not_poison_request_id(self):
        body=dict(request_id=str(uuid4()),record_id=str(uuid4()),reason='No such record')
        self.assertEqual(self.req(body,path='/api/reviews/revoke')[0],404)
        _,r=self.req(self.create());body['record_id']=r['record_id']
        self.assertEqual(self.req(body,path='/api/reviews/revoke')[0],200)
    def test_no_promotion_and_bounded_types(self):
        cases=[('verified_by','someone'),('review_status','human_verified'),('financial_calculation_eligible',True),
               ('currency','ABC'),('normalized_value',123),('raw_value','NaN')]
        for k,v in cases:
            body=self.create();body['draft'][k]=v
            self.assertEqual(self.req(body)[0],422,k)
        for k,v in [('note',''),('note','x'*2001),('observation','approved'),('request_id','../../bad')]:
            body=self.create();body[k]=v
            self.assertEqual(self.req(body)[0],422,k)
        for k,v in [('page',True),('page',121),('file_sha256','not-a-sha'),('excerpt_end',12)]:
            body=self.create();body['draft']['provenance'][k]=v
            self.assertEqual(self.req(body)[0],422,k)
        self.assertEqual(self.req()[1]['records'],[])
    def test_private_store_and_no_http_db_access(self):
        self.req(self.create())
        self.assertEqual(self.directory.stat().st_mode & 0o777,0o700)
        self.assertEqual((self.directory/'reviews.sqlite').stat().st_mode & 0o777,0o600)
        self.assertEqual(self.req(path='/reviews.sqlite')[0],404)
        self.assertEqual(self.req(path='/api/reviews/../../reviews.sqlite')[0],404)
    def test_bad_config_rejected(self):
        for values in [dict(review_directory=self.directory,reviewer='Other',review_token=TOKEN),
                       dict(review_directory=self.directory,reviewer='Synthetic reviewer',review_token='short')]:
            with self.assertRaises(ValueError): make_server(port=0,**values)
        insecure=Path(self.tmp.name)/'insecure';insecure.mkdir(mode=0o755)
        with self.assertRaises(ValueError): make_server(port=0,review_directory=insecure,reviewer='r',review_token=TOKEN)

    def test_replayed_create_after_revocation_returns_current_state(self):
        body=self.create();_,r=self.req(body)
        _,rev=self.req(dict(request_id=str(uuid4()),record_id=r['record_id'],reason='Withdrawn'),path='/api/reviews/revoke')
        self.assertEqual(self.req(body),(200,rev))
    def test_store_lock_failure_then_same_request_recovers(self):
        import sqlite3
        body=self.create()
        db=sqlite3.connect(self.directory/'reviews.sqlite');db.execute('BEGIN IMMEDIATE')
        try:
            code,error=self.req(body)
            self.assertEqual(code,503);self.assertEqual(error['status'],'REVIEW_STORE_UNAVAILABLE')
        finally: db.rollback();db.close()
        self.assertEqual(self.req()[1]['records'],[])
        self.assertEqual(self.req(body)[0],200)
        self.assertEqual(len(self.req()[1]['records']),1)
    def test_record_capacity_is_explicit_and_does_not_erase_history(self):
        ledger=self.server.review_ledger
        for _ in range(100): ledger.mutate('record',self.create())
        self.assertEqual(len(self.req()[1]['records']),100)
        code,error=self.req(self.create());self.assertEqual(code,409)
        self.assertEqual(error['status'],'REVIEW_LIMIT')
        record=self.req()[1]['records'][0]
        self.assertEqual(self.req(dict(request_id=str(uuid4()),record_id=record['record_id'],reason='Test'),path='/api/reviews/revoke')[0],200)
        self.assertEqual(len(self.req()[1]['records']),100)
    def test_wire_invalid_json_duplicate_keys_and_oversize(self):
        for raw,expected in [('{',400),('{"request_id":1,"request_id":2}',400),('{"value":NaN}',400),('x'*32769,413)]:
            c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
            c.request('POST','/api/reviews',raw,{'Authorization':'Bearer '+TOKEN,'X-FinEvidence-CSRF':self.server.csrf,'Content-Type':'application/json'})
            r=c.getresponse();r.read();c.close();self.assertEqual(r.status,expected)
        self.assertEqual(self.req()[1]['records'],[])
    def test_wrong_types_are_rejected_without_service_crash(self):
        for field in self.create()['draft']:
            body=self.create();body['draft'][field]=[]
            self.assertEqual(self.req(body)[0],422,field)
        self.assertEqual(self.req(self.create())[0],200)
    def test_unicode_offsets_and_unknown_metadata_remain_pending(self):
        body=self.create();d=body['draft'];d['provenance']['excerpt']='收益😀 120'
        d['provenance']['excerpt_end']=8
        d['currency']=None;d['unit_scale']=None;d['normalized_value']=None
        code,r=self.req(body);self.assertEqual(code,200)
        self.assertIsNone(r['draft']['currency']);self.assertFalse(r['financial_calculation_eligible'])
    def test_reject_symlink_and_repository_store(self):
        from finevidence.service import ROOT
        for folder in [ROOT/'private-review',Path(self.tmp.name)/'link']:
            if folder.name=='link': folder.symlink_to(self.directory,target_is_directory=True)
            with self.assertRaises(ValueError): make_server(port=0,review_directory=folder,reviewer='Synthetic reviewer',review_token=TOKEN)
        target=Path(self.tmp.name)/'db-target';target.write_text('must remain')
        folder=Path(self.tmp.name)/'symlink-db';folder.mkdir(mode=0o700)
        (folder/'reviews.sqlite').symlink_to(target)
        with self.assertRaises(ValueError): make_server(port=0,review_directory=folder,reviewer='Synthetic reviewer',review_token=TOKEN)
        self.assertEqual(target.read_text(),'must remain')

    def test_unrelated_database_not_adopted_or_modified(self):
        import sqlite3
        folder=Path(self.tmp.name)/'other';folder.mkdir(mode=0o700)
        dbpath=folder/'reviews.sqlite'
        db=sqlite3.connect(dbpath);db.execute('CREATE TABLE unrelated (id INTEGER)');db.commit();db.close();dbpath.chmod(0o600)
        original=dbpath.read_bytes()
        with self.assertRaises(ValueError): make_server(port=0,review_directory=folder,reviewer='Synthetic reviewer',review_token=TOKEN)
        self.assertEqual(dbpath.read_bytes(),original)
