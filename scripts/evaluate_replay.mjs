// Frozen synthetic contract evaluation. JSON-parse-only is a deliberately weak
// baseline, not an implementation or measured result of any competitor.
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { validateBundle } from "../web/engine.mjs";
import { createReplay, verifyReplay } from "../web/replay.mjs";
import { mutations } from "../tests/fixtures/replay-mutations.mjs";
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
const review = { notes: "synthetic evaluation", checked_citation_ids: [] };
const rows = [],
  start = performance.now();
for (const [name, mutate, expectedCode] of mutations) {
  const record = createReplay(corpus, manifest, request, review);
  mutate(record);
  const raw = JSON.stringify(record);
  let parserAccepted = true;
  try {
    JSON.parse(raw);
  } catch {
    parserAccepted = false;
  }
  const t = performance.now(),
    v = verifyReplay(raw, corpus, manifest);
  rows.push({
    name,
    expected_reject: true,
    json_parse_only_accepted: parserAccepted,
    verifier_accepted: v.passed,
    expected_code: expectedCode,
    passed:
      !v.passed && v.checks.some((c) => !c.passed && c.code === expectedCode),
    milliseconds: performance.now() - t,
  });
}
const controls = [];
for (const [company, operation, year, display] of [
  ["Aurora Orchard", "gross-margin", 2023, "25.00%"],
  ["Aurora Orchard", "gross-margin", 2024, "30.00%"],
  ["Aurora Orchard", "revenue-growth", 2024, "20.00%"],
  ["Aurora Orchard", "gross-margin-change", 2024, "5.00 pp"],
  ["Harbor Lantern", "gross-margin", 2023, "30.00%"],
  ["Harbor Lantern", "gross-margin", 2024, "25.00%"],
  ["Harbor Lantern", "revenue-growth", 2024, "-20.00%"],
  ["Harbor Lantern", "gross-margin-change", 2024, "-5.00 pp"],
  ["Aurora Orchard", "search", 2024, null],
  ["Aurora Orchard", "facts", 2024, null],
]) {
  const r = createReplay(
    corpus,
    manifest,
    {
      company,
      operation,
      year,
      query: operation === "search" ? "zzzzmissing" : "",
    },
    review,
  );
  const v = verifyReplay(JSON.stringify(r), corpus, manifest);
  controls.push({
    company,
    operation,
    year,
    expected_display: display,
    observed_display: v.recomputed_display,
    passed: v.passed && v.recomputed_display === display,
  });
}
const report = {
  schema_version: 1,
  classification: "AUTHORED_SYNTHETIC_DEVELOPMENT_CASES",
  source_commit: manifest.commit,
  corpus_sha256: manifest.bundle_sha256,
  paid_calls: 0,
  model_usage: null,
  baseline: "JSON parsing only, not a competitor benchmark",
  corruption: {
    detected: rows.filter((r) => r.passed).length,
    total: rows.length,
    baseline_detected: rows.filter((r) => !r.json_parse_only_accepted).length,
  },
  valid_controls: {
    accepted: controls.filter((r) => r.passed).length,
    total: controls.length,
  },
  milliseconds: performance.now() - start,
  rows,
  controls,
  limitations: [
    "Not hidden, real-report, human-time-saving or model-quality evidence",
    "No identity/signature verification; coordinated valid replacement is not detectable",
    "Trusts current deployed corpus and verifier",
  ],
};
const serialized = JSON.stringify(report, null, 2);
if (process.argv[2] === "--output" && process.argv[3])
  await writeFile(process.argv[3], serialized + "\n");
console.log(serialized);
if (
  report.corruption.detected !== report.corruption.total ||
  report.valid_controls.accepted !== report.valid_controls.total
)
  process.exitCode = 1;
