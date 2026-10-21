import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateBundle, run, roundRatio } from "../web/engine.mjs";
const bundle = JSON.parse(
  await readFile(new URL("../web/bundle.json", import.meta.url)),
);
const oracles = JSON.parse(
  await readFile(new URL("./web-oracles.json", import.meta.url)),
);
const corpus = await validateBundle(bundle);
test("Python workflow parity for every published case", () => {
  for (const o of oracles) {
    const r = run(corpus, o.operation, o.company, o.year, o.query || "");
    if (o.display) {
      assert.equal(r.calculations[0].display, o.display);
      assert.equal(r.citations[0].year, o.year);
    } else
      assert.deepEqual(
        r.citations.map((x) => x.citation_id),
        o.ids,
      );
  }
});
test("half-even ties, negative values and exact cross-products", () => {
  assert.equal(roundRatio(1005n, 1000n), "1.00");
  assert.equal(roundRatio(1015n, 1000n), "1.02");
  assert.equal(roundRatio(-1015n, 1000n), "-1.02");
  assert.throws(() => roundRatio(1n, 0n));
});
test("source hash and metadata drift refused", async () => {
  const b = structuredClone(bundle);
  b.sources[0].raw = b.sources[0].raw.replace("100", "999");
  await assert.rejects(() => validateBundle(b), /SOURCE_MISMATCH/);
  const c = structuredClone(bundle);
  c.facts[0].page = 2;
  await assert.rejects(() => validateBundle(c), /SOURCE_MISMATCH/);
  const d = structuredClone(bundle);
  d.facts[0].verification_status = "human_verified";
  await assert.rejects(() => validateBundle(d), /FACT_INVALID/);
});
test("missing period, unsupported requests, bad query and empty results", () => {
  assert.throws(
    () => run(corpus, "revenue-growth", "Aurora Orchard", 2023),
    /FACTS_NOT_FOUND/,
  );
  for (const q of ["", "收入", "\ud800", "x".repeat(501)])
    assert.throws(
      () => run(corpus, "search", "Aurora Orchard", 2024, q),
      /INVALID_QUERY/,
    );
  assert.throws(
    () => run(corpus, "shell", "Aurora Orchard", 2024),
    /INVALID_OPERATION/,
  );
  assert.equal(
    run(corpus, "search", "Aurora Orchard", 2024, "zzzzmissing").status,
    "NO_MATCH",
  );
});
test("zero denominator and incompatible currency refuse financial result", () => {
  const c = structuredClone(corpus);
  c.facts.find((f) => f.fact_id === "syn_aurora_2024_revenue").raw_value = "0";
  assert.throws(
    () => run(c, "gross-margin", "Aurora Orchard", 2024),
    /INVALID_DENOMINATOR/,
  );
  const d = structuredClone(corpus);
  d.facts.find((f) => f.fact_id === "syn_aurora_2023_revenue").currency = "HKD";
  assert.throws(
    () => run(d, "revenue-growth", "Aurora Orchard", 2024),
    /INCOMPARABLE_FACTS/,
  );
});
