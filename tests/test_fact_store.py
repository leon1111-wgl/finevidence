"""Read-only SQLite boundaries and real CLI parity, using synthetic data only."""

import importlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from finevidence.documents import import_documents
from finevidence.facts import FinanceError

PROJECT = Path(__file__).resolve().parents[1]


class FactStoreTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.data = self.root / "synthetic"
        shutil.copytree(PROJECT / "data/synthetic", self.data)
        self.manifest = self.root / "synthetic.json"
        shutil.copyfile(PROJECT / "data/facts/synthetic.json", self.manifest)
        self.index = self.root / "index.json"
        self.db = self.root / "facts ?#%.sqlite"
        import_documents(self.data, self.index, sorted(p.name for p in self.data.iterdir()))

    def store(self):
        self.assertIsNotNone(importlib.util.find_spec("finevidence.fact_store"),
                             "The read-only fact-store implementation is absent")
        return importlib.import_module("finevidence.fact_store")

    def build(self):
        return self.store().build_fact_store(self.manifest, self.data, self.index, self.db)

    def read(self, company="Aurora Orchard", years=(2024, 2023)):
        return self.store().load_store_facts(self.db, company, years,
                                            metrics=("gross_profit", "revenue"))

    def test_decimal_strings_and_unicode_survive_storage(self):
        payload = json.loads(self.manifest.read_text())
        payload["facts"][0].update(raw_value="120.000000000000", accounting_basis="fixture🍎")
        self.manifest.write_text(json.dumps(payload))
        result = self.build()
        self.assertEqual(result["fact_count"], 8)
        self.assertEqual(result["classification"], "SYNTHETIC")
        rows = self.read()
        revenue = next(f for f in rows if f.fact_id == "syn_aurora_2024_revenue")
        self.assertEqual(revenue.raw_value, "120.000000000000")
        self.assertEqual(revenue.accounting_basis, "fixture🍎")
        with sqlite3.connect(self.db) as con:
            self.assertEqual(con.execute("SELECT typeof(raw_value), typeof(unit_scale), typeof(page) "
                                         "FROM facts WHERE fact_id=?",
                                         (revenue.fact_id,)).fetchone(), ("text", "text", "integer"))

    def test_reader_connection_refuses_writes_attach_and_extra_execution(self):
        self.build(); before = self.db.read_bytes()
        target = self.root / "attached.sqlite"
        with self.store().open_readonly_store(self.db) as con:
            self.assertEqual(con.execute("SELECT raw_value FROM facts WHERE fact_id=?",
                                         ("syn_aurora_2024_revenue",)).fetchone()[0], "120")
            for sql in ("UPDATE facts SET raw_value='999'", "DROP TABLE facts",
                        "CREATE TEMP TABLE temp_write(x)", "PRAGMA query_only=OFF",
                        "SELECT random()", "SELECT load_extension('absent')",
                        "ATTACH DATABASE '" + str(target) + "' AS other"):
                with self.subTest(sql=sql), self.assertRaises(sqlite3.DatabaseError):
                    con.execute(sql)
        self.assertEqual(self.db.read_bytes(), before)
        self.assertFalse(target.exists())
        with self.assertRaises(sqlite3.ProgrammingError):
            con.execute("SELECT 1")

    def test_mode_ro_is_enforced_by_the_connection_not_only_authorizer(self):
        self.build(); before = self.db.read_bytes()
        with self.store().open_readonly_store(self.db) as con:
            con.set_authorizer(None)
            con.execute("PRAGMA query_only=OFF")
            with self.assertRaises(sqlite3.OperationalError):
                con.execute("UPDATE facts SET raw_value='999'")
        self.assertEqual(self.db.read_bytes(), before)

    def test_company_is_bound_as_a_literal_and_metrics_are_allowlisted(self):
        self.build(); before = self.db.read_bytes()
        for company in ("Aurora Orchard' OR 1=1 --", "x'; DROP TABLE facts;--", "../../private"):
            self.assertEqual(self.read(company), [])
        with self.assertRaisesRegex(FinanceError, "^INVALID_OPERANDS:"):
            self.store().load_store_facts(self.db, "Aurora Orchard", (2024,), metrics=("raw_value); DROP TABLE facts;--",))
        self.assertEqual(len(self.read()), 4)
        self.assertEqual(self.db.read_bytes(), before)

    def test_missing_nonregular_and_oversized_database_fail_before_use(self):
        for kind, code in (("missing", "FACT_STORE_MISSING"), ("fifo", "FACT_STORE_INVALID"),
                           ("directory", "FACT_STORE_INVALID"), ("symlink", "FACT_STORE_INVALID"),
                           ("oversized", "FACT_STORE_INVALID")):
            with self.subTest(kind=kind):
                if kind == "fifo": os.mkfifo(self.db)
                elif kind == "directory": self.db.mkdir()
                elif kind == "symlink": self.db.symlink_to(self.manifest)
                elif kind == "oversized": self.db.write_bytes(b"x" * (1048576 + 1))
                try:
                    with self.assertRaisesRegex(FinanceError, "^" + code + ":"): self.read()
                finally:
                    if self.db.is_dir(): self.db.rmdir()
                    elif self.db.exists() or self.db.is_symlink(): self.db.unlink()
        self.assertFalse(self.db.exists())

    def test_garbage_wrong_version_schema_and_metadata_fail(self):
        self.build(); original = self.db.read_bytes()
        alterations = [
            "PRAGMA user_version=99",
            "ALTER TABLE facts RENAME TO missing_facts",
            "CREATE VIEW unexpected AS SELECT * FROM facts",
            "UPDATE metadata SET classification='REAL'",
            "UPDATE metadata SET manifest_sha256='bad'",
        ]
        for sql in alterations:
            with self.subTest(sql=sql):
                self.db.write_bytes(original)
                with sqlite3.connect(self.db) as con: con.execute(sql)
                with self.assertRaisesRegex(FinanceError, "^FACT_STORE_INVALID:"): self.read()
        for content in (b"not a database", b"", original[:100]):
            self.db.write_bytes(content)
            with self.assertRaisesRegex(FinanceError, "^FACT_STORE_INVALID:"): self.read()

    def test_sqlite_like_user_table_is_not_hidden_by_schema_filter(self):
        self.build()
        with sqlite3.connect(self.db) as con:
            con.execute("CREATE TABLE sqlitexextra(secret TEXT)")
        with self.assertRaisesRegex(FinanceError, "^FACT_STORE_INVALID:"):
            self.read()

    def test_live_journal_sidecars_and_wal_snapshot_are_refused(self):
        self.build(); original = self.db.read_bytes()
        for suffix in ("-wal", "-shm", "-journal"):
            sidecar = Path(str(self.db) + suffix); sidecar.write_bytes(b"")
            try:
                with self.assertRaisesRegex(FinanceError, "^FACT_STORE_INVALID:"): self.read()
            finally: sidecar.unlink()
        altered = bytearray(original); altered[18:20] = b"\x02\x02"
        self.db.write_bytes(altered)
        with self.assertRaisesRegex(FinanceError, "^FACT_STORE_INVALID:"): self.read()

    def test_invalid_stored_fact_is_revalidated(self):
        self.build()
        with sqlite3.connect(self.db) as con:
            con.execute("UPDATE facts SET raw_value='NaN' WHERE fact_id=?", ("syn_aurora_2024_revenue",))
        with self.assertRaisesRegex(FinanceError, "^INVALID_FACT:"): self.read()

    def test_build_rejects_bad_source_or_unverified_fact_without_publishing(self):
        self.store()
        original = self.manifest.read_bytes()
        for edit, expected in (({"page": 2}, "SOURCE_MISMATCH"),
                               ({"verification_status": "human_verified", "verified_by": "invented"}, "FACT_UNVERIFIED")):
            payload = json.loads(original); payload["facts"][0].update(edit)
            self.manifest.write_text(json.dumps(payload))
            with self.assertRaisesRegex(FinanceError, "^" + expected + ":"): self.build()
            self.assertFalse(self.db.exists())
            self.assertEqual(list(self.root.glob("*.tmp")), [])
        self.manifest.write_bytes(original)
        (self.data / "aurora_2023.json").unlink()
        with self.assertRaisesRegex(ValueError, "^SOURCE_ERROR:"): self.build()
        self.assertFalse(self.db.exists())

    def test_existing_snapshot_is_never_overwritten(self):
        self.build(); before = self.db.read_bytes()
        with self.assertRaisesRegex(FinanceError, "^FACT_STORE_EXISTS:"): self.build()
        self.assertEqual(self.db.read_bytes(), before)
        self.assertEqual(list(self.root.glob("*.tmp")), [])

    def test_publication_failure_removes_unpublished_temporary_database(self):
        store = self.store()
        with patch.object(store.os, "link", side_effect=OSError("controlled publication failure")):
            with self.assertRaises(OSError): self.build()
        self.assertFalse(self.db.exists())
        self.assertEqual(list(self.root.glob("*.tmp")), [])

    def test_reader_lock_conflict_fails_without_modifying_database(self):
        self.build(); before = self.db.read_bytes()
        # EXCLUSIVE in rollback-journal mode can block a second connection's reads.
        con = sqlite3.connect(self.db, isolation_level=None)
        try:
            con.execute("BEGIN EXCLUSIVE")
            with self.assertRaisesRegex(FinanceError, "^FACT_STORE_BUSY:"): self.read()
        finally:
            con.rollback(); con.close()
        self.assertEqual(self.db.read_bytes(), before)
        self.assertEqual(len(self.read()), 4)



    def test_sqlite_build_failure_closes_connection_and_removes_staging(self):
        store = self.store()
        connections = []
        real_connect = sqlite3.connect

        class FailingInsert(sqlite3.Connection):
            def executemany(self, *args, **kwargs):
                raise sqlite3.OperationalError("controlled insert failure")

        def connect(*args, **kwargs):
            con = real_connect(*args, **kwargs, factory=FailingInsert)
            connections.append(con)
            return con

        with patch.object(store.sqlite3, "connect", side_effect=connect):
            with self.assertRaisesRegex(FinanceError, "^FACT_STORE_INVALID:"):
                self.build()
        self.assertFalse(self.db.exists())
        self.assertEqual(list(self.root.glob("*.tmp")), [])
        with self.assertRaises(sqlite3.ProgrammingError):
            connections[0].execute("SELECT 1")


class FactStoreCommandTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence")
        shutil.copytree(PROJECT / "data/synthetic", self.root / "data/synthetic")
        (self.root / "data/facts").mkdir()
        shutil.copyfile(PROJECT / "data/facts/synthetic.json", self.root / "data/facts/synthetic.json")
        self.db = self.root / "data/facts.sqlite"
        self.index = self.root / "data/index.json"
        result = self.cli("import", "aurora_2023.json", "aurora_2024.json", "harbor_2023.json", "harbor_2024.json")
        self.assertEqual(result.returncode, 0, result.stderr)

    def cli(self, *args):
        return subprocess.run([sys.executable, "-m", "finevidence", *args], cwd=self.root,
                              capture_output=True, text=True, timeout=5)

    def build(self):
        result = self.cli("build-facts", "--json")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FACT_STORE_BUILT")
        self.assertEqual(payload["fact_count"], 8)
        return payload

    def calc(self, operation="gross-margin-change", company="Aurora Orchard", year="2024", backend="sqlite"):
        return self.cli("calculate", operation, "--company", company, "--year", year,
                        "--fact-store", backend, "--json")

    def refusal(self, result, code):
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertEqual(result.stderr, "")
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], code)
        self.assertIsNone(payload["answer"])
        for key in ("facts", "claims", "citations", "calculations"): self.assertEqual(payload[key], [])

    def test_build_response_separates_api_and_database_schema_versions(self):
        payload = self.build()
        self.assertEqual(payload["schema_version"], "1.0")
        self.assertEqual(payload["store_schema_version"], 1)
        self.assertEqual(payload["mode"], "synthetic_store_build")
        self.assertIsNone(payload["answer"])

    def test_all_calculations_match_manifest_values_ids_and_provenance(self):
        self.build(); before = self.db.read_bytes(); index = self.index.read_bytes()
        for company, values in (("Aurora Orchard", ("30.00%", "20.00%", "5.00 pp")),
                                ("Harbor Lantern", ("25.00%", "-20.00%", "-5.00 pp"))):
            for op, display in zip(("gross-margin", "revenue-growth", "gross-margin-change"), values):
                with self.subTest(company=company, operation=op):
                    sql, manifest = self.calc(op, company), self.calc(op, company, backend="manifest")
                    self.assertEqual(sql.returncode, 0, sql.stderr)
                    self.assertEqual(manifest.returncode, 0, manifest.stderr)
                    actual, control = json.loads(sql.stdout), json.loads(manifest.stdout)
                    self.assertEqual(actual["fact_store"], "sqlite_snapshot")
                    self.assertEqual(control["fact_store"], "json_manifest")
                    self.assertEqual(actual["calculations"][0]["display"], display)
                    for key in ("calculations", "facts", "citations", "claims"):
                        # Facts/citations can be retrieved in a different order.
                        self.assertEqual(sorted(actual[key], key=lambda x: json.dumps(x, sort_keys=True)),
                                         sorted(control[key], key=lambda x: json.dumps(x, sort_keys=True)))
        self.assertEqual(self.db.read_bytes(), before)
        self.assertEqual(self.index.read_bytes(), index)

    def test_store_failure_does_not_fall_back_to_manifest(self):
        self.refusal(self.calc(), "FACT_STORE_MISSING")
        self.build()
        self.db.write_bytes(b"corrupt")
        self.refusal(self.calc(), "FACT_STORE_INVALID")
        self.assertEqual(self.calc(backend="manifest").returncode, 0)

    def test_selected_sources_are_rechecked_after_build(self):
        self.build(); before = self.db.read_bytes()
        for filename in ("aurora_2023.json", "aurora_2024.json"):
            source = self.root / "data/synthetic" / filename; original = source.read_bytes()
            source.write_bytes(original.replace(b"million", b"billion"))
            self.refusal(self.calc(), "SOURCE_MISMATCH")
            source.write_bytes(original)
        snapshot = self.index.read_bytes()
        self.index.write_bytes(snapshot.replace(b"120", b"999"))
        self.refusal(self.calc(), "SOURCE_MISMATCH")
        self.assertEqual(self.db.read_bytes(), before)

    def test_missing_operand_and_fake_review_in_store_have_no_result(self):
        self.build(); original = self.db.read_bytes()
        with sqlite3.connect(self.db) as con:
            con.execute("DELETE FROM facts WHERE fact_id='syn_aurora_2023_gross_profit'")
        self.refusal(self.calc(), "FACTS_NOT_FOUND")
        self.db.write_bytes(original)
        with sqlite3.connect(self.db) as con:
            con.execute("UPDATE facts SET verified_by='invented' WHERE fact_id='syn_aurora_2023_gross_profit'")
        self.refusal(self.calc(), "FACT_UNVERIFIED")

    def test_sql_values_cannot_escape_exact_selection(self):
        self.build()
        for company in ("Aurora Orchard' OR 1=1 --", "x'; DROP TABLE facts;--"):
            self.refusal(self.calc(company=company), "FACTS_NOT_FOUND")
        self.assertEqual(self.calc().returncode, 0)

    def test_snapshot_is_explicit_and_independent_of_later_manifest_edits(self):
        self.build()
        (self.root / "data/facts/synthetic.json").write_text("broken")
        result = self.calc()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["calculations"][0]["display"], "5.00 pp")
        self.refusal(self.calc(backend="manifest"), "FACTS_INVALID")

    def test_concurrent_builds_publish_once_and_preserve_completed_snapshot(self):
        command = [sys.executable, "-m", "finevidence", "build-facts", "--json"]
        processes = [subprocess.Popen(command, cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      text=True) for _ in range(2)]
        outputs = [p.communicate(timeout=5) for p in processes]
        self.assertEqual(sorted(p.returncode for p in processes), [0, 2], outputs)
        self.assertEqual({json.loads(out)["status"] for out, err in outputs},
                         {"FACT_STORE_BUILT", "FACT_STORE_EXISTS"})
        before = self.db.read_bytes()
        self.refusal(self.cli("build-facts", "--json"), "FACT_STORE_EXISTS")
        self.assertEqual(self.db.read_bytes(), before)
        self.assertEqual(self.calc().returncode, 0)
        self.assertEqual(list((self.root / "data").glob("*.tmp")), [])

    def test_text_output_and_invalid_year_keep_existing_contract(self):
        self.build()
        result = self.cli("calculate", "gross-margin-change", "--company", "Aurora Orchard",
                          "--year", "2024", "--fact-store", "sqlite")
        self.assertEqual(result.returncode, 0, result.stderr)
        for value in ("5.00 pp", "SYNTHETIC", "aurora_2023.json", "aurora_2024.json"):
            self.assertIn(value, result.stdout)
        self.refusal(self.calc(year="1000"), "INVALID_YEAR")
        self.refusal(self.calc(year="2023"), "FACTS_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
