import test from "node:test";
import assert from "node:assert/strict";
import { SOURCE_CATALOG, identifySource } from "../web/source-catalog.mjs";
import { createFactDraft, exportFactDrafts } from "../web/fact-draft.mjs";
const known = {
  name: "renamed.pdf",
  bytes: 1126393,
  sha256: "dd453567d91ae07d1db89bfc227fa441dba06f1de84ff819f6ee8f9484f7e5c7",
};
test("catalog contains individually identified historical references, never licenses or facts", () => {
  assert.equal(SOURCE_CATALOG.length, 2);
  assert.equal(new Set(SOURCE_CATALOG.map((r) => r.sha256)).size, 2);
  assert.deepEqual(
    SOURCE_CATALOG.map((r) => r.period),
    ["2023", "2024"],
  );
  for (const r of SOURCE_CATALOG) {
    assert.equal(new URL(r.url).hostname, "investor.kingdee.com");
    assert.equal(r.licensing_status, "not_verified");
    assert.equal(r.accessed_on, "2026-10-24");
    assert.ok(Object.isFrozen(r));
  }
});
test("exact digest and size identify a record despite filename changes", () => {
  const found = identifySource(known);
  assert.equal(found.status, "catalog_byte_match");
  assert.equal(found.record.id, "kingdee-fy2023-results");
  assert.equal(found.record.page_count, 55);
  assert.equal(found.record.published_on, "2024-03-18");
  assert.equal(found.financial_calculation_eligible, false);
  assert.equal(found.verification_status, "not_reviewed");
  assert.equal(found.licensing_status, "not_verified");
});
test("same filename, truncated file and unrecognized digests never identify a reference", () => {
  for (const f of [
    null,
    {},
    { name: "kingdee-2023.pdf" },
    { ...known, sha256: "0".repeat(64) },
    { ...known, bytes: 1126392 },
    { ...known, bytes: "1126393" },
    { ...known, bytes: NaN },
  ]) {
    const result = identifySource(f);
    assert.equal(result.status, "not_in_catalog");
    assert.equal(result.record, null);
    assert.equal(result.financial_calculation_eligible, false);
  }
});
test("returned references cannot alter the trusted catalog", () => {
  const ref = identifySource(known);
  assert.throws(() => {
    ref.record.url = "https://example.org/forged";
  });
  assert.equal(identifySource(known).record.id, "kingdee-fy2023-results");
});
test("draft export derives reference again and keeps user assertions separate", () => {
  const report = {
    classification: "USER_SUPPLIED_UNVERIFIED",
    file: known,
    parser: { name: "PDF.js", version: "6.4.299" },
    pages: [
      {
        page: 1,
        page_kind: "pdf_physical",
        text: "SYNTHETIC revenue 120 units.",
      },
    ],
    source_reference: { status: "forged" },
  };
  const d = createFactDraft(report, {
    page: 1,
    excerpt: "revenue 120 units.",
    raw_value: "120",
    metric: "revenue",
    company: "user assertion",
    title: "user title",
    source_url: "",
    period: "unknown",
    currency: "unknown",
    scale: "unknown",
    basis: "unknown",
    scope: "unknown",
  });
  const out = exportFactDrafts(report, [d]);
  assert.equal(out.source_reference.status, "catalog_byte_match");
  assert.equal(out.source_reference.record.id, "kingdee-fy2023-results");
  assert.equal(out.drafts[0].company, "user assertion");
  assert.equal(out.drafts[0].period, "unknown");
  assert.equal(out.source_metadata_status, "user_supplied_unverified");
  assert.equal(out.licensing_status, "not_verified");
  assert.equal(out.drafts[0].verified_by, null);
  assert.equal(out.financial_calculation_eligible, false);
  report.file = { ...known, sha256: "0".repeat(64) };
  report.source_reference = out.source_reference;
  const unknown = exportFactDrafts(report, [
    createFactDraft(report, {
      ...d,
      page: 1,
      excerpt: d.provenance.excerpt,
      source_url: "",
      scale: "unknown",
      currency: "unknown",
    }),
  ]);
  assert.equal(unknown.source_reference.record, null);
});
