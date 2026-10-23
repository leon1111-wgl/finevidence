import test from "node:test";
import assert from "node:assert/strict";
import { createFactDraft, exportFactDrafts } from "../web/fact-draft.mjs";

const report = (text) => ({
  classification: "SYNTHETIC_DEMO_UNVERIFIED",
  file: { name: "synthetic-currency.pdf", sha256: "a".repeat(64) },
  parser: { name: "SYNTHETIC_STRING_FIXTURE", version: "1" },
  pages: [{ page: 1, page_kind: "pdf_physical", text }],
});
const input = (excerpt, raw_value = "120") => ({
  page: 1,
  excerpt,
  raw_value,
  metric: "revenue",
  company: "SYNTHETIC",
  title: "SYNTHETIC",
  source_url: "",
  period: "2024",
  currency: "unknown",
  scale: "1000",
  basis: "unknown",
  scope: "unknown",
});

// Refusing every adjacent letter breaks supported currency-prefixed transcription.
for (const code of ["RMB", "CNY", "HKD", "USD", "EUR", "JPY"]) {
  test(`complete ${code} amount keeps exact number and unverified metadata`, () => {
    const r = report(`SYNTHETIC ${code}1,120.50 units`);
    const d = createFactDraft(r, input("1,120.50", "1,120.50"));
    assert.equal(d.normalized_value, "1120500");
    assert.equal(d.currency, null);
    assert.equal(d.verified_by, null);
    assert.equal(d.financial_calculation_eligible, false);
    assert.equal(exportFactDrafts(r, [d]).drafts[0].raw_value, "1,120.50");
  });
}

for (const [token, raw, expected] of [
  ["RMB-120", "-120", "-120000"],
  ["HKD(120)", "(120)", "-120000"],
  ["USD \n120", "120", "120000"],
  ["ＲＭＢ120", "120", "120000"],
]) {
  test(`complete supported amount ${token} preserves sign and source offsets`, () => {
    const text = `SYNTHETIC ${token} units`,
      r = report(text);
    const d = createFactDraft(r, input(raw, raw));
    assert.equal(d.normalized_value, expected);
    assert.equal(
      text.slice(d.provenance.excerpt_start, d.provenance.excerpt_end),
      raw,
    );
    assert.equal(r.pages[0].text, text);
    assert.equal(exportFactDrafts(r, [d]).drafts[0].normalized_value, expected);
  });
}

// A suffix-only code exception, or skipping context across the code, is unsafe.
for (const token of [
  "ARMB120",
  "ID_RMB120",
  "USD_RMB120",
  "RMBRMB120",
  "CHF120",
  "rmb120",
  "-RMB120",
  "-RMB 120",
  "－ RMB \n120",
  "+USD 120",
  "(RMB 120)",
  "RMB-120",
  "RMB(120)",
  "RMB120%",
  "RMB120 ٪",
  "RMB1200",
  "RMB9120",
  "RMB1,120",
  "RMB120.5",
  "RMB120²",
  "RMB120USD",
]) {
  test(`currency context refuses clipped or unsupported ${token}`, () => {
    const text = `SYNTHETIC ${token} units`;
    for (const excerpt of [text, "120"]) {
      assert.throws(
        () => createFactDraft(report(text), input(excerpt)),
        /DRAFT_TOKEN/,
      );
    }
  });
}

test("a later positive currency amount cannot rescue the first negative occurrence", () => {
  const r = report("SYNTHETIC -RMB 120 units; prior RMB120 units");
  assert.throws(() => createFactDraft(r, input("120 units")), /DRAFT_TOKEN/);
  const d = createFactDraft(r, input("prior RMB120 units"));
  assert.equal(d.normalized_value, "120000");
});

test("export rechecks a sign outside the excerpt and before the currency code", () => {
  const d = createFactDraft(report("SYNTHETIC  RMB120 units"), input("120"));
  assert.throws(
    () => exportFactDrafts(report("SYNTHETIC -RMB120 units"), [d]),
    /DRAFT_TOKEN/,
  );
});

test("recognizing a prefix never infers user currency or scale", () => {
  const r = report("SYNTHETIC RMB120 units");
  const d = createFactDraft(r, { ...input("120"), scale: "unknown" });
  assert.equal(d.normalized_value, null);
  assert.equal(d.currency, null);
  assert.equal(exportFactDrafts(r, [d]).drafts[0].unit_scale, null);
});

test("a clause comma after a currency amount is not a digit-grouping comma", () => {
  const r = report("SYNTHETIC RMB120, including other amounts");
  const d = createFactDraft(r, input("120"));
  assert.equal(d.normalized_value, "120000");
  assert.equal(exportFactDrafts(r, [d]).drafts[0].raw_value, "120");
});

for (const token of [
  "RMB120,000",
  "RMB120, 000",
  "RMB120,\n000",
  "RMB120, %",
  "RMB120,",
]) {
  test(`an ambiguous trailing comma remains refused: ${token}`, () => {
    assert.throws(
      () => createFactDraft(report(`SYNTHETIC ${token}`), input("120")),
      /DRAFT_TOKEN/,
    );
  });
}
