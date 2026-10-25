"""Closed v1 store recovery, using independently frozen legacy DDL and real SQLite."""
import sqlite3
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from finevidence.review_ledger import ReviewError, ReviewLedger
from test_review_ledger import draft

# Published bbb94fc format, deliberately independent of production schema constants.
LEGACY = '''
CREATE TABLE IF NOT EXISTS owner (singleton INTEGER PRIMARY KEY CHECK(singleton=1), label TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, receipt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS revocations (id TEXT PRIMARY KEY REFERENCES records(id), event TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, digest TEXT NOT NULL, response TEXT NOT NULL);
'''
OPERATOR = 'Synthetic recovery operator'

class StoreSchemaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name) / 'private # recovery?'
        self.directory.mkdir(mode=0o700)
        self.path = self.directory / 'reviews.sqlite'

    def fixture(self, ddl=LEGACY, version=1, owner=True, extra=''):
        if self.path.exists():
            self.path.unlink()
        with sqlite3.connect(self.path) as db:
            db.executescript(ddl)
            db.execute(f'PRAGMA user_version={version}')
            if owner:
                db.execute('INSERT INTO owner VALUES (1, ?)', (OPERATOR,))
            db.executescript(extra)
        self.path.chmod(0o600)

    def rejected_unchanged(self, code='REVIEW_STORE_SCHEMA', reviewer=OPERATOR):
        before = self.path.read_bytes()
        try:
            with self.assertRaisesRegex(ReviewError, '^' + code + '$'):
                ReviewLedger(self.directory, reviewer)
        finally:
            self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), hashlib.sha256(before).hexdigest(), 'rejected store bytes changed')

    def test_unrelated_versions_and_partial_schemas_are_never_adopted(self):
        for name, ddl, version in [
            ('unrelated-v0', 'CREATE TABLE unrelated (id INTEGER)', 0),
            ('unrelated-v1', 'CREATE TABLE unrelated (id INTEGER)', 1),
            ('malformed-records', 'CREATE TABLE records (wrong TEXT)', 1),
            ('future-version', LEGACY, 2),
        ]:
            with self.subTest(name=name):
                self.fixture(ddl, version, owner=False)
                self.rejected_unchanged()
                self.path.unlink()

    def test_missing_tables_and_altered_columns_constraints_are_rejected(self):
        for name, ddl in [
            ('missing-table', LEGACY.replace('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, digest TEXT NOT NULL, response TEXT NOT NULL);', '')),
            ('extra-column', LEGACY.replace('receipt TEXT NOT NULL', 'receipt TEXT NOT NULL, extra TEXT')),
            ('wrong-column', LEGACY.replace('receipt TEXT', 'wrong TEXT')),
            ('missing-primary-key', LEGACY.replace('id TEXT PRIMARY KEY, receipt', 'id TEXT, receipt')),
            ('missing-check', LEGACY.replace(' CHECK(singleton=1)', '')),
            ('missing-not-null', LEGACY.replace('receipt TEXT NOT NULL', 'receipt TEXT')),
            ('missing-foreign-key', LEGACY.replace(' REFERENCES records(id)', '')),
            ('different-collation', LEGACY.replace('id TEXT PRIMARY KEY, receipt', 'id TEXT COLLATE NOCASE PRIMARY KEY, receipt')),
        ]:
            with self.subTest(name=name):
                self.fixture(ddl)
                self.rejected_unchanged()
                self.path.unlink()

    def test_extra_objects_and_foreign_application_identity_are_rejected(self):
        for extra in [
            'CREATE TABLE unrelated (id INTEGER);',
            'CREATE INDEX custom_index ON records(receipt);',
            'CREATE VIEW custom_view AS SELECT * FROM owner;',
            "CREATE TRIGGER custom_trigger AFTER INSERT ON requests BEGIN DELETE FROM records; END;",
            'PRAGMA application_id=12345;',
        ]:
            with self.subTest(extra=extra):
                self.fixture(extra=extra)
                self.rejected_unchanged()
                self.path.unlink()

    def test_missing_owner_is_not_silently_claimed(self):
        self.fixture(owner=False)
        self.rejected_unchanged()

    def test_wrong_owner_refuses_without_rewriting_existing_store(self):
        self.fixture()
        self.rejected_unchanged('REVIEW_OWNER_MISMATCH', 'Other operator')

    def test_non_database_is_rejected_without_rewriting(self):
        self.path.write_bytes(b'Not a SQLite database; preserve original bytes')
        self.path.chmod(0o600)
        self.rejected_unchanged()

    def test_published_v1_keeps_records_revocation_and_request_replay(self):
        self.fixture()
        before = self.path.read_bytes()
        ledger = ReviewLedger(self.directory, OPERATOR)
        self.assertEqual(self.path.read_bytes(), before)
        body = dict(request_id=str(uuid4()), draft=draft(), observation='needs_changes', note='Check the source period')
        receipt = ledger.mutate('record', body)
        revoke = dict(request_id=str(uuid4()), record_id=receipt['record_id'], reason='Wrong period')
        withdrawn = ledger.mutate('revoke', revoke)
        before = self.path.read_bytes()
        restored = ReviewLedger(self.directory, OPERATOR)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(restored.list()['records'], [withdrawn])
        self.assertEqual(restored.mutate('record', body), withdrawn)
        self.assertEqual(restored.mutate('revoke', revoke), withdrawn)
        self.assertEqual(restored.list()['records'][0]['draft'], body['draft'])
        self.assertFalse(withdrawn['financial_calculation_eligible'])

    def test_empty_store_initializes_and_remains_reopenable(self):
        for existing in [False, True]:
            with self.subTest(existing=existing):
                if existing:
                    self.fixture('', 0, owner=False)
                first = ReviewLedger(self.directory, OPERATOR)
                before = self.path.read_bytes()
                self.assertEqual(first.list()['records'], [])
                self.assertEqual(ReviewLedger(self.directory, OPERATOR).list(), first.list())
                self.assertEqual(self.path.read_bytes(), before)
                self.path.unlink()

    def test_initialization_failure_rolls_back_schema_and_version(self):
        self.fixture('', 0, owner=False)
        before = self.path.read_bytes()
        connect = sqlite3.connect
        def denying_connect(database, *args, **kwargs):
            db = connect(database, *args, **kwargs)
            if str(database) != ':memory:':
                db.set_authorizer(lambda op, arg, *_: sqlite3.SQLITE_DENY
                                  if op == sqlite3.SQLITE_INSERT and arg == 'owner' else sqlite3.SQLITE_OK)
            return db
        with patch('finevidence.review_ledger.sqlite3.connect', side_effect=denying_connect):
            with self.assertRaises(sqlite3.DatabaseError):
                ReviewLedger(self.directory, OPERATOR)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(ReviewLedger(self.directory, OPERATOR).list()['records'], [])
