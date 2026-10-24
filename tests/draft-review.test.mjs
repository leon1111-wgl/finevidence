import test from "node:test";
import assert from "node:assert/strict";
import { createFactDraft } from "../web/fact-draft.mjs";
import { reviewFactDrafts } from "../web/draft-review.mjs";
const text =
  "SYNTHETIC Revenue 120 ; other 121 ; thousands 120000 ; large 9007199254740993.01 ; next 9007199254740993.02 ; loss (120) ; zero -0.00 ; zero 0 ; fraction 0.120 ;";
const report = {
  classification: "SYNTHETIC_DEMO_UNVERIFIED",
  file: { name: "demo.pdf", sha256: "a".repeat(64), bytes: 100 },
  parser: { name: "PDF.js", version: "test" },
  pages: [
    { page: 1, page_kind: "pdf_physical", text },
    { page: 2, page_kind: "pdf_physical", text: "Second page " + text },
  ],
};
const base = {
  company: "Example",
  title: "Report",
  period: "2024",
  metric: "revenue",
  raw_value: "120",
  currency: "USD",
  scale: "1000000",
  basis: "IFRS",
  scope: "consolidated",
  source_url: "https://example.com/r.pdf",
  page: 1,
  excerpt: text,
};
const make = (patch = {}) => createFactDraft(report, { ...base, ...patch });
const review = (rows) => reviewFactDrafts(report, rows);
test("complete declared fields never approve facts or rights", () => {
  const r = review([make()]);
  assert.equal(r.kind, "unverified_draft_review");
  assert.equal(r.financial_calculation_eligible, false);
  assert.equal(r.licensing_status, "not_verified");
  assert.equal(r.drafts[0].verified_by, null);
  assert.deepEqual(r.checks.rows[0].missing_fields, []);
  assert.deepEqual(r.checks.gates, [
    "SOURCE_RIGHTS_NOT_VERIFIED",
    "AUTHENTICATED_SEMANTIC_REVIEW_REQUIRED",
  ]);
});
test("unknowns retain nulls and identify exact affected fields", () => {
  const r = review([
    make({
      currency: "unknown",
      scale: "unknown",
      basis: "UNKNOWN",
      scope: "待核对",
      source_url: "",
    }),
  ]);
  assert.deepEqual(r.checks.rows[0].missing_fields, [
    "source_url",
    "currency",
    "unit_scale",
    "basis",
    "scope",
  ]);
  assert.equal(r.drafts[0].normalized_value, null);
  assert.equal(r.checks.rows_needing_attention, 1);
});
test("unknown company period and title are also explicit preparation gaps", () => {
  assert.deepEqual(
    review([make({ company: "unknown", period: "待核验", title: "未提供" })])
      .checks.rows[0].missing_fields,
    ["company", "title", "period"],
  );
});
test("same declaration with different exact normalized amounts is a conflict", () => {
  const r = review([make(), make({ raw_value: "121", page: 2 })]);
  assert.deepEqual(r.checks.groups, [
    {
      code: "DECLARED_VALUE_CONFLICT",
      rows: [1, 2],
      normalized_values: ["120000000", "121000000"],
    },
  ]);
  assert.equal(r.checks.rows_needing_attention, 2);
});
test("different scales with equal value are duplicate declarations not conflicts", () => {
  const r = review([
    make(),
    make({ raw_value: "120000", scale: "1000", page: 2 }),
  ]);
  assert.equal(r.checks.groups[0].code, "REPEATED_DECLARATION");
  assert.deepEqual(r.checks.groups[0].normalized_values, ["120000000"]);
});
test("exact precision beyond floating point cannot collapse conflicts", () => {
  const r = review([
    make({ raw_value: "9007199254740993.01", scale: "1" }),
    make({ raw_value: "9007199254740993.02", scale: "1" }),
  ]);
  assert.equal(r.checks.groups[0].code, "DECLARED_VALUE_CONFLICT");
  assert.equal(r.checks.groups[0].normalized_values.length, 2);
});
test("negative values stay distinct and signed zero is canonical", () => {
  assert.equal(
    review([make(), make({ raw_value: "(120)" })]).checks.groups[0].code,
    "DECLARED_VALUE_CONFLICT",
  );
  assert.equal(
    review([make({ raw_value: "-0.00" }), make({ raw_value: "0" })]).checks
      .groups[0].code,
    "REPEATED_DECLARATION",
  );
});
test("company period metric currency basis scope separate declaration groups", () => {
  for (const patch of [
    { company: "Other" },
    { period: "2023" },
    { metric: "gross_profit" },
    { currency: "HKD" },
    { basis: "restated IFRS" },
    { scope: "parent" },
  ])
    assert.deepEqual(
      review([make(), make({ ...patch, raw_value: "121" })]).checks.groups,
      [],
    );
});
test("unknown comparison context is not comparable even if strings match", () => {
  for (const patch of [
    { company: "unknown" },
    { period: "unknown" },
    { currency: "unknown" },
    { scale: "unknown" },
    { basis: "unknown" },
    { scope: "unknown" },
  ])
    assert.deepEqual(
      review([make(patch), make({ ...patch, raw_value: "121" })]).checks.groups,
      [],
    );
});
test("three rows are one group with original one-based row anchors", () => {
  const r = review([
    make({ period: "2023" }),
    make(),
    make({ raw_value: "121" }),
    make({ raw_value: "120000", scale: "1000" }),
  ]);
  assert.deepEqual(r.checks.groups[0].rows, [2, 3, 4]);
  assert.equal(r.checks.rows_needing_attention, 3);
});
test("revalidate original source and every supplied draft before checking", () => {
  for (const patch of [
    { normalized_value: "999" },
    { review_status: "human_verified" },
    { financial_calculation_eligible: true },
    { provenance: { ...make().provenance, page: 2 } },
  ])
    assert.throws(() => review([{ ...make(), ...patch }]));
  assert.throws(() =>
    reviewFactDrafts(
      { ...report, file: { ...report.file, sha256: "b".repeat(64) } },
      [make()],
    ),
  );
  assert.throws(() => review([]));
});
test("output is deterministic independent data and contains no automatic external access", () => {
  const rows = [make()];
  const before = JSON.stringify(rows);
  const a = review(rows),
    b = review(rows);
  assert.deepEqual(a, b);
  a.drafts[0].company = "changed";
  assert.equal(JSON.stringify(rows), before);
  assert.equal(a.checks.policy, "exact_declared_context_v1");
});
