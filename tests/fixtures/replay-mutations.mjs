// Authored synthetic corruption cases; not a hidden test set.
export const mutations = [
  [
    "display",
    (r) => (r.snapshot.calculations[0].display = "999.00%"),
    "CALCULATION_MISMATCH",
  ],
  [
    "sign",
    (r) => (r.snapshot.calculations[0].display = "-20.00%"),
    "CALCULATION_MISMATCH",
  ],
  [
    "unit",
    (r) => (r.snapshot.calculations[0].display = "20.00 pp"),
    "CALCULATION_MISMATCH",
  ],
  [
    "formula",
    (r) => (r.snapshot.calculations[0].formula = "revenue / profit"),
    "CALCULATION_MISMATCH",
  ],
  ["amount", (r) => (r.snapshot.facts[0].raw_value = "999"), "FACT_MISMATCH"],
  ["scale", (r) => (r.snapshot.facts[0].unit_scale = "1"), "FACT_MISMATCH"],
  ["currency", (r) => (r.snapshot.facts[0].currency = "HKD"), "FACT_MISMATCH"],
  [
    "fact-period",
    (r) => (r.snapshot.facts[0].period_end = "2023-12-31"),
    "FACT_MISMATCH",
  ],
  ["page", (r) => (r.snapshot.citations[0].page = 2), "CITATION_MISMATCH"],
  ["year", (r) => (r.snapshot.citations[0].year = 2023), "CITATION_MISMATCH"],
  [
    "excerpt",
    (r) => (r.snapshot.citations[0].excerpt = "SYNTHETIC 999"),
    "CITATION_MISMATCH",
  ],
  ["missing-citation", (r) => r.snapshot.citations.pop(), "CITATION_MISMATCH"],
  [
    "duplicate-citation",
    (r) => r.snapshot.citations.push(r.snapshot.citations[0]),
    "CITATION_MISMATCH",
  ],
  [
    "source-pages",
    (r) => (r.snapshot.sources[0].pages[0] = "changed"),
    "SOURCE_MISMATCH",
  ],
  ["missing-source", (r) => r.snapshot.sources.pop(), "SOURCE_MISMATCH"],
  [
    "source-sha",
    (r) => (r.snapshot.sources[0].sha256 = "0".repeat(64)),
    "SOURCE_MISMATCH",
  ],
  [
    "request-company",
    (r) => (r.request.company = "Harbor Lantern"),
    "RESULT_MISMATCH",
  ],
  [
    "invented-review",
    (r) => r.review.checked_citation_ids.push("not-a-citation"),
    "REVIEW_INVALID",
  ],
];
