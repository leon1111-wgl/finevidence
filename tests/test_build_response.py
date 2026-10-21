"""Build identity must survive refusal and filesystem failures (FE-012)."""

from contextlib import redirect_stderr, redirect_stdout
import errno
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from finevidence import cli, fact_store


PROJECT = Path(__file__).resolve().parents[1]


class BuildResponseTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence")
        shutil.copytree(PROJECT / "data/synthetic", self.root / "data/synthetic")
        shutil.copytree(PROJECT / "data/facts", self.root / "data/facts")
        self.index = self.root / "data/index.json"
        self.manifest = self.root / "data/facts/synthetic.json"
        self.db = self.root / "data/facts.sqlite"
        result = self.command("import", "aurora_2023.json", "aurora_2024.json",
                              "harbor_2023.json", "harbor_2024.json")
        self.assertEqual(result.returncode, 0, result.stderr)

    def command(self, *args):
        return subprocess.run([sys.executable, "-m", "finevidence", *args], cwd=self.root,
                              capture_output=True, text=True, timeout=5)

    def assert_build_response(self, result, status, exit_code):
        self.assertEqual(result.returncode, exit_code, result.stdout + result.stderr)
        self.assertEqual(result.stderr, "")
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], status)
        self.assertEqual(payload["schema_version"], "1.0")
        self.assertIsNone(payload["answer"])
        for key in ("facts", "claims", "citations", "calculations"):
            self.assertEqual(payload[key], [])
        self.assertEqual(payload["mode"], "synthetic_store_build")
        self.assertEqual(payload["fact_store"], "sqlite_snapshot")
        return payload

    def test_existing_snapshot_refusal_retains_build_identity(self):
        first = self.assert_build_response(self.command("build-facts", "--json"),
                                           "FACT_STORE_BUILT", 0)
        before = self.db.read_bytes(), self.index.read_bytes()
        repeat = self.command("build-facts", "--json")
        self.assertEqual((self.db.read_bytes(), self.index.read_bytes()), before)
        second = self.assert_build_response(repeat, "FACT_STORE_EXISTS", 2)
        self.assertEqual(first["fact_count"], 8)
        self.assertNotIn("fact_count", second)
        self.assertNotEqual(first["trace_id"], second["trace_id"])

    def test_index_errors_retain_build_identity_without_publishing(self):
        for content, status in ((None, "INDEX_MISSING"), (b"broken", "INDEX_INVALID")):
            with self.subTest(status=status):
                if content is None:
                    self.index.unlink()
                else:
                    self.index.write_bytes(content)
                result = self.command("build-facts", "--json")
                self.assertFalse(self.db.exists())
                self.assertEqual(self.index.read_bytes() if self.index.exists() else None, content)
                self.assert_build_response(result, status, 2)

    def test_fact_errors_retain_build_identity_without_publishing(self):
        original = json.loads(self.manifest.read_text())
        original["facts"][0].update(verification_status="human_verified", verified_by="invented")
        for content, status in (("broken", "FACTS_INVALID"),
                                (json.dumps(original), "FACT_UNVERIFIED")):
            with self.subTest(status=status):
                self.manifest.write_text(content)
                index_before = self.index.read_bytes()
                result = self.command("build-facts", "--json")
                self.assertFalse(self.db.exists())
                self.assertEqual(self.index.read_bytes(), index_before)
                self.assert_build_response(result, status, 2)

    def test_publication_io_error_retains_build_identity_and_allows_retry(self):
        # Keep source validation, SQLite writes and cleanup real; only publication fails.
        out, err = io.StringIO(), io.StringIO()
        before = self.index.read_bytes()
        with patch.multiple(cli, DATA_DIR=self.root / "data/synthetic", INDEX_PATH=self.index,
                            FACTS_PATH=self.manifest, DATABASE_PATH=self.db), \
                patch.object(fact_store.os, "link", side_effect=OSError(errno.EACCES, "Permission denied")), \
                redirect_stdout(out), redirect_stderr(err):
            code = cli.main(["build-facts", "--json"])
        self.assertFalse(self.db.exists())
        self.assertEqual(list((self.root / "data").glob("facts.*.tmp")), [])
        self.assertEqual(self.index.read_bytes(), before)
        result = subprocess.CompletedProcess([], code, out.getvalue(), err.getvalue())
        self.assert_build_response(result, "IO_ERROR", 2)
        self.assert_build_response(self.command("build-facts", "--json"), "FACT_STORE_BUILT", 0)

    def test_calculation_modes_remain_distinct_from_build_on_success_and_failure(self):
        self.assertEqual(self.command("build-facts", "--json").returncode, 0)
        for operation in ("gross-margin", "revenue-growth", "gross-margin-change"):
            for company, code, status in (("Aurora Orchard", 0, "CALCULATED"),
                                          ("absent company", 2, "FACTS_NOT_FOUND")):
                with self.subTest(operation=operation, company=company):
                    result = self.command("calculate", operation, "--company", company,
                                          "--year", "2024", "--fact-store", "sqlite", "--json")
                    self.assertEqual(result.returncode, code, result.stderr)
                    payload = json.loads(result.stdout)
                    self.assertEqual(payload["mode"], "synthetic_calculation")
                    self.assertEqual(payload["status"], status)


if __name__ == "__main__":
    unittest.main()
