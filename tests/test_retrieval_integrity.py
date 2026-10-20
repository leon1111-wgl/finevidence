"""Real CLI regressions for source drift, including false empty results."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]


class RetrievalIntegrityTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence")
        shutil.copytree(PROJECT / "data", self.root / "data",
                        ignore=shutil.ignore_patterns("index.json"))
        self.index = self.root / "data/index.json"
        self.source = self.root / "data/synthetic/aurora_2024.json"
        result = self.cli("import", "aurora_2024.json", "harbor_2024.json")
        self.assertEqual(result.returncode, 0, result.stderr)

    def cli(self, *args):
        return subprocess.run([sys.executable, "-m", "finevidence", *args],
                              cwd=self.root, capture_output=True, text=True, timeout=3)

    def query(self, *filters, as_json=True):
        return self.cli("query", "revenue", *filters, *(["--json"] if as_json else []))

    def refusal(self, status, *filters):
        before = self.index.read_bytes()
        for as_json in (True, False):
            result = self.query(*filters, as_json=as_json)
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            if as_json:
                payload = json.loads(result.stdout)
                self.assertEqual(payload["status"], status)
                self.assertIsNone(payload["answer"])
                for field in ("claims", "calculations", "citations"):
                    self.assertEqual(payload[field], [])
            else:
                self.assertEqual(result.stdout, "")
                self.assertTrue(result.stderr.startswith(status + ":"), result.stderr)
        self.assertEqual(self.index.read_bytes(), before)

    def test_snapshot_changes_refuse_before_filtering_even_when_no_hits(self):
        original = self.index.read_bytes()
        edits = (
            {"company": "Hidden Fiction"}, {"year": 2025},
            {"doc_id": "syn_forged"}, {"sha256": "0" * 64},
            {"notice": "SYNTHETIC altered notice"},
        )
        for edit in edits:
            with self.subTest(edit=edit):
                snapshot = json.loads(original)
                snapshot["documents"][0].update(edit)
                self.index.write_text(json.dumps(snapshot))
                self.refusal("SOURCE_MISMATCH", "--company", "Aurora Orchard", "--year", "2024")
                self.refusal("SOURCE_MISMATCH", "--company", "No Such Company")

    def test_snapshot_text_and_page_order_cannot_forge_citations(self):
        original = self.index.read_bytes()
        for change in ("text", "pages"):
            with self.subTest(change=change):
                snapshot = json.loads(original)
                pages = snapshot["documents"][0]["pages"]
                if change == "text":
                    pages[0] = pages[0].replace("120", "999")
                else:
                    pages.reverse()
                self.index.write_text(json.dumps(snapshot))
                self.refusal("SOURCE_MISMATCH")

    def test_source_missing_changed_and_nonregular_fail_without_fallback(self):
        original = self.source.read_bytes()
        self.source.write_bytes(original.replace(b"120", b"777"))
        changed = self.source.read_bytes()
        self.refusal("SOURCE_MISMATCH")
        self.assertEqual(self.source.read_bytes(), changed)
        self.source.unlink()
        self.refusal("SOURCE_ERROR")
        self.source.mkdir()
        self.refusal("SOURCE_ERROR")
        self.source.rmdir()
        if hasattr(os, "mkfifo"):
            os.mkfifo(self.source)
            self.refusal("SOURCE_ERROR")

    def test_bad_filename_and_external_link_refuse_without_reading_target(self):
        original = self.index.read_bytes()
        snapshot = json.loads(original)
        snapshot["documents"][0]["filename"] = "absent.json"
        self.index.write_text(json.dumps(snapshot))
        self.refusal("SOURCE_ERROR")
        self.index.write_bytes(original)
        self.source.unlink()
        outside = self.root / "outside.json"
        outside.write_text("FABRICATED_PRIVATE_SENTINEL")
        self.source.symlink_to(outside)
        self.refusal("INVALID_PATH")
        result = self.query()
        self.assertNotIn("FABRICATED_PRIVATE_SENTINEL", result.stdout + result.stderr)

    def test_invalid_source_is_not_a_successful_empty_result(self):
        for content, code in ((b"not json", "INVALID_DOCUMENT"),
                              (b"x" * 65537, "DOCUMENT_LIMIT")):
            with self.subTest(code=code):
                self.source.write_bytes(content)
                self.refusal(code, "--year", "2022")

    def test_valid_sources_and_empty_results_preserve_contract(self):
        before = self.index.read_bytes()
        payload = json.loads(self.query("--company", "Aurora Orchard", "--year", "2024").stdout)
        self.assertEqual(payload["status"], "EVIDENCE_FOUND")
        citation = payload["citations"][0]
        self.assertEqual(citation["page"], 1)
        self.assertEqual(citation["year"], 2024)
        self.assertIn("USD 120 million", citation["excerpt"])
        for args in (("--year", "2022"), ("--company", "No Such Company")):
            result = self.query(*args)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stdout)["status"], "NO_MATCH")
        result = self.cli("query", "quasarxyz", "--json")
        self.assertEqual(json.loads(result.stdout)["status"], "NO_MATCH")
        self.assertEqual(self.index.read_bytes(), before)
        self.index.write_text('{"version":1,"documents":[]}')
        self.assertEqual(json.loads(self.query().stdout)["status"], "NO_MATCH")

    def test_valid_internal_source_link_still_resolves(self):
        target = self.source.with_name("original.json")
        self.source.rename(target)
        self.source.symlink_to(target.name)
        result = self.query()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "EVIDENCE_FOUND")
