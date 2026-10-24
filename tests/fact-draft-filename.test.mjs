import test from "node:test";
import assert from "node:assert/strict";
import { createFactDraft, exportFactDrafts } from "../web/fact-draft.mjs";
import { importFactDrafts } from "../web/fact-draft-import.mjs";
const report = (name) => ({
  classification: "USER_SUPPLIED_UNVERIFIED",
  file: { name, sha256: "a".repeat(64), bytes: 1234 },
  parser: { name: "PDF.js", version: "6.4.299" },
  pages: [
    {
      page: 1,
      page_kind: "pdf_physical",
      text: "SYNTHETIC Revenue 120 million.",
    },
  ],
});
const row = (r) =>
  createFactDraft(r, {
    page: 1,
    excerpt: r.pages[0].text,
    raw_value: "120",
    metric: "revenue",
    company: "SYNTHETIC Example",
    title: "Report",
    source_url: "",
    period: "2024",
    currency: "unknown",
    scale: "unknown",
    basis: "unknown",
    scope: "unknown",
  });
// These fail if the receiver reintroduces control-character refusal or any
// boundary silently normalizes the original source name.
for (const name of [
  "report\n2024.pdf",
  "report\t2024.pdf",
  "report\r2024.pdf",
  "report\u001b.pdf",
  "report\u0085.pdf",
  "report\u202e.pdf",
  "literal\\n.pdf",
  "正常📄报告.pdf",
])
  test(`raw filename roundtrip ${JSON.stringify(name)}`, () => {
    const r = report(name),
      p = exportFactDrafts(r, [row(r)]),
      x = importFactDrafts(JSON.stringify(p), r);
    assert.deepEqual(x, p);
    assert.equal(x.file.name, name);
    assert.equal(x.drafts[0].provenance.file_name, name);
    assert.equal(x.drafts[0].normalized_value, null);
    assert.equal(x.financial_calculation_eligible, false);
  });
for (const name of ["", null, "a".repeat(513), "nul\0.pdf", "lone\ud800.pdf"])
  test(`producer refuses unsupported filename ${JSON.stringify(name)}`, () =>
    assert.throws(() => row(report(name)), /^Error: DRAFT_SOURCE$/));
test("old control filename may rebind to renamed identical source, not changed row identity", () => {
  const r = report("report\n2024.pdf"),
    p = exportFactDrafts(r, [row(r)]),
    renamed = report("renamed.pdf");
  const x = importFactDrafts(JSON.stringify(p), renamed);
  assert.equal(x.file.name, "renamed.pdf");
  assert.equal(x.drafts[0].provenance.file_name, "renamed.pdf");
  p.drafts[0].provenance.file_name = "report\\n2024.pdf";
  assert.throws(
    () => importFactDrafts(JSON.stringify(p), renamed),
    /IMPORT_CHANGED/,
  );
});
