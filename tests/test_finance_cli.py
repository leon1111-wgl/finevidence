"""Source-linked financial workflow tests; all inputs are synthetic."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]


class FinanceCommandTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence")
        shutil.copytree(PROJECT / "data", self.root / "data",
                        ignore=shutil.ignore_patterns("index.json"))
        self.manifest = self.root / "data" / "facts" / "synthetic.json"
        self.index = self.root / "data" / "index.json"

    def run_cli(self, *args):
        return subprocess.run([sys.executable, "-m", "finevidence", *args],
                              cwd=self.root, capture_output=True, text=True, timeout=5)

    def calculate(self, company="Aurora Orchard", year="2024"):
        return self.run_cli("calculate", "gross-margin", "--company", company,
                            "--year", year, "--json")

    def import_examples(self):
        result = self.run_cli("import", "aurora_2024.json", "harbor_2024.json")
        self.assertEqual(result.returncode, 0, result.stderr)

    def assert_refusal(self, result, status):
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertTrue(result.stdout.startswith("{"), result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], status)
        self.assertEqual(payload["mode"], "synthetic_calculation")
        self.assertEqual(payload["calculations"], [])
        self.assertEqual(payload["claims"], [])
        self.assertEqual(payload["citations"], [])
        self.assertIsNone(payload["answer"])
        self.assertNotIn("Traceback", result.stderr)

    def test_gross_margin_has_literal_result_and_complete_lineage(self):
        self.import_examples()
        before = self.index.read_bytes()
        for company, expected, display in (
            ("Aurora Orchard", "0.3", "30.00%"),
            ("Harbor Lantern", "0.25", "25.00%"),
        ):
            result = self.calculate(company)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "CALCULATED")
            self.assertEqual(payload["mode"], "synthetic_calculation")
            calc = payload["calculations"][0]
            self.assertEqual(calc["value"], expected)
            self.assertEqual(calc["display"], display)
            self.assertEqual(calc["unit"], "ratio")
            self.assertEqual(calc["formula"], "gross_profit / revenue")
            self.assertEqual(set(calc["input_fact_ids"].values()),
                             {fact["fact_id"] for fact in payload["facts"]})
            self.assertEqual(payload["claims"][0]["calc_id"], calc["calc_id"])
            self.assertEqual(len(payload["citations"]), 1)
            citation = payload["citations"][0]
            self.assertEqual(citation["company"], company)
            self.assertEqual(citation["page_kind"], "synthetic")
            source = json.loads((self.root / "data" / "synthetic" /
                                 citation["source_file"]).read_text())
            self.assertIn(citation["excerpt"], source["pages"][citation["page"] - 1])
            for fact in payload["facts"]:
                self.assertEqual(fact["verification_status"], "synthetic_fixture")
                self.assertIsNone(fact["verified_by"])
                self.assertEqual(fact["citation_id"], citation["citation_id"])
            self.assertRegex(payload["trace_id"], r"^[0-9a-f]{32}$")
        self.assertEqual(self.index.read_bytes(), before)

    def test_missing_import_is_distinct_from_missing_fact(self):
        self.assert_refusal(self.calculate(), "INDEX_MISSING")
        self.import_examples()
        self.assert_refusal(self.calculate("Unknown Company"), "FACTS_NOT_FOUND")
        self.assert_refusal(self.calculate(year="2023"), "FACTS_NOT_FOUND")

    def edit_manifest(self, edit):
        manifest = json.loads(self.manifest.read_text())
        edit(manifest)
        self.manifest.write_text(json.dumps(manifest))

    def test_source_edit_and_snapshot_edit_are_both_rejected(self):
        self.import_examples()
        path = self.root / "data" / "synthetic" / "aurora_2024.json"
        original = path.read_bytes()
        path.write_bytes(original.replace(b"120", b"999"))
        self.assert_refusal(self.calculate(), "SOURCE_MISMATCH")
        path.write_bytes(original)
        index = self.index.read_text()
        self.index.write_text(index.replace("120", "999"))
        self.assert_refusal(self.calculate(), "SOURCE_MISMATCH")

    def test_invalid_fact_provenance_is_rejected(self):
        self.import_examples()
        original = self.manifest.read_bytes()
        for field, value in (("source_sha256", "0" * 64),
                             ("source_excerpt", "Invented original text"),
                             ("page", 2), ("doc_id", "syn_harbor_2024")):
            with self.subTest(field=field):
                self.manifest.write_bytes(original)
                self.edit_manifest(lambda m: m["facts"][0].update({field: value}))
                self.assert_refusal(self.calculate(), "SOURCE_MISMATCH")

    def test_unverified_and_fake_human_verified_facts_are_refused(self):
        self.import_examples()
        original = self.manifest.read_bytes()
        for status, person in (("candidate", None), ("human_verified", "fabricated")):
            self.manifest.write_bytes(original)
            self.edit_manifest(lambda m: m["facts"][0].update(
                verification_status=status, verified_by=person))
            self.assert_refusal(self.calculate(), "FACT_UNVERIFIED")

    def test_duplicates_and_missing_operands_do_not_silently_select(self):
        self.import_examples()
        original = self.manifest.read_bytes()
        self.edit_manifest(lambda m: m["facts"].append(m["facts"][0]))
        self.assert_refusal(self.calculate(), "FACT_CONFLICT")
        self.manifest.write_bytes(original)
        self.edit_manifest(lambda m: m["facts"].pop(0))
        self.assert_refusal(self.calculate(), "FACTS_NOT_FOUND")

    def test_manifest_failure_never_looks_like_absent_disclosure(self):
        self.import_examples()
        original = self.manifest.read_bytes()
        for content in (b"not json", b"{}", b'{"version":true,"facts":[]}', b"x" * 65537):
            self.manifest.write_bytes(content)
            self.assert_refusal(self.calculate(), "FACTS_INVALID")
        self.manifest.write_bytes(original)
        self.manifest.unlink()
        self.assert_refusal(self.calculate(), "FACTS_INVALID")

    def test_bad_selectors_are_validation_errors(self):
        self.import_examples()
        self.assert_refusal(self.calculate(company=""), "INVALID_COMPANY")
        self.assert_refusal(self.calculate(year="0"), "INVALID_YEAR")

    def test_manifest_encoding_and_nesting_are_bounded(self):
        self.import_examples()
        original = self.manifest.read_text()
        for raw in (original.encode("utf-16"), b"[" * 1500 + b"0" + b"]" * 1500):
            with self.subTest(size=len(raw)):
                self.manifest.write_bytes(raw)
                self.assert_refusal(self.calculate(), "FACTS_INVALID")

    def test_report_year_cannot_be_relabelled_in_fact_manifest(self):
        self.import_examples()
        def relabel(manifest):
            for fact in manifest["facts"]:
                fact.update(period_start="2025-01-01", period_end="2025-12-31")
        self.edit_manifest(relabel)
        self.assert_refusal(self.calculate(year="2025"), "SOURCE_MISMATCH")

    def test_fact_source_path_cannot_escape_data_root(self):
        self.import_examples()
        (self.root / "private.json").write_text("PRIVATE_SENTINEL")
        self.edit_manifest(lambda m: m["facts"][0].update(source_file="../../private.json"))
        result = self.calculate()
        self.assert_refusal(result, "INVALID_PATH")
        self.assertNotIn("PRIVATE_SENTINEL", result.stdout + result.stderr)

    def test_replay_has_stable_calculation_and_new_request_id(self):
        self.import_examples()
        first = json.loads(self.calculate().stdout)
        second = json.loads(self.calculate().stdout)
        self.assertEqual(first["calculations"], second["calculations"])
        self.assertNotEqual(first["trace_id"], second["trace_id"])

    def test_text_mode_exposes_inputs_and_sources(self):
        self.import_examples()
        result = self.run_cli("calculate", "gross-margin", "--company", "Aurora Orchard", "--year", "2024")
        self.assertEqual(result.returncode, 0, result.stderr)
        for expected in ("SYNTHETIC", "30.00%", "gross_profit / revenue", "36000000",
                         "120000000", "aurora_2024.json", "page=1"):
            self.assertIn(expected, result.stdout)

    def test_invalid_unicode_fact_metadata_has_typed_failure_in_both_output_modes(self):
        self.import_examples()
        before = self.index.read_bytes()
        original = self.manifest.read_bytes()
        for field in ("accounting_basis", "consolidation_scope"):
            for codepoint in (0xD800, 0xDC00):
                with self.subTest(field=field, codepoint=codepoint):
                    self.manifest.write_bytes(original)
                    def change(manifest):
                        for record in manifest["facts"]:
                            if record["company"] == "Aurora Orchard":
                                record[field] += chr(codepoint)
                    self.edit_manifest(change)
                    result = self.calculate()
                    self.assert_refusal(result, "INVALID_FACT")
                    self.assertEqual(json.loads(result.stdout)["facts"], [])
                    self.assertEqual(result.stderr, "")
                    text = self.run_cli("calculate", "gross-margin", "--company", "Aurora Orchard",
                                        "--year", "2024")
                    self.assertEqual(text.returncode, 2, text.stderr)
                    self.assertEqual(text.stdout, "")
                    self.assertTrue(text.stderr.startswith("INVALID_FACT:"), text.stderr)
                    self.assertNotIn("Traceback", text.stderr)
                    self.assertEqual(self.index.read_bytes(), before)

    def test_valid_non_bmp_fact_metadata_is_preserved_and_replayable(self):
        self.import_examples()
        original = self.manifest.read_bytes()
        before = self.index.read_bytes()
        baseline = json.loads(self.calculate().stdout)["calculations"][0]["calc_id"]
        for field in ("accounting_basis", "consolidation_scope"):
            with self.subTest(field=field):
                self.manifest.write_bytes(original)
                def change(manifest):
                    for record in manifest["facts"]:
                        if record["company"] == "Aurora Orchard":
                            record[field] += "🍎"
                self.edit_manifest(change)
                first, replay = self.calculate(), self.calculate()
                self.assertEqual(first.returncode, 0, first.stderr)
                self.assertEqual(replay.returncode, 0, replay.stderr)
                payload = json.loads(first.stdout)
                self.assertEqual(payload["status"], "CALCULATED")
                for record in payload["facts"]:
                    self.assertTrue(record[field].endswith("🍎"))
                calculation = payload["calculations"][0]
                self.assertEqual(calculation["display"], "30.00%")
                self.assertNotEqual(calculation["calc_id"], baseline)
                self.assertEqual(calculation, json.loads(replay.stdout)["calculations"][0])
                self.assertEqual(self.index.read_bytes(), before)

    def test_verifier_text_validation_does_not_grant_verification(self):
        self.import_examples()
        original = self.manifest.read_bytes()
        for value, expected in (("reviewer" + chr(0xD800), "INVALID_FACT"),
                                ("reviewer" + chr(0xDC00), "INVALID_FACT"),
                                ("reviewer🍎", "FACT_UNVERIFIED")):
            with self.subTest(value=repr(value)):
                self.manifest.write_bytes(original)
                self.edit_manifest(lambda m: m["facts"][0].update(verified_by=value))
                self.assert_refusal(self.calculate(), expected)


if __name__ == "__main__":
    unittest.main()
