import test from "node:test";
import assert from "node:assert/strict";
import { createFactDraft, exportFactDrafts } from "../web/fact-draft.mjs";

const report = (text) => ({
  classification: "SYNTHETIC_DEMO_UNVERIFIED",
  file: { name: "synthetic-unicode.pdf", sha256: "a".repeat(64) },
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
  currency: "USD",
  scale: "1000000",
  basis: "unknown",
  scope: "unknown",
});

// Full and clipped excerpts must obey the same original-page numeric boundary.
for (const [name, token] of [
  ["fullwidth minus", "－120"],
  ["fullwidth percent", "120％"],
  ["Arabic percent", "120٪"],
  ["small minus", "﹣120"],
  ["fullwidth accounting parentheses", "（120）"],
  ["spaced fullwidth minus", "－ \n120"],
  ["spaced Arabic percent", "120 \n٪"],
  ["Arabic decimal separator", "120٫5"],
  ["Arabic grouping separator", "1٬120"],
  ["Arabic digit", "١120"],
  ["fullwidth digit", "120０"],
  ["superscript exponent", "120²"],
  ["per mille", "120‰"],
  ["Arabic per mille", "120؉"],
  ["figure dash", "‒120"],
  ["invisible sign separator", "－\u2060120"],
]) {
  test(`Unicode boundary rejects ${name} without changing source`, () => {
    const text = `SYNTHETIC amount ${token} units`,
      r = report(text);
    for (const excerpt of [text, "120"]) {
      assert.throws(() => createFactDraft(r, input(excerpt)), /DRAFT_TOKEN/);
      assert.equal(r.pages[0].text, text);
    }
  });
}

test("compatibility expansion before an amount does not change provenance offsets", () => {
  const text = "🧾 ﬁ ＵＳＤ 120 units",
    r = report(text);
  const d = createFactDraft(r, input("120"));
  assert.equal(d.provenance.excerpt_start, 9);
  assert.equal(d.provenance.excerpt_end, 12);
  assert.equal(text.slice(9, 12), "120");
  assert.equal(d.provenance.file_sha256, "a".repeat(64));
  assert.equal(
    exportFactDrafts(r, [d]).drafts[0].normalized_value,
    "120000000",
  );
  assert.equal(r.pages[0].text, text);
});

test("Unicode boundaries use the chosen occurrence, including during export", () => {
  const r = report("SYNTHETIC －120 units; prior 120 units");
  assert.throws(() => createFactDraft(r, input("120 units")), /DRAFT_TOKEN/);
  const d = createFactDraft(r, input("prior 120 units"));
  assert.equal(d.normalized_value, "120000000");
  const original = report("SYNTHETIC 120  units");
  const saved = createFactDraft(original, input("120"));
  assert.throws(
    () => exportFactDrafts(report("SYNTHETIC 120％ units"), [saved]),
    /DRAFT_TOKEN/,
  );
});

test("supported complete amounts and unknown units retain the original contract", () => {
  for (const [raw, expected] of [
    ["-120", "-120000000"],
    ["(120)", "-120000000"],
    ["1,120.50", "1120500000"],
  ]) {
    const r = report(`SYNTHETIC ${raw} units`);
    const d = createFactDraft(r, input(raw, raw));
    assert.equal(d.normalized_value, expected);
    assert.equal(d.review_status, "pending_human_review");
    assert.equal(d.verified_by, null);
    assert.equal(d.financial_calculation_eligible, false);
    const unknown = createFactDraft(r, {
      ...input(raw, raw),
      currency: "unknown",
      scale: "unknown",
    });
    assert.equal(unknown.normalized_value, null);
    assert.equal(unknown.currency, null);
    assert.equal(exportFactDrafts(r, [unknown]).drafts[0].unit_scale, null);
  }
  // Boundary normalization must never become permissive raw-amount conversion.
  for (const raw of ["－120", "１２０", "（120）", "120٪"]) {
    assert.throws(
      () => createFactDraft(report(`SYNTHETIC ${raw}`), input(raw, raw)),
      /DRAFT_NUMBER/,
    );
  }
});
