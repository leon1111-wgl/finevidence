"""Query text boundaries through shared functions and actual CLI byte streams."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from finevidence.retrieval import QueryError, search
from finevidence.workflow import retrieve


PROJECT = Path(__file__).resolve().parents[1]
SURROGATES = (0xD800, 0xDC00, 0xDCFF)


class QueryTextValidationTests(unittest.TestCase):
    def assert_query_error(self, operation, status):
        try:
            operation()
        except Exception as exc:
            self.assertIsInstance(exc, QueryError)
            self.assertTrue(str(exc).startswith(status + ":"), str(exc))
            self.assertNotIn("DO_NOT_ECHO", str(exc))
        else:
            self.fail(f"Expected {status}, but invalid text was accepted")

    def test_search_refuses_nontext_instead_of_raising_attribute_error(self):
        for value in (None, 42, b"revenue", ["revenue"]):
            with self.subTest(value=value):
                self.assert_query_error(lambda: search([], value), "INVALID_QUERY")

    def test_search_refuses_surrogates_even_for_an_empty_corpus(self):
        for codepoint in SURROGATES:
            with self.subTest(codepoint=codepoint):
                value = "DO_NOT_ECHO revenue" + chr(codepoint)
                self.assert_query_error(lambda: search([], value), "INVALID_QUERY")

    def test_workflow_refuses_bad_text_before_opening_the_index(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for field, status in (("query", "INVALID_QUERY"), ("company", "INVALID_COMPANY")):
                for codepoint in SURROGATES:
                    with self.subTest(field=field, codepoint=codepoint):
                        value = "DO_NOT_ECHO revenue" + chr(codepoint)
                        args = {"query": "revenue", "company": None, field: value}
                        self.assert_query_error(
                            lambda: retrieve(root / "missing.json", data_dir=root, **args), status)
            self.assertEqual(list(root.iterdir()), [])


class QueryTextCliTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence",
                        ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(PROJECT / "data/synthetic", self.root / "data/synthetic")
        self.index = self.root / "data/index.json"
        result = self.run_python(["-m", "finevidence", "import", "aurora_2024.json"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.before = self.index.read_bytes()

    def run_python(self, args, encoding=None):
        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env.pop("PYTHONIOENCODING", None)
        if encoding is not None:
            env["PYTHONIOENCODING"] = encoding
        # Capture bytes: a malformed child response must fail this test, not its collector.
        return subprocess.run([sys.executable, *args], cwd=self.root, env=env,
                              capture_output=True, timeout=3)

    def assert_refusal(self, result, status, as_json=True):
        self.assertEqual(result.returncode, 2, repr(result.stdout) + repr(result.stderr))
        stdout, stderr = result.stdout.decode("utf-8"), result.stderr.decode("utf-8")
        self.assertNotIn("Traceback", stderr)
        self.assertNotIn("DO_NOT_ECHO", stdout + stderr)
        if as_json:
            self.assertEqual(stderr, "")
            payload = json.loads(stdout)
            self.assertEqual(payload["status"], status)
            self.assertIsNone(payload["answer"])
            for field in ("claims", "citations", "calculations"):
                self.assertEqual(payload[field], [])
            self.assertNotIn("query", payload)
            self.assertNotIn("filters", payload)
        else:
            self.assertEqual(stdout, "")
            self.assertTrue(stderr.startswith(status + ":"), stderr)
        self.assertEqual(self.index.read_bytes(), self.before)

    @unittest.skipUnless(os.name == "posix", "raw argv bytes require POSIX")
    def test_raw_argv_bytes_return_valid_json_errors_under_both_output_encodings(self):
        for args, status in (
            ([b"query", b"DO_NOT_ECHO revenue\xff"], "INVALID_QUERY"),
            ([b"query", b"revenue", b"--company", b"DO_NOT_ECHO\xff"], "INVALID_COMPANY"),
        ):
            for encoding in (None, "utf-8:strict"):
                with self.subTest(status=status, encoding=encoding):
                    result = self.run_python(["-m", "finevidence", *args, "--json"], encoding)
                    self.assert_refusal(result, status)

    @unittest.skipUnless(os.name == "posix", "raw argv bytes require POSIX")
    def test_plain_cli_refuses_the_same_invalid_argv_instead_of_searching(self):
        for args, status in (
            ([b"query", b"DO_NOT_ECHO revenue\xff"], "INVALID_QUERY"),
            ([b"query", b"revenue", b"--company", b"DO_NOT_ECHO\xff"], "INVALID_COMPANY"),
        ):
            for encoding in (None, "utf-8:strict"):
                with self.subTest(status=status, encoding=encoding):
                    result = self.run_python(["-m", "finevidence", *args], encoding)
                    self.assert_refusal(result, status, as_json=False)

    def test_direct_cli_surrogates_return_typed_errors_without_serialization_crashes(self):
        for field, status in (("query", "INVALID_QUERY"), ("company", "INVALID_COMPANY")):
            for codepoint in SURROGATES:
                with self.subTest(field=field, codepoint=codepoint):
                    args = ("['query', value, '--json']" if field == "query"
                            else "['query', 'revenue', '--company', value, '--json']")
                    worker = (
                        "from finevidence.cli import main; "
                        f"value = 'DO_NOT_ECHO revenue' + chr({codepoint}); "
                        f"raise SystemExit(main({args}))"
                    )
                    result = self.run_python(["-c", worker], "utf-8:strict")
                    self.assert_refusal(result, status)

    def test_valid_non_bmp_query_and_exact_company_survive_without_normalization(self):
        source = {
            "doc_id": "syn_emoji", "company": "Orchard 🍎", "year": 2024,
            "language": "en", "classification": "SYNTHETIC",
            "notice": "SYNTHETIC fictional Unicode control.",
            "pages": ["SYNTHETIC revenue example with 🍎."],
        }
        (self.root / "data/synthetic/emoji.json").write_text(json.dumps(source), encoding="utf-8")
        imported = self.run_python(["-m", "finevidence", "import", "emoji.json"])
        self.assertEqual(imported.returncode, 0, imported.stderr)
        before = self.index.read_bytes()
        for company, status in (("Orchard 🍎", "EVIDENCE_FOUND"), ("Orchard 🍎 ", "NO_MATCH")):
            with self.subTest(company=company):
                result = self.run_python(
                    ["-m", "finevidence", "query", "revenue 🍎", "--company", company, "--json"],
                    "utf-8:strict")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stderr, b"")
                payload = json.loads(result.stdout.decode("utf-8"))
                self.assertEqual(payload["status"], status)
                self.assertEqual(payload["query"], "revenue 🍎")
                self.assertEqual(payload["filters"]["company"], company)
                if status == "EVIDENCE_FOUND":
                    self.assertEqual(len(payload["citations"]), 1)
                    self.assertEqual(payload["citations"][0]["excerpt"], source["pages"][0])
                else:
                    self.assertEqual(payload["citations"], [])
        self.assertEqual(self.index.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
