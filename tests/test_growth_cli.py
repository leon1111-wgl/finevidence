"""Cross-year workflow with both sources and actual CLI failures."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]


class GrowthCommandTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence")
        shutil.copytree(PROJECT / "data", self.root / "data",
                        ignore=shutil.ignore_patterns("index.json"))
        self.index = self.root / "data/index.json"
        self.manifest = self.root / "data/facts/synthetic.json"

    def cli(self, *args):
        return subprocess.run([sys.executable, "-m", "finevidence", *args],
                              cwd=self.root, text=True, capture_output=True, timeout=3)

    def import_all(self):
        result = self.cli("import", "aurora_2023.json", "aurora_2024.json",
                          "harbor_2023.json", "harbor_2024.json")
        self.assertEqual(result.returncode, 0, result.stderr)

    def calculate(self, company="Aurora Orchard", year="2024", as_json=True):
        return self.cli("calculate", "revenue-growth", "--company", company, "--year", year,
                        *(["--json"] if as_json else []))

    def refusal(self, result, status):
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], status)
        self.assertEqual(payload["mode"], "synthetic_calculation")
        self.assertIsNone(payload["answer"])
        for key in ("facts", "calculations", "claims", "citations"):
            self.assertEqual(payload[key], [])
        self.assertNotIn("Traceback", result.stderr)

    def edit_facts(self, edit):
        payload = json.loads(self.manifest.read_text())
        edit(payload)
        self.manifest.write_text(json.dumps(payload))

    def test_both_companies_have_literal_results_and_two_year_source_lineage(self):
        self.import_all()
        before = self.index.read_bytes()
        for company, display in (("Aurora Orchard", "20.00%"), ("Harbor Lantern", "-20.00%")):
            result = self.calculate(company)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "CALCULATED")
            self.assertEqual(payload["filters"], {"company": company, "year": 2024,
                                                  "prior_year": 2023, "report_type": "annual"})
            calc = payload["calculations"][0]
            self.assertEqual(calc["display"], display)
            self.assertEqual(calc["unit"], "ratio")
            self.assertEqual(calc["formula"], "(current_revenue - prior_revenue) / prior_revenue")
            self.assertEqual(len(payload["facts"]), 2)
            self.assertEqual(len(payload["citations"]), 2)
            self.assertEqual({c["year"] for c in payload["citations"]}, {2023, 2024})
            self.assertEqual(set(calc["input_fact_ids"].values()), {f["fact_id"] for f in payload["facts"]})
            for citation in payload["citations"]:
                source = json.loads((self.root / "data/synthetic" / citation["source_file"]).read_text())
                self.assertEqual(citation["excerpt"], source["pages"][citation["page"] - 1].split("\n\n")[0])
                self.assertEqual(citation["page_kind"], "synthetic")
            self.assertEqual(set(calc["citation_ids"]), {c["citation_id"] for c in payload["citations"]})
            self.assertEqual(payload["claims"][0]["calc_id"], calc["calc_id"])
            self.assertTrue(all(f["verification_status"] == "synthetic_fixture"
                                and f["verified_by"] is None for f in payload["facts"]))
        self.assertEqual(self.index.read_bytes(), before)

    def test_missing_import_missing_year_and_invalid_year_are_distinct(self):
        self.refusal(self.calculate(), "INDEX_MISSING")
        self.assertEqual(self.cli("import", "aurora_2024.json").returncode, 0)
        self.refusal(self.calculate(), "SOURCE_MISMATCH")
        self.import_all()
        self.refusal(self.calculate(year="2023"), "FACTS_NOT_FOUND")
        for year in ("1000", "999", "10000"):
            self.refusal(self.calculate(year=year), "INVALID_YEAR")
        self.refusal(self.calculate(company="Unknown"), "FACTS_NOT_FOUND")

    def test_growth_needs_revenue_only_and_missing_prior_revenue_refuses(self):
        self.import_all()
        self.edit_facts(lambda m: m.update(facts=[f for f in m["facts"] if f["metric"] == "revenue"]))
        self.assertEqual(self.calculate().returncode, 0)
        self.edit_facts(lambda m: m.update(facts=[f for f in m["facts"]
                                                if f["fact_id"] != "syn_aurora_2023_revenue"]))
        self.refusal(self.calculate(), "FACTS_NOT_FOUND")

    def test_prior_source_drift_or_prior_snapshot_edit_refuses(self):
        self.import_all()
        source = self.root / "data/synthetic/aurora_2023.json"
        original = source.read_bytes()
        source.write_bytes(original.replace(b"100", b"900"))
        self.refusal(self.calculate(), "SOURCE_MISMATCH")
        source.write_bytes(original)
        snapshot = json.loads(self.index.read_text())
        next(d for d in snapshot["documents"] if d["year"] == 2023)["year"] = 2022
        self.index.write_text(json.dumps(snapshot))
        self.refusal(self.calculate(), "SOURCE_MISMATCH")

    def test_prior_metadata_zero_negative_and_verification_fail_explicitly(self):
        self.import_all()
        original = self.manifest.read_bytes()
        for edit, status in (
            ({"currency": "HKD"}, "INCOMPARABLE_FACTS"),
            ({"accounting_basis": "IFRS"}, "INCOMPARABLE_FACTS"),
            ({"consolidation_scope": "consolidated"}, "INCOMPARABLE_FACTS"),
            ({"raw_value": "0"}, "ZERO_DENOMINATOR"),
            ({"raw_value": "-100"}, "NEGATIVE_BASE"),
            ({"verification_status": "human_verified", "verified_by": "invented"}, "FACT_UNVERIFIED"),
        ):
            with self.subTest(edit=edit):
                self.manifest.write_bytes(original)
                def change(m):
                    next(f for f in m["facts"] if f["fact_id"] == "syn_aurora_2023_revenue").update(edit)
                self.edit_facts(change)
                self.refusal(self.calculate(), status)

    def test_replay_and_text_mode_show_both_years_and_originals(self):
        self.import_all()
        first, replay = self.calculate(), self.calculate()
        self.assertEqual(first.returncode, 0, first.stderr)
        first, replay = json.loads(first.stdout), json.loads(replay.stdout)
        self.assertEqual(first["calculations"], replay["calculations"])
        self.assertNotEqual(first["trace_id"], replay["trace_id"])
        result = self.calculate(as_json=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        for text in ("SYNTHETIC", "20.00%", "2024", "2023", "120000000", "100000000",
                     "aurora_2023.json", "aurora_2024.json", "page=1"):
            self.assertIn(text, result.stdout)


if __name__ == "__main__":
    unittest.main()
