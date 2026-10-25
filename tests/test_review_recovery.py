"""Offline recovery into new directories: preserve originals and committed history."""
import hashlib
import importlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from review_crash_fixture import interrupted_store, OPERATOR, MAGIC
from finevidence.review_ledger import ReviewError, ReviewLedger


def snapshot(directory):
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}


class ReviewRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.source = self.root / 'source'; self.output = self.root / 'outputs'
        self.output.mkdir(mode=0o700)

    def recover(self, **kwargs):
        try: module = importlib.import_module('finevidence.review_recovery')
        except ModuleNotFoundError: self.fail('Missing supported offline review recovery command')
        return module.recover_review_store(self.source, kwargs.pop('reviewer', OPERATOR), self.output, **kwargs)

    def test_startup_names_recovery_required_and_preserves_both_files(self):
        interrupted_store(self.source, 'record'); before = snapshot(self.source)
        try: ReviewLedger(self.source, OPERATOR)
        except Exception as error: self.assertEqual(str(error), 'REVIEW_RECOVERY_REQUIRED')
        else: self.fail('Hot source must not be opened or changed automatically')
        self.assertEqual(snapshot(self.source), before)

    def assert_recovery(self, action):
        expected, original, revoke, pending = interrupted_store(self.source, action)
        before = snapshot(self.source); report = self.recover(stopped=True)
        restored = ReviewLedger(report['directory'], OPERATOR)
        self.assertEqual(restored.list(), expected)
        self.assertEqual(restored.mutate('record', original)['state'], 'recorded')
        self.assertEqual(restored.mutate('revoke', revoke)['state'], 'revoked')
        first = restored.mutate(action, pending)
        self.assertEqual(restored.mutate(action, pending), first)
        self.assertEqual(snapshot(self.source), before)
        self.assertEqual(report['source_sha256'], before)
        self.assertFalse(report['financial_calculation_eligible'])
        self.assertEqual(report['kind'], 'local_review_recovery')
        self.assertEqual(Path(report['directory']).stat().st_mode & 0o777, 0o700)
        self.assertEqual(restored.path.stat().st_mode & 0o777, 0o600)

    def test_interrupted_record_restores_history_and_same_request_retry(self): self.assert_recovery('record')
    def test_interrupted_revoke_restores_history_and_same_request_retry(self): self.assert_recovery('revoke')

    def test_repeated_concurrent_recovery_keeps_source_and_uses_distinct_outputs(self):
        expected, *_ = interrupted_store(self.source, 'record'); before = snapshot(self.source)
        with ThreadPoolExecutor(2) as pool: results = list(pool.map(lambda _: self.recover(stopped=True), range(2)))
        self.assertEqual(len({r['directory'] for r in results}), 2)
        for r in results: self.assertEqual(ReviewLedger(r['directory'], OPERATOR).list(), expected)
        self.assertEqual(snapshot(self.source), before)

    def test_wrong_owner_and_unknown_store_do_not_publish_or_change_source(self):
        interrupted_store(self.source, 'record'); before = snapshot(self.source)
        with self.assertRaisesRegex(ReviewError, '^REVIEW_OWNER_MISMATCH$'): self.recover(stopped=True, reviewer='Other')
        self.assertEqual(snapshot(self.source), before); self.assertEqual(list(self.output.iterdir()), [])
        # Independently formed unknown v1 store, no application objects.
        import shutil
        shutil.rmtree(self.source); self.source.mkdir(mode=0o700)
        db = sqlite3.connect(self.source/'reviews.sqlite'); db.execute('CREATE TABLE foreign_data (value TEXT)')
        db.execute('PRAGMA user_version=1'); db.commit(); db.close(); (self.source/'reviews.sqlite').chmod(0o600)
        before = snapshot(self.source)
        with self.assertRaisesRegex(ReviewError, '^REVIEW_STORE_SCHEMA$'): self.recover(stopped=True)
        self.assertEqual(snapshot(self.source), before); self.assertEqual(list(self.output.iterdir()), [])

    def test_unknown_hot_database_is_refused_after_copy_rollback(self):
        import select
        self.source.mkdir(mode=0o700)
        code="""import os,signal,sqlite3,sys
p=sys.argv[1]
db=sqlite3.connect(p);os.chmod(p,0o600)
db.execute('CREATE TABLE foreign_data (value TEXT)');db.execute('PRAGMA user_version=1')
db.execute('INSERT INTO foreign_data VALUES (?)',('a'*10000,));db.commit()
db.execute('PRAGMA cache_size=1')
def stop(op,name,*args):
 if op==22 and name=='COMMIT':
  print('HOT_FOREIGN',flush=True);os.kill(os.getpid(),signal.SIGSTOP)
 return 0
db.set_authorizer(stop)
db.execute('UPDATE foreign_data SET value=?',('b'*20000,));db.commit()
"""
        child=subprocess.Popen([sys.executable,'-c',code,str(self.source/'reviews.sqlite')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            ready,_,_=select.select([child.stdout],[],[],8);self.assertTrue(ready)
            self.assertEqual(child.stdout.readline().strip(),'HOT_FOREIGN');child.kill();child.communicate(timeout=5)
        finally:
            if child.poll() is None:child.kill();child.communicate(timeout=5)
        self.assertEqual((self.source/'reviews.sqlite-journal').read_bytes()[:8],MAGIC)
        before=snapshot(self.source)
        with self.assertRaisesRegex(ReviewError,'^REVIEW_STORE_SCHEMA$'):self.recover(stopped=True)
        self.assertEqual(snapshot(self.source),before);self.assertEqual(list(self.output.iterdir()),[])

    def test_requires_stop_acknowledgement_before_creating_output(self):
        ReviewLedger(self.source, OPERATOR); before = snapshot(self.source)
        with self.assertRaisesRegex(ReviewError, '^REVIEW_STOP_REQUIRED$'): self.recover(stopped=False)
        self.assertEqual(snapshot(self.source), before); self.assertEqual(list(self.output.iterdir()), [])

    def test_rejects_wal_and_master_journal_without_opening_originals(self):
        interrupted_store(self.source, 'record')
        for name, data in [('reviews.sqlite-wal', b'wal'), ('reviews.sqlite-journal', b'x'*520+MAGIC)]:
            with self.subTest(name=name):
                file = self.source/name; old = file.read_bytes() if file.exists() else None
                file.write_bytes(data); file.chmod(0o600); before = snapshot(self.source)
                with self.assertRaisesRegex(ReviewError, '^REVIEW_RECOVERY_UNSUPPORTED$'): self.recover(stopped=True)
                self.assertEqual(snapshot(self.source), before); self.assertEqual(list(self.output.iterdir()), [])
                if old is None: file.unlink()
                else: file.write_bytes(old)

    def test_unsafe_paths_symlinks_and_nonregular_files_are_refused(self):
        ReviewLedger(self.source, OPERATOR)
        target = self.source/'reviews.sqlite'; moved = self.root/'other.sqlite'; target.rename(moved)
        target.symlink_to(moved)
        with self.assertRaisesRegex(ReviewError, '^REVIEW_PRIVATE_DIRECTORY$'): self.recover(stopped=True)
        target.unlink(); os.mkfifo(target,0o600)
        with self.assertRaisesRegex(ReviewError, '^REVIEW_PRIVATE_DIRECTORY$'): self.recover(stopped=True)
        target.unlink(); moved.rename(target); self.output.chmod(0o755)
        with self.assertRaisesRegex(ReviewError, '^REVIEW_PRIVATE_DIRECTORY$'): self.recover(stopped=True)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_source_change_during_recovery_discards_output(self):
        ReviewLedger(self.source, OPERATOR)
        try: module=importlib.import_module('finevidence.review_recovery')
        except ModuleNotFoundError: self.fail('Missing supported recovery')
        normal=module._recover_copy
        def change(*args):
            normal(*args)
            with sqlite3.connect(self.source/'reviews.sqlite') as db: db.execute('PRAGMA user_version=2')
        with patch.object(module,'_recover_copy',side_effect=change):
            with self.assertRaisesRegex(ReviewError, '^REVIEW_RECOVERY_SOURCE_CHANGED$'): self.recover(stopped=True)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_incomplete_recovery_directory_is_never_initialized(self):
        self.source.mkdir(mode=0o700); (self.source/'RECOVERY_INCOMPLETE').write_text('interrupted')
        with self.assertRaisesRegex(ReviewError, '^REVIEW_RECOVERY_INCOMPLETE$'): ReviewLedger(self.source, OPERATOR)
        self.assertFalse((self.source/'reviews.sqlite').exists())

    def test_malformed_journal_header_is_not_ignored(self):
        interrupted_store(self.source, 'record'); journal=self.source/'reviews.sqlite-journal'
        journal.write_bytes(b'BROKEN!!'+journal.read_bytes()[8:]); before=snapshot(self.source)
        with self.assertRaisesRegex(ReviewError, '^REVIEW_RECOVERY_UNSUPPORTED$'): self.recover(stopped=True)
        self.assertEqual(snapshot(self.source),before); self.assertEqual(list(self.output.iterdir()),[])

    def test_server_startup_explains_preserving_journal_without_traceback(self):
        interrupted_store(self.source,'revoke'); before=snapshot(self.source)
        env=os.environ.copy(); env['FINEVIDENCE_REVIEW_TOKEN']='synthetic-recovery-test-secret-12345678'
        result=subprocess.run([sys.executable,'-m','finevidence.server','--port','0',
                               '--review-directory',str(self.source),'--reviewer',OPERATOR],
                              capture_output=True,text=True,env=env,timeout=15)
        self.assertEqual(result.returncode,2,result.stderr)
        self.assertIn('REVIEW_RECOVERY_REQUIRED',result.stderr)
        self.assertIn('journal',result.stderr); self.assertIn('finevidence.review_recovery',result.stderr)
        self.assertNotIn('Traceback',result.stderr); self.assertNotIn(env['FINEVIDENCE_REVIEW_TOKEN'],result.stderr)
        self.assertEqual(snapshot(self.source),before)

    def test_process_kill_during_copy_keeps_source_and_retry_uses_new_output(self):
        import select
        expected,*_=interrupted_store(self.source,'record'); before=snapshot(self.source)
        code="""import os,signal,sys
from finevidence import review_recovery as r
def stop(*args):
 print('COPY_READY',flush=True);os.kill(os.getpid(),signal.SIGSTOP)
r._recover_copy=stop
r.recover_review_store(sys.argv[1],sys.argv[2],sys.argv[3],stopped=True)
"""
        child=subprocess.Popen([sys.executable,'-c',code,str(self.source),OPERATOR,str(self.output)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            ready,_,_=select.select([child.stdout],[],[],8); self.assertTrue(ready)
            self.assertEqual(child.stdout.readline().strip(),'COPY_READY')
            child.kill(); child.communicate(timeout=5)
        finally:
            if child.poll() is None: child.kill();child.communicate(timeout=5)
        abandoned=list(self.output.iterdir());self.assertEqual(len(abandoned),1)
        with self.assertRaisesRegex(ReviewError,'^REVIEW_RECOVERY_INCOMPLETE$'): ReviewLedger(abandoned[0],OPERATOR)
        done=self.recover(stopped=True)
        self.assertEqual(ReviewLedger(done['directory'],OPERATOR).list(),expected)
        self.assertEqual(snapshot(self.source),before)
        self.assertTrue((abandoned[0]/'RECOVERY_INCOMPLETE').exists())

    def test_oversize_source_is_refused_without_output(self):
        ReviewLedger(self.source,OPERATOR)
        with (self.source/'reviews.sqlite').open('ab') as f: f.truncate(64*1024*1024+1)
        with self.assertRaisesRegex(ReviewError,'^REVIEW_RECOVERY_TOO_LARGE$'): self.recover(stopped=True)
        self.assertEqual(list(self.output.iterdir()),[])

    def test_cli_recovers_without_secret_and_refuses_missing_stop_flag(self):
        expected,*_=interrupted_store(self.source,'revoke'); before=snapshot(self.source)
        cmd=[sys.executable,'-m','finevidence.review_recovery','--source',str(self.source),'--output-parent',str(self.output),'--reviewer',OPERATOR]
        denied=subprocess.run(cmd,capture_output=True,text=True,timeout=10)
        self.assertEqual(denied.returncode,2); self.assertEqual(json.loads(denied.stdout)['status'],'REVIEW_STOP_REQUIRED')
        done=subprocess.run(cmd+['--stopped'],capture_output=True,text=True,timeout=10)
        self.assertEqual(done.returncode,0,done.stderr); result=json.loads(done.stdout)
        self.assertEqual(ReviewLedger(result['directory'],OPERATOR).list(),expected)
        self.assertEqual(snapshot(self.source),before)

if __name__=='__main__': unittest.main()
