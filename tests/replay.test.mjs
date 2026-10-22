import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateBundle } from "../web/engine.mjs";
import {
  createReplay,
  verifyReplay,
  MAX_REPLAY_BYTES,
} from "../web/replay.mjs";
const corpus = await validateBundle(
  JSON.parse(await readFile(new URL("../web/bundle.json", import.meta.url))),
);
const manifest = JSON.parse(
  await readFile(new URL("../web/manifest.json", import.meta.url)),
);
const request = {
  operation: "revenue-growth",
  company: "Aurora Orchard",
  year: 2024,
  query: "",
};
const review = {
  notes: "已核对2024；2023仍需复核。",
  checked_citation_ids: ["syn_aurora_2024:p1:c1"],
};
const base = () => createReplay(corpus, manifest, request, review);
const check = (x) => verifyReplay(JSON.stringify(x), corpus, manifest);
test("roundtrip reruns eight literal financial tasks and preserves partial review", () => {
  for (const [company, operation, year, display] of [
    ["Aurora Orchard", "gross-margin", 2023, "25.00%"],
    ["Aurora Orchard", "gross-margin", 2024, "30.00%"],
    ["Aurora Orchard", "revenue-growth", 2024, "20.00%"],
    ["Aurora Orchard", "gross-margin-change", 2024, "5.00 pp"],
    ["Harbor Lantern", "gross-margin", 2023, "30.00%"],
    ["Harbor Lantern", "gross-margin", 2024, "25.00%"],
    ["Harbor Lantern", "revenue-growth", 2024, "-20.00%"],
    ["Harbor Lantern", "gross-margin-change", 2024, "-5.00 pp"],
  ]) {
    const record = createReplay(
      corpus,
      manifest,
      { company, operation, year, query: "" },
      { notes: "", checked_citation_ids: [] },
    );
    assert.equal(record.snapshot.calculations[0].display, display);
    assert.equal(check(record).passed, true);
  }
  assert.deepEqual(base().review, review);
  assert.equal(check(base()).recomputed_display, "20.00%");
});
import { mutations } from "./fixtures/replay-mutations.mjs";
for (const [name, mutate, code] of mutations)
  test(`reject ${name} despite parseable JSON`, () => {
    const r = base();
    mutate(r);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(r)));
    const v = check(r);
    assert.equal(v.passed, false);
    assert.ok(
      v.checks.some((c) => !c.passed && c.code === code),
      JSON.stringify(v),
    );
  });
test("reject foreign corpus, arbitrary tool, missing period, schema and byte limits", () => {
  const r = base();
  r.corpus_sha256 = "0".repeat(64);
  assert.equal(check(r).passed, false);
  for (const op of ["agent", "shell"]) {
    const r = base();
    r.request.operation = op;
    assert.equal(check(r).passed, false);
  }
  const prior = base();
  prior.request.year = 2023;
  assert.equal(check(prior).passed, false);
  for (const raw of [
    "{",
    "null",
    "[]",
    JSON.stringify({ format: "other" }),
    " ".repeat(MAX_REPLAY_BYTES + 1),
  ])
    assert.equal(verifyReplay(raw, corpus, manifest).passed, false);
  const deep = base();
  deep.snapshot.sources = [JSON.parse("[".repeat(60) + "0" + "]".repeat(60))];
  assert.equal(check(deep).passed, false);
  const duplicate = base();
  duplicate.review.checked_citation_ids.push(
    duplicate.review.checked_citation_ids[0],
  );
  assert.equal(check(duplicate).passed, false);
  const extra = base();
  extra.snapshot.secret = "not-part-of-the-protocol";
  assert.equal(check(extra).passed, false);
});
test("search empty/facts replay and untrusted notes/version remain explicit", () => {
  for (const operation of ["search", "facts"]) {
    const r = createReplay(
      corpus,
      manifest,
      {
        ...request,
        operation,
        query: operation === "search" ? "zzzzmissing" : "",
      },
      { notes: "", checked_citation_ids: [] },
    );
    assert.equal(check(r).passed, true);
  }
  const r = base();
  r.review.notes = "<img src=x onerror=alert(1)>";
  r.source_commit = "f".repeat(40);
  const v = check(r);
  assert.equal(v.passed, true);
  assert.ok(v.warnings.includes("AUTHORSHIP_NOT_VERIFIED"));
  assert.ok(v.warnings.includes("VERSION_DIFFERS"));
  assert.equal(v.reviewed_count, 1);
});

test("difference gives the precise field and bounded expected/received text", () => {
  const r = base();
  r.snapshot.calculations[0].display = "999.00%";
  const v = check(r),
    c = v.checks.find((c) => c.code === "CALCULATION_MISMATCH");
  assert.deepEqual(c.differences[0], {
    path: "calculations[0].display",
    received: '"999.00%"',
    expected: '"20.00%"',
  });
});

test("reject numeric overflow instead of canonicalizing it into a null answer", () => {
  const r = createReplay(
    corpus,
    manifest,
    { ...request, operation: "search", query: "zzzzmissing" },
    { notes: "", checked_citation_ids: [] },
  );
  const raw = JSON.stringify(r).replace('"answer":null', '"answer":1e400');
  const v = verifyReplay(raw, corpus, manifest);
  assert.equal(v.passed, false);
  assert.equal(v.checks[0].code, "SCHEMA_INVALID");
});
