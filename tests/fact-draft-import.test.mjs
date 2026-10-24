import test from "node:test";
import assert from "node:assert/strict";
import { createFactDraft, exportFactDrafts } from "../web/fact-draft.mjs";
import {
  importFactDrafts,
  MAX_DRAFT_IMPORT_BYTES,
} from "../web/fact-draft-import.mjs";
const report = {
  classification: "USER_SUPPLIED_UNVERIFIED",
  file: { name: "original.pdf", bytes: 1234, sha256: "a".repeat(64) },
  parser: { name: "PDF.js", version: "6.4.299" },
  pages: [
    {
      page: 1,
      page_kind: "pdf_physical",
      text: "SYNTHETIC Revenue USD 120 million.",
    },
    {
      page: 2,
      page_kind: "pdf_physical",
      text: "SYNTHETIC Revenue USD 100 million.",
    },
  ],
};
const row = (page = 1) =>
  createFactDraft(report, {
    page,
    excerpt: report.pages[page - 1].text,
    raw_value: page === 1 ? "120" : "100",
    metric: "revenue",
    company: "SYNTHETIC Example",
    title: "Report",
    source_url: "",
    period: page === 1 ? "2024" : "2023",
    currency: "unknown",
    scale: "unknown",
    basis: "unknown",
    scope: "unknown",
  });
const pack = () => exportFactDrafts(report, [row(1), row(2)]);
const changed = (fn, r = report) => {
  const p = pack();
  fn(p);
  return () => importFactDrafts(JSON.stringify(p), r);
};
test("two-page handoff reconstructs pending rows and preserves unknowns", () => {
  assert.deepEqual(importFactDrafts(JSON.stringify(pack()), report), pack());
});
test("object key order and whitespace are immaterial", () => {
  const reverse = (x) =>
    Array.isArray(x)
      ? x.map(reverse)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.entries(x)
              .reverse()
              .map(([k, v]) => [k, reverse(v)]),
          )
        : x;
  assert.deepEqual(
    importFactDrafts(JSON.stringify(reverse(pack()), null, 1), report),
    pack(),
  );
});
test("same bytes renamed are rebound to selected local filename", () => {
  const renamed = { ...report, file: { ...report.file, name: "renamed.pdf" } };
  const r = importFactDrafts(JSON.stringify(pack()), renamed);
  assert.equal(r.file.name, "renamed.pdf");
  assert.ok(r.drafts.every((d) => d.provenance.file_name === "renamed.pdf"));
  assert.deepEqual(exportFactDrafts(renamed, r.drafts), r);
});
test("same name with changed hash or length refuses", () => {
  for (const f of [{ sha256: "b".repeat(64) }, { bytes: 1235 }])
    assert.throws(
      () =>
        importFactDrafts(JSON.stringify(pack()), {
          ...report,
          file: { ...report.file, ...f },
        }),
      /IMPORT_SOURCE/,
    );
});
test("report required and classification must match", () => {
  for (const invalid of [null, {}, { file: report.file }])
    assert.throws(
      () => importFactDrafts(JSON.stringify(pack()), invalid),
      /IMPORT_SOURCE/,
    );
  assert.throws(
    changed((p) => (p.classification = "SYNTHETIC_DEMO_UNVERIFIED")),
    /IMPORT_SOURCE/,
  );
});
for (const [name, fn] of [
  ["amount", (p) => (p.drafts[0].normalized_value = "999")],
  ["raw token", (p) => (p.drafts[0].raw_value = "12")],
  ["page", (p) => (p.drafts[0].provenance.page = 2)],
  ["excerpt", (p) => (p.drafts[0].provenance.excerpt = "invented 120")],
  ["offset", (p) => (p.drafts[0].provenance.excerpt_start = 9)],
  ["parser", (p) => (p.drafts[0].provenance.parser.version = "0")],
  ["name", (p) => (p.drafts[0].provenance.file_name = "different.pdf")],
  ["approval", (p) => (p.drafts[0].review_status = "approved")],
  ["reviewer", (p) => (p.drafts[0].verified_by = "someone")],
  ["row admission", (p) => (p.drafts[0].financial_calculation_eligible = true)],
  ["envelope admission", (p) => (p.financial_calculation_eligible = true)],
  ["rights", (p) => (p.licensing_status = "verified")],
  ["catalog", (p) => (p.source_reference = { matched: true })],
  ["unknown key", (p) => (p.admin = true)],
  ["unknown row key", (p) => (p.drafts[0].admin = true)],
  ["missing field", (p) => delete p.drafts[0].basis],
  ["limitations", (p) => (p.limitations = [])],
  [
    "url credentials",
    (p) => (p.drafts[0].source_url = "https://user:secret@example.test"),
  ],
])
  test(`refuse inconsistent ${name}`, () =>
    assert.throws(changed(fn), /IMPORT_CHANGED/));
test("reject duplicates, zero and excessive rows", () => {
  for (const rows of [[], [row(), row()], Array(21).fill(row())])
    assert.throws(
      changed((p) => (p.drafts = rows)),
      /IMPORT_CHANGED/,
    );
});
test("format version, replay envelopes, scalars and malformed JSON refuse", () => {
  for (const raw of [
    "null",
    "[]",
    "123",
    '{"format":"finevidence.replay.v1"}',
    "{",
  ])
    assert.throws(() => importFactDrafts(raw, report), /IMPORT_(JSON|SCHEMA)/);
  assert.throws(
    changed((p) => (p.schema_version = 2)),
    /IMPORT_SCHEMA/,
  );
});
test("byte limit is UTF8, nesting bounded, nonfinite numbers refuse", () => {
  for (const raw of [
    " ".repeat(MAX_DRAFT_IMPORT_BYTES + 1),
    "中".repeat(MAX_DRAFT_IMPORT_BYTES / 2),
    "[".repeat(14) + "0" + "]".repeat(14),
    '{"x":1e999}',
    JSON.stringify(Array(10000).fill(0)),
  ])
    assert.throws(() => importFactDrafts(raw, report), /IMPORT_LIMIT/);
});
test("duplicate JSON keys including escaped key aliases refuse", () => {
  for (const raw of [
    JSON.stringify(pack()).replace(
      '"schema_version":1',
      '"schema_version":2,"schema_version":1',
    ),
    JSON.stringify(pack()).replace(
      '"schema_version":1',
      '"schema_version":1,"schema_\\u0076ersion":1',
    ),
  ])
    assert.throws(() => importFactDrafts(raw, report), /IMPORT_JSON/);
});
test("asserted semantic fields can be edited but do not acquire approval", () => {
  const p = pack();
  p.drafts[0].company = "Unverified different name";
  p.drafts[0].period = "unknown";
  const r = importFactDrafts(JSON.stringify(p), report);
  assert.equal(r.drafts[0].company, "Unverified different name");
  assert.equal(r.drafts[0].financial_calculation_eligible, false);
});
