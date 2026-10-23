import test from "node:test";
import assert from "node:assert/strict";
import { createFactDraft, exportFactDrafts } from "../web/fact-draft.mjs";
const report = (text) => ({
  classification: "SYNTHETIC_DEMO_UNVERIFIED",
  file: { name: "synthetic-symbol.pdf", sha256: "a".repeat(64) },
  parser: { name: "SYNTHETIC_STRING", version: "1" },
  pages: [{ page: 1, page_kind: "pdf_physical", text }],
});
const input = (excerpt, raw_value = "120") => ({
  page: 1,
  excerpt,
  raw_value,
  metric: "gross_profit",
  company: "SYNTHETIC",
  title: "SYNTHETIC",
  source_url: "",
  period: "2024",
  currency: "unknown",
  scale: "1000",
  basis: "unknown",
  scope: "unknown",
});
// Skipping a currency symbol must not erase the sign before it.
for (const token of [
  "-$120",
  "-HK$120",
  "-US$120",
  "-¥120",
  "-€120",
  "−£120",
  "－ＨＫ＄120",
  "− HK $ 120",
  "-\u200b$\u00a0120",
  "($120)",
  "(HK$120)",
  "( € 120 )",
  "-$ 120",
  "-CAD $120",
  "-A $120",
  "-$HK$120",
  "-RMB $120",
  "+US$120",
  "$-120",
  "$(120)",
  "$120%",
  "$1200",
  "$1,120",
  "$120.5",
  "$120‰",
  "id$120",
  "ARMB$120",
]) {
  test(`symbol context rejects incomplete ${token}`, () => {
    const text = `SYNTHETIC amount ${token} units`;
    for (const excerpt of [text, "120"]) {
      assert.throws(
        () => createFactDraft(report(text), input(excerpt)),
        /DRAFT_TOKEN/,
      );
    }
  });
}
// Rejecting all symbols would break these already usable exact transcriptions.
for (const [token, raw, want] of [
  ["$120", "120", "120000"],
  ["HK$120", "120", "120000"],
  ["HK $120", "120", "120000"],
  ["US$ -120", "-120", "-120000"],
  ["¥120", "120", "120000"],
  ["€1,120.50", "1,120.50", "1120500"],
  ["£(120)", "(120)", "-120000"],
  ["$-120", "-120", "-120000"],
  ["HK$-120", "-120", "-120000"],
  ["$(120)", "(120)", "-120000"],
  ["Revenue - prior; net $120", "120", "120000"],
]) {
  test(`complete ${token} preserves amount, offsets and unknown metadata`, () => {
    const text = `SYNTHETIC ${token} units`,
      r = report(text);
    const d = createFactDraft(r, input(raw, raw));
    assert.equal(d.normalized_value, want);
    assert.equal(
      text.slice(d.provenance.excerpt_start, d.provenance.excerpt_end),
      raw,
    );
    assert.equal(r.pages[0].text, text);
    assert.equal(d.currency, null);
    assert.equal(d.verified_by, null);
    assert.equal(
      exportFactDrafts(r, [d]).financial_calculation_eligible,
      false,
    );
    assert.equal(exportFactDrafts(r, [d]).drafts[0].normalized_value, want);
  });
}
test("later positive symbol does not rescue the selected negative occurrence", () => {
  const r = report("SYNTHETIC -HK$120 units; later HK$120 units");
  assert.throws(() => createFactDraft(r, input("120 units")), /DRAFT_TOKEN/);
  assert.equal(
    createFactDraft(r, input("later HK$120 units")).normalized_value,
    "120000",
  );
});
test("export rechecks changed sign before symbol outside the excerpt", () => {
  const d = createFactDraft(report("SYNTHETIC  HK$120 units"), input("120"));
  assert.throws(
    () => exportFactDrafts(report("SYNTHETIC -HK$120 units"), [d]),
    /DRAFT_TOKEN/,
  );
});
test("symbol never supplies a missing currency or multiplier", () => {
  const r = report("SYNTHETIC $120 units");
  const d = createFactDraft(r, { ...input("120"), scale: "unknown" });
  assert.equal(d.normalized_value, null);
  assert.equal(d.unit_scale, null);
  assert.equal(exportFactDrafts(r, [d]).drafts[0].currency, null);
});
