import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateBundle, run } from "../web/engine.mjs";
import { renderReviewBrief } from "../web/review-brief.mjs";

const corpus = await validateBundle(
  JSON.parse(await readFile(new URL("../web/bundle.json", import.meta.url))),
);
function record(
  operation = "revenue-growth",
  company = "Aurora Orchard",
  query = "",
) {
  const result = run(corpus, operation, company, 2024, query);
  return structuredClone({
    schema_version: 1,
    classification: "SYNTHETIC",
    exported_at: "2026-10-29T00:00:00.000Z",
    source_commit: "a".repeat(40),
    corpus_sha256: "b".repeat(64),
    request: { operation, company, year: 2024, query },
    result,
    review: {
      notes: "One checked; one pending.",
      checked_citation_ids: result.citations
        .slice(0, 1)
        .map((c) => c.citation_id),
      verification: "browser_user_check_only_not_authenticated",
    },
    sources: corpus.docs.filter((d) =>
      result.citations.some((c) => c.doc_id === d.doc_id),
    ),
  });
}
test("brief retains exact numbers, both years, full pages, hashes and partial review", () => {
  const r = record(),
    before = JSON.stringify(r),
    html = renderReviewBrief(r);
  for (const value of [
    "20.00%",
    "120",
    "100",
    "USD",
    "1000000",
    "2024-01-01",
    "2023-12-31",
    "synthetic_simplified",
    "standalone",
    r.source_commit,
    r.corpus_sha256,
    r.review.notes,
  ])
    assert.ok(html.includes(value), value);
  for (const d of r.sources) {
    assert.ok(html.includes(d.sha256));
    for (const p of d.pages) assert.ok(html.includes(p));
  }
  assert.match(html, /1 \/ 2/);
  assert.match(html, /未经认证/);
  assert.match(html, /SYNTHETIC/);
  assert.match(html, /href="#citation-1"/);
  assert.match(html, /id="citation-1"/);
  assert.equal(JSON.stringify(r), before);
});
test("all six supported financial results keep their literal display and formula", () => {
  for (const company of ["Aurora Orchard", "Harbor Lantern"])
    for (const op of [
      "gross-margin",
      "revenue-growth",
      "gross-margin-change",
    ]) {
      const r = record(op, company),
        html = renderReviewBrief(r);
      assert.ok(html.includes(r.result.calculations[0].display));
      assert.ok(html.includes(r.result.calculations[0].formula));
      for (const fact of r.result.facts) assert.ok(html.includes(fact.fact_id));
    }
});
test("empty retrieval never invents financial output or checked sources", () => {
  const html = renderReviewBrief(
    record("search", "Aurora Orchard", "zzzzmissing"),
  );
  assert.match(html, /NO_MATCH/);
  assert.match(html, /没有匹配证据/);
  assert.match(html, /0 \/ 0/);
  assert.doesNotMatch(html, /30\.00%|20\.00%|已认证|human_verified/);
});
test("untrusted notes and result text are escaped; no executable or remote content", () => {
  const r = record(),
    attack =
      '</p><img src="https://example.invalid/secret" onerror="alert(1)"><script>alert(2)</script>&';
  r.review.notes = attack;
  r.result.answer = attack;
  r.request.query = attack;
  r.result.citations[0].excerpt = attack;
  r.sources[0].pages[0] = attack;
  const html = renderReviewBrief(r);
  assert.doesNotMatch(html, /<script|<img|<iframe|<form|<link|<base|<object/i);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;&amp;/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /@media print/);
  assert.ok(!html.includes(attack));
});
test("model metadata retains unknown usage without relabeling as deterministic or zero", () => {
  const r = record();
  r.result.mode = "model_assisted_synthetic";
  r.result.model = {
    id: "OFFLINE_TEST_STUB",
    calls: 2,
    usage: { prompt_tokens: 5 },
    usage_complete: false,
    calls_with_unknown_usage: 1,
    seconds: 0.25,
  };
  r.result.tool_trace = [
    { call: 1, tool: "calculate_metric", status: "CALCULATED" },
  ];
  const html = renderReviewBrief(r);
  assert.match(html, /模型辅助/);
  assert.match(html, /OFFLINE_TEST_STUB/);
  assert.match(html, /用量不完整/);
  assert.match(html, /calculate_metric/);
  assert.doesNotMatch(html, /未调用模型/);
});
test("unsupported classifications, failure results and bad review identity refuse", () => {
  for (const mutate of [
    (r) => (r.classification = "REAL"),
    (r) => (r.result.status = "FACTS_NOT_FOUND"),
    (r) => (r.review.verification = "human_verified"),
    (r) => (r.review.checked_citation_ids = ["made-up"]),
  ]) {
    const r = record();
    mutate(r);
    assert.throws(() => renderReviewBrief(r), /BRIEF_UNSUPPORTED/);
  }
});
