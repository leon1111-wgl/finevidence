import test from "node:test";
import assert from "node:assert/strict";
import {
  createFactDraft,
  exportFactDrafts,
  decimalToken,
} from "../web/fact-draft.mjs";
const text =
  "SYNTHETIC Revenue USD 120 million. Loss (1,234.50). Large 9007199254740993.01; gross profit 36.";
const report = {
  classification: "SYNTHETIC_DEMO_UNVERIFIED",
  file: { name: "demo.pdf", bytes: 1234, sha256: "a".repeat(64) },
  parser: { name: "PDF.js", version: "6.4.299" },
  pages: [
    { page: 1, page_kind: "pdf_physical", text },
    { page: 2, page_kind: "pdf_physical", text: "" },
  ],
};
const input = {
  page: 1,
  excerpt: text,
  raw_value: "120",
  metric: "revenue",
  company: "Example",
  title: "Synthetic annual report",
  source_url: "",
  period: "2024 calendar year",
  currency: "USD",
  scale: "1000000",
  basis: "unknown",
  scope: "unknown",
};
const make = (patch = {}, r = report) =>
  createFactDraft(r, { ...input, ...patch });
test("source bound unverified draft and exact decimal scaling", () => {
  const d = make();
  assert.equal(d.normalized_value, "120000000");
  assert.equal(d.provenance.file_sha256, report.file.sha256);
  assert.equal(d.provenance.page, 1);
  assert.equal(d.provenance.excerpt, text);
  assert.equal(d.provenance.excerpt_start, 0);
  assert.equal(d.review_status, "pending_human_review");
  assert.equal(d.verified_by, null);
  assert.equal(d.financial_calculation_eligible, false);
  assert.equal(d.source_url, null);
});
test("decimal tokens preserve arbitrary precision and signs", () => {
  for (const [raw, scale, expected] of [
    ["(1,234.50)", "1000", "-1234500"],
    ["9007199254740993.01", "100", "900719925474099301"],
    ["-0.00", "1", "0"],
    ["0.001", "1000", "1"],
    ["12.3400", "1", "12.34"],
  ])
    assert.equal(decimalToken(raw, scale), expected);
});
test("unknown unit is null, never inferred", () => {
  assert.equal(make({ scale: "unknown" }).normalized_value, null);
  assert.equal(make({ currency: "unknown" }).currency, null);
});
test("exact page and excerpt membership required", () => {
  for (const patch of [
    { page: 0 },
    { page: 1.5 },
    { page: 2 },
    { page: 99 },
    { excerpt: "invented 120" },
    { excerpt: " " },
    { excerpt: "x".repeat(4001) },
  ])
    assert.throws(() => make(patch));
});
test("numeric substring and sign tampering rejected", () => {
  for (const [excerpt, raw_value] of [
    ["Revenue 120", "12"],
    ["Revenue -120", "120"],
    ["Revenue (120)", "120"],
    ["Revenue 120.5", "120"],
    ["Revenue 1,120", "120"],
    ["Revenue 120%", "120"],
    ["Revenue 1e120", "120"],
  ])
    assert.throws(() =>
      make(
        { excerpt, raw_value },
        {
          ...report,
          pages: [{ page: 1, page_kind: "pdf_physical", text: excerpt }],
        },
      ),
    );
});
test("unsupported numeric formats and excessive precision refused", () => {
  for (const value of [
    "NaN",
    "Infinity",
    "1e3",
    "1,23",
    "--12",
    "(12",
    "+12",
    "1".repeat(41),
    "0." + "1".repeat(19),
  ])
    assert.throws(() => decimalToken(value, "1"));
});
test("bounded typed metadata and HTTPS-only optional provenance URL", () => {
  for (const patch of [
    { metric: "eval" },
    { scale: "999" },
    { currency: "XXX" },
    { company: "" },
    { period: "" },
    { title: "x".repeat(201) },
    { scope: "\u0000" },
    { basis: "\ud800" },
    { source_url: "javascript:alert(1)" },
    { source_url: "https://user:pass@example.com/a" },
  ])
    assert.throws(() => make(patch));
  assert.equal(
    make({ source_url: "https://example.com/report.pdf" }).source_url,
    "https://example.com/report.pdf",
  );
});
test("export is rebuilt from current report; empty, duplicate, stale or tampered rows rejected", () => {
  const d = make();
  const pack = exportFactDrafts(report, [d]);
  assert.equal(pack.kind, "unverified_fact_drafts");
  assert.equal(pack.drafts.length, 1);
  assert.equal(pack.financial_calculation_eligible, false);
  assert.equal(pack.source_metadata_status, "user_supplied_unverified");
  for (const rows of [
    [],
    [d, d],
    [{ ...d, normalized_value: "999" }],
    [{ ...d, review_status: "human_verified" }],
    Array(21).fill(d),
  ])
    assert.throws(() => exportFactDrafts(report, rows));
  assert.throws(() =>
    exportFactDrafts(
      { ...report, file: { ...report.file, sha256: "b".repeat(64) } },
      [d],
    ),
  );
  const p = exportFactDrafts(report, [d]);
  p.drafts[0].provenance.excerpt = "mutated";
  assert.equal(d.provenance.excerpt, text);
});
