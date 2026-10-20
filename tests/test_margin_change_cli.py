"""Actual CLI checks for four-operand, two-year percentage-point comparisons."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]


class MarginChangeCommandTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence")
        shutil.copytree(PROJECT / "data", self.root / "data", ignore=shutil.ignore_patterns("index.json"))
        self.index = self.root / "data/index.json"
        self.manifest = self.root / "data/facts/synthetic.json"

    def cli(self, *args):
        return subprocess.run([sys.executable, "-m", "finevidence", *args],
                              cwd=self.root, capture_output=True, text=True, timeout=3)

    def import_all(self):
        result = self.cli("import", "aurora_2023.json", "aurora_2024.json",
                          "harbor_2023.json", "harbor_2024.json")
        self.assertEqual(result.returncode, 0, result.stderr)

    def calculate(self, company="Aurora Orchard", year="2024", as_json=True):
        return self.cli("calculate", "gross-margin-change", "--company", company, "--year", year,
                        *(["--json"] if as_json else []))

    def refusal(self, result, status):
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertEqual(result.stderr, "", result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], status)
        self.assertIsNone(payload["answer"])
        for field in ("facts", "calculations", "claims", "citations"):
            self.assertEqual(payload[field], [])

    def test_two_companies_return_four_facts_two_sources_and_percentage_point_units(self):
        self.import_all(); before = self.index.read_bytes()
        for company, expected in (("Aurora Orchard", "5.00 pp"), ("Harbor Lantern", "-5.00 pp")):
            result = self.calculate(company); self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout); calc = payload["calculations"][0]
            self.assertEqual(payload["status"], "CALCULATED")
            self.assertEqual(payload["mode"], "synthetic_calculation")
            self.assertEqual(payload["filters"], {"company": company, "year": 2024,
                                                  "prior_year": 2023, "report_type": "annual"})
            self.assertEqual(calc["display"], expected)
            self.assertEqual(calc["unit"], "percentage_points")
            self.assertEqual(len(payload["facts"]), 4)
            self.assertEqual(set(calc["input_fact_ids"].values()), {f["fact_id"] for f in payload["facts"]})
            self.assertEqual(len(payload["citations"]), 2)
            self.assertEqual({c["year"] for c in payload["citations"]}, {2023, 2024})
            for citation in payload["citations"]:
                source = json.loads((self.root / "data/synthetic" / citation["source_file"]).read_text())
                self.assertIn(citation["excerpt"], source["pages"][citation["page"] - 1].split("\n\n"))
                self.assertEqual(citation["page_kind"], "synthetic")
            self.assertEqual(set(calc["citation_ids"]), {c["citation_id"] for c in payload["citations"]})
            for f in payload["facts"]:
                self.assertEqual(f["verification_status"], "synthetic_fixture")
                self.assertIsNone(f["verified_by"])
                self.assertIn(f["citation_id"], calc["citation_ids"])
            self.assertEqual(payload["claims"][0]["calc_id"], calc["calc_id"])
        self.assertEqual(self.index.read_bytes(), before)

    def test_missing_import_year_and_operand_do_not_fall_back(self):
        self.refusal(self.calculate(), "INDEX_MISSING")
        self.assertEqual(self.cli("import", "aurora_2024.json").returncode, 0)
        self.refusal(self.calculate(), "SOURCE_MISMATCH")
        self.import_all(); before = self.index.read_bytes()
        for year in ("1000", "999", "10000"):
            self.refusal(self.calculate(year=year), "INVALID_YEAR")
        self.refusal(self.calculate(year="2023"), "FACTS_NOT_FOUND")
        self.refusal(self.calculate(company="Unknown"), "FACTS_NOT_FOUND")
        original = self.manifest.read_bytes()
        for suffix in ("2023_gross_profit", "2024_gross_profit", "2023_revenue", "2024_revenue"):
            payload = json.loads(original)
            payload["facts"] = [f for f in payload["facts"] if f["fact_id"] != "syn_aurora_" + suffix]
            self.manifest.write_text(json.dumps(payload))
            self.refusal(self.calculate(), "FACTS_NOT_FOUND")
        self.assertEqual(self.index.read_bytes(), before)

    def test_cross_year_metadata_denominators_and_review_status_refuse(self):
        self.import_all(); original = self.manifest.read_bytes(); before = self.index.read_bytes()
        for edit, code in (({"currency": "HKD"}, "INCOMPARABLE_FACTS"),
                           ({"accounting_basis": "IFRS"}, "INCOMPARABLE_FACTS"),
                           ({"consolidation_scope": "consolidated"}, "INCOMPARABLE_FACTS"),
                           ({"verification_status": "human_verified", "verified_by": "invented"}, "FACT_UNVERIFIED")):
            payload = json.loads(original)
            for f in payload["facts"]:
                if f["company"] == "Aurora Orchard" and f["period_start"] == "2023-01-01": f.update(edit)
            self.manifest.write_text(json.dumps(payload)); self.refusal(self.calculate(), code)
        for year in (2023, 2024):
            for value, code in (("0", "ZERO_DENOMINATOR"), ("-100", "NEGATIVE_REVENUE")):
                payload = json.loads(original)
                next(f for f in payload["facts"] if f["fact_id"] == f"syn_aurora_{year}_revenue")["raw_value"] = value
                self.manifest.write_text(json.dumps(payload)); self.refusal(self.calculate(), code)
        self.assertEqual(self.index.read_bytes(), before)

    def test_either_source_or_snapshot_drift_refuses_without_repair(self):
        self.import_all(); before = self.index.read_bytes()
        for year in (2023, 2024):
            source = self.root / f"data/synthetic/aurora_{year}.json"; original = source.read_bytes()
            source.write_bytes(original.replace(b"revenue", b"turnover"))
            self.refusal(self.calculate(), "SOURCE_MISMATCH")
            source.write_bytes(original)
            payload = json.loads(before)
            next(d for d in payload["documents"] if d["doc_id"] == f"syn_aurora_{year}")["pages"].reverse()
            self.index.write_text(json.dumps(payload)); altered = self.index.read_bytes()
            self.refusal(self.calculate(), "SOURCE_MISMATCH")
            self.assertEqual(self.index.read_bytes(), altered)
            self.index.write_bytes(before)

    def test_replay_and_text_show_both_margins_and_four_inputs(self):
        self.import_all()
        first = self.calculate(); self.assertEqual(first.returncode, 0, first.stderr)
        first, second = json.loads(first.stdout), json.loads(self.calculate().stdout)
        self.assertEqual(first["calculations"], second["calculations"])
        self.assertNotEqual(first["trace_id"], second["trace_id"])
        result = self.calculate(as_json=False); self.assertEqual(result.returncode, 0, result.stderr)
        for value in ("SYNTHETIC", "5.00 pp", "30.00%", "25.00%", "36000000", "120000000",
                      "25000000", "100000000", "aurora_2023.json", "aurora_2024.json", "page=1"):
            self.assertIn(value, result.stdout)


if __name__ == "__main__":
    unittest.main()
