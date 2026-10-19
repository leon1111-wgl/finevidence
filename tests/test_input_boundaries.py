"""Real CLI regressions for malformed local inputs; all documents are synthetic."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]
# Public storage policy, independently expressed in the test fixture.
INDEX_CAPACITY = 1024 * 1024


class InputBoundaryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence")
        shutil.copytree(PROJECT / "data", self.root / "data",
                        ignore=shutil.ignore_patterns("index.json"))
        self.data = self.root / "data" / "synthetic"
        self.index = self.root / "data" / "index.json"

    def run_cli(self, *arguments):
        try:
            return subprocess.run([sys.executable, "-m", "finevidence", *arguments],
                                  cwd=self.root, capture_output=True, text=True, timeout=2)
        except subprocess.TimeoutExpired:
            self.fail(f"CLI blocked for more than 2 seconds: {arguments!r}")

    def assert_rejection(self, result, status, *, structured=False):
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        if structured:
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], status)
            self.assertIsNone(payload["answer"])
            for field in ("claims", "citations", "calculations"):
                self.assertEqual(payload[field], [])
            self.assertEqual(result.stderr, "")
        else:
            self.assertEqual(result.stdout, "")
            self.assertTrue(result.stderr.startswith(status + ":"), result.stderr)

    def assert_index_rejected_by_all_commands(self, status):
        for args in (
            ("query", "revenue", "--json"),
            ("calculate", "gross-margin", "--company", "Aurora Orchard", "--year", "2024", "--json"),
            ("import", "aurora_2024.json"),
        ):
            with self.subTest(command=args[0]):
                self.assert_rejection(self.run_cli(*args), status, structured="--json" in args)

    def write_document(self, name="review.json", **overrides):
        payload = json.loads((self.data / "aurora_2024.json").read_text())
        payload.update(doc_id="syn_review", company="Review Fiction", pages=["revenue"])
        payload.update(overrides)
        (self.data / name).write_text(json.dumps(payload), encoding="utf-8")

    def import_aurora(self):
        result = self.run_cli("import", "aurora_2024.json")
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(hasattr(os, "mkfifo"), "FIFO fixture requires POSIX")
    def test_fifo_index_is_rejected_by_query_calculation_and_import(self):
        os.mkfifo(self.index)
        self.assert_index_rejected_by_all_commands("INDEX_INVALID")

    def test_directory_index_is_rejected_by_all_commands(self):
        self.index.mkdir()
        self.assert_index_rejected_by_all_commands("INDEX_INVALID")

    def test_oversized_index_is_rejected_without_replacing_it(self):
        raw = b'{"version":1,"documents":[]}'
        self.index.write_bytes(raw + b" " * (INDEX_CAPACITY + 1 - len(raw)))
        before = self.index.read_bytes()
        self.assert_index_rejected_by_all_commands("INDEX_LIMIT")
        self.assertEqual(self.index.read_bytes(), before)

    def test_index_at_capacity_is_readable(self):
        raw = b'{"version":1,"documents":[]}'
        self.index.write_bytes(raw + b" " * (INDEX_CAPACITY - len(raw)))
        result = self.run_cli("query", "revenue", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "NO_MATCH")

    def test_import_cannot_write_an_index_larger_than_read_capacity(self):
        self.import_aurora()
        before = self.index.read_bytes()
        names = [f"large_{i}.json" for i in range(18)]
        for i, name in enumerate(names):
            self.write_document(name, doc_id=f"syn_large_{i}", pages=["x" * 60000])
        result = self.run_cli("import", *names)
        self.assert_rejection(result, "INDEX_LIMIT")
        self.assertEqual(self.index.read_bytes(), before)
        self.assertEqual(list(self.index.parent.glob("index.*.tmp")), [])
        result = self.run_cli("query", "revenue", "--json")
        self.assertEqual(json.loads(result.stdout)["status"], "EVIDENCE_FOUND")

    def test_lone_surrogates_in_pages_and_metadata_are_rejected(self):
        for codepoint in (0xD800, 0xDC00):
            bad = "SYNTHETIC revenue " + chr(codepoint)
            for field, value in (("pages", [bad]), ("company", bad), ("notice", bad)):
                with self.subTest(codepoint=codepoint, field=field):
                    self.write_document(**{field: value})
                    self.assert_rejection(self.run_cli("import", "review.json"), "INVALID_DOCUMENT")
                    self.assertFalse(self.index.exists())
                    self.assertEqual(list(self.index.parent.glob("index.*.tmp")), [])

    def test_invalid_unicode_batch_preserves_existing_index(self):
        self.import_aurora()
        before = self.index.read_bytes()
        self.write_document(pages=["revenue " + chr(0xD800)])
        self.assert_rejection(self.run_cli("import", "harbor_2024.json", "review.json"),
                              "INVALID_DOCUMENT")
        self.assertEqual(self.index.read_bytes(), before)
        result = self.run_cli("query", "revenue", "--json")
        self.assertEqual(json.loads(result.stdout)["citations"][0]["doc_id"], "syn_aurora_2024")

    def test_invalid_unicode_batch_does_not_create_partial_index(self):
        self.write_document(pages=["revenue " + chr(0xDC00)])
        self.assert_rejection(self.run_cli("import", "aurora_2024.json", "review.json"),
                              "INVALID_DOCUMENT")
        self.assertFalse(self.index.exists())

    def test_valid_non_bmp_text_survives_import_and_query_verbatim(self):
        # json.dumps writes a valid escaped surrogate pair for this character.
        self.write_document(company="Fiction 🍎", pages=["revenue 🍎"])
        self.assertEqual(self.run_cli("import", "review.json").returncode, 0)
        result = self.run_cli("query", "revenue", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        citation = json.loads(result.stdout)["citations"][0]
        self.assertEqual(citation["excerpt"], "revenue 🍎")
        self.assertEqual(citation["company"], "Fiction 🍎")

    def test_invalid_fact_source_path_returns_typed_error(self):
        self.import_aurora()
        manifest = self.root / "data" / "facts" / "synthetic.json"
        payload = json.loads(manifest.read_text())
        for invalid in (chr(0xD800), chr(0)):
            with self.subTest(codepoint=ord(invalid)):
                for fact in payload["facts"]:
                    if fact["company"] == "Aurora Orchard":
                        fact["source_file"] = "bad" + invalid + ".json"
                manifest.write_text(json.dumps(payload), encoding="utf-8")
                result = self.run_cli("calculate", "gross-margin", "--company", "Aurora Orchard",
                                      "--year", "2024", "--json")
                self.assert_rejection(result, "INVALID_PATH", structured=True)

    def test_invalid_unicode_in_snapshot_is_rejected_before_output(self):
        self.import_aurora()
        payload = json.loads(self.index.read_text())
        payload["documents"][0]["filename"] = "bad" + chr(0xD800) + ".json"
        self.index.write_text(json.dumps(payload), encoding="utf-8")
        self.assert_index_rejected_by_all_commands("INDEX_INVALID")

    @unittest.skipUnless(os.name == "posix", "Symlink fixtures tested on POSIX")
    def test_source_link_cycles_are_rejected_without_changing_index(self):
        self.import_aurora()
        before = self.index.read_bytes()
        (self.data / "self.json").symlink_to("self.json")
        (self.data / "first.json").symlink_to("second.json")
        (self.data / "second.json").symlink_to("first.json")
        for name in ("self.json", "first.json"):
            with self.subTest(name=name):
                self.assert_rejection(self.run_cli("import", "harbor_2024.json", name), "INVALID_PATH")
                self.assertEqual(self.index.read_bytes(), before)

    @unittest.skipUnless(os.name == "posix", "Symlink fixtures tested on POSIX")
    def test_dangling_and_external_source_links_fail_but_internal_link_works(self):
        (self.data / "dangling.json").symlink_to("absent.json")
        outside = self.root / "private.json"
        outside.write_text("PRIVATE_SENTINEL")
        (self.data / "external.json").symlink_to(outside)
        for name, status in (("dangling.json", "SOURCE_ERROR"), ("external.json", "INVALID_PATH")):
            result = self.run_cli("import", name)
            self.assert_rejection(result, status)
            self.assertNotIn("PRIVATE_SENTINEL", result.stdout + result.stderr)
        (self.data / "internal.json").symlink_to("aurora_2024.json")
        result = self.run_cli("import", "internal.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("imported=1", result.stdout)

    @unittest.skipUnless(os.name == "posix", "Symlink fixtures tested on POSIX")
    def test_broken_index_links_are_not_treated_as_missing(self):
        for target in ("index.json", "absent.json"):
            with self.subTest(target=target):
                self.index.symlink_to(target)
                try:
                    self.assert_index_rejected_by_all_commands("INDEX_INVALID")
                    self.assertTrue(self.index.is_symlink())
                finally:
                    self.index.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
