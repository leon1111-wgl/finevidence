import test from "node:test";
import assert from "node:assert/strict";
import { createFactDraft, exportFactDrafts } from "../web/fact-draft.mjs";

const report = (text) => ({
  classification: "SYNTHETIC_DEMO_UNVERIFIED",
  file: { name: "synthetic-boundary.pdf", sha256: "a".repeat(64) },
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

// Removing whole-page context must fail these cases, including context lost by trim().
for (const [name, text, excerpt, raw] of [
  ["integer suffix", "SYNTHETIC revenue 1200 million", "120", "120"],
  ["integer prefix", "SYNTHETIC revenue 9120 million", "120", "120"],
  ["minus", "SYNTHETIC revenue -120 million", "120", "120"],
  ["accounting parentheses", "SYNTHETIC revenue (120) million", "120", "120"],
  ["decimal suffix", "SYNTHETIC revenue 120.5 million", "120", "120"],
  ["grouping prefix", "SYNTHETIC revenue 1,120 million", "120", "120"],
  ["percent", "SYNTHETIC margin 120%", "120", "120"],
  ["exponent prefix", "SYNTHETIC revenue 1e120 million", "120", "120"],
  ["plus", "SYNTHETIC revenue +120 million", "120", "120"],
  ["spaced minus", "SYNTHETIC revenue - \n120 million", "\n120", "120"],
  ["spaced parentheses", "SYNTHETIC revenue ( 120 ) million", " 120 ", "120"],
  ["spaced percent", "SYNTHETIC margin 120 \n%", "120 \n", "120"],
]) {
  test(`clipped excerpt rejects ${name} from original page`, () => {
    assert.throws(
      () => createFactDraft(report(text), input(excerpt, raw)),
      /DRAFT_TOKEN/,
    );
  });
}

test("a valid occurrence outside the selected excerpt cannot rescue an invalid one", () => {
  const r = report("SYNTHETIC current -120 million; prior 120 million");
  assert.throws(() => createFactDraft(r, input("120 million")), /DRAFT_TOKEN/);
  // An unambiguous excerpt pointing to the later complete token remains usable.
  const d = createFactDraft(r, input("prior 120 million"));
  assert.equal(d.normalized_value, "120000000");
  assert.equal(d.provenance.excerpt_start, 32);
});

test("search remains inside excerpt even when the page contains a complete amount", () => {
  assert.throws(
    () =>
      createFactDraft(
        report("SYNTHETIC revenue 120 million; no amount here"),
        input("no amount here"),
      ),
    /DRAFT_TOKEN/,
  );
});

test("complete clipped tokens retain signs and exact UTF-16 source position", () => {
  for (const [text, excerpt, raw, expected, start] of [
    ["🧾 SYNTHETIC USD 120 million", "120", "120", "120000000", 17],
    ["SYNTHETIC USD -120 million", "-120", "-120", "-120000000", 14],
    ["SYNTHETIC USD (120) million", "(120)", "(120)", "-120000000", 14],
    [
      "SYNTHETIC USD 1,120.50 million",
      "1,120.50",
      "1,120.50",
      "1120500000",
      14,
    ],
  ]) {
    const r = report(text),
      d = createFactDraft(r, input(excerpt, raw));
    assert.equal(d.normalized_value, expected);
    assert.equal(d.provenance.excerpt_start, start);
    assert.equal(d.provenance.excerpt_end, start + excerpt.length);
    assert.equal(d.financial_calculation_eligible, false);
    assert.equal(exportFactDrafts(r, [d]).drafts[0].normalized_value, expected);
  }
});

test("export revalidation rejects source context drift outside the excerpt", () => {
  const d = createFactDraft(report("SYNTHETIC USD  120 million"), input("120"));
  assert.throws(
    () => exportFactDrafts(report("SYNTHETIC USD -120 million"), [d]),
    /DRAFT_TOKEN/,
  );
});
