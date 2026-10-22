// Versioned handoff contract. All imported fields are untrusted; only the
// already validated local corpus and allowlisted deterministic runner are used.
import { run } from "./engine.mjs";
export const MAX_REPLAY_BYTES = 256 * 1024;
const FORMAT = "finevidence.replay.v1";
const operations = [
  "search",
  "facts",
  "gross-margin",
  "revenue-growth",
  "gross-margin-change",
];
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const keys = (x, expected) =>
  object(x) &&
  Object.keys(x).length === expected.length &&
  expected.every((key) => Object.hasOwn(x, key));
const text = (x, max) => typeof x === "string" && x.length <= max;
const validRequest = (r) =>
  keys(r, ["operation", "company", "year", "query"]) &&
  operations.includes(r.operation) &&
  text(r.company, 120) &&
  Number.isInteger(r.year) &&
  text(r.query, 500);
const validReview = (r, citations) =>
  keys(r, ["notes", "checked_citation_ids"]) &&
  text(r.notes, 3000) &&
  Array.isArray(r.checked_citation_ids) &&
  r.checked_citation_ids.length <= 32 &&
  new Set(r.checked_citation_ids).size === r.checked_citation_ids.length &&
  r.checked_citation_ids.every(
    (id) =>
      typeof id === "string" && citations.some((c) => c.citation_id === id),
  );
function snapshot(corpus, request) {
  const r = run(
    corpus,
    request.operation,
    request.company,
    request.year,
    request.query,
  );
  return {
    status: r.status,
    filters: r.filters,
    answer: r.answer,
    calculations: r.calculations,
    facts: r.facts,
    citations: r.citations,
    sources: corpus.docs.filter((d) =>
      r.citations.some((c) => c.doc_id === d.doc_id),
    ),
  };
}
// Object-key order is irrelevant; array order is part of this conservative v1 contract.
function canonical(x) {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (object(x))
    return (
      "{" +
      Object.keys(x)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(x[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(x);
}
// Show at most five bounded differences per group. Values remain plain text.
function differences(received, expected, root) {
  const rows = [];
  const preview = (x) =>
    x === undefined ? "（缺失）" : canonical(x).slice(0, 160);
  function visit(a, b, path) {
    if (rows.length >= 5 || canonical(a) === canonical(b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length) && rows.length < 5; i++)
        visit(a[i], b[i], `${path}[${i}]`);
    } else if (object(a) && object(b)) {
      for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (rows.length >= 5) break;
        visit(
          Object.hasOwn(a, key) ? a[key] : undefined,
          Object.hasOwn(b, key) ? b[key] : undefined,
          `${path}.${key}`,
        );
      }
    } else
      rows.push({
        path: path.slice(0, 160),
        received: preview(a),
        expected: preview(b),
      });
  }
  visit(received, expected, root);
  return rows;
}
function boundedTree(x) {
  const pending = [[x, 0]];
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (depth > 40 || (typeof value === "number" && !Number.isFinite(value)))
      return false;
    if (value && typeof value === "object")
      for (const child of Object.values(value))
        pending.push([child, depth + 1]);
  }
  return true;
}
export function createReplay(corpus, manifest, request, review) {
  if (!validRequest(request)) throw Error("REQUEST_INVALID");
  const current = snapshot(corpus, request);
  if (!validReview(review, current.citations)) throw Error("REVIEW_INVALID");
  return structuredClone({
    format: FORMAT,
    classification: "SYNTHETIC",
    exported_at: new Date().toISOString(),
    source_commit: manifest.commit,
    corpus_sha256: manifest.bundle_sha256,
    request,
    snapshot: current,
    review,
  });
}
export function verifyReplay(raw, corpus, manifest) {
  const report = {
    format: "finevidence.replay-verification.v1",
    classification: "SYNTHETIC",
    passed: false,
    verifier_commit: manifest.commit,
    corpus_sha256: manifest.bundle_sha256,
    checks: [],
    warnings: ["AUTHORSHIP_NOT_VERIFIED"],
    recomputed_display: null,
    reviewed_count: 0,
  };
  const add = (code, passed, label) => {
    const check = { code, passed, label };
    report.checks.push(check);
    return check;
  };
  const fail = (code, label) => {
    add(code, false, label);
    return report;
  };
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).byteLength > MAX_REPLAY_BYTES
  )
    return fail("FILE_LIMIT", "文件超过 256 KiB，未执行复算");
  let r;
  try {
    r = JSON.parse(raw);
  } catch {
    return fail("JSON_INVALID", "文件不是有效 JSON");
  }
  if (
    !boundedTree(r) ||
    !keys(r, [
      "format",
      "classification",
      "exported_at",
      "source_commit",
      "corpus_sha256",
      "request",
      "snapshot",
      "review",
    ]) ||
    r.format !== FORMAT ||
    r.classification !== "SYNTHETIC" ||
    !text(r.exported_at, 30) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.exported_at) ||
    !Number.isFinite(Date.parse(r.exported_at)) ||
    typeof r.source_commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(r.source_commit) ||
    typeof r.corpus_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(r.corpus_sha256) ||
    !keys(r.snapshot, [
      "status",
      "filters",
      "answer",
      "calculations",
      "facts",
      "citations",
      "sources",
    ])
  )
    return fail(
      "SCHEMA_INVALID",
      "文件不符合复算交接包 v1 格式，请选择“导出复算包”生成的文件",
    );
  if (r.corpus_sha256 !== manifest.bundle_sha256)
    return fail("CORPUS_MISMATCH", "资料包版本不同，未执行复算");
  add("CORPUS_MATCH", true, "资料包指纹一致");
  if (!validRequest(r.request))
    return fail("REQUEST_INVALID", "请求不在允许的确定性工具范围内");
  let expected;
  try {
    expected = snapshot(corpus, r.request);
  } catch {
    return fail(
      "REPLAY_REJECTED",
      "当前受信资料不能完成该请求，未使用文件内的事实代替",
    );
  }
  if (r.source_commit !== manifest.commit)
    report.warnings.push("VERSION_DIFFERS");
  const compare = (field, code, label) => {
    const check = add(
      code,
      canonical(r.snapshot[field]) === canonical(expected[field]),
      label,
    );
    if (!check.passed)
      check.differences = differences(
        r.snapshot[field],
        expected[field],
        field,
      );
  };
  add(
    "RESULT_MISMATCH",
    ["status", "filters", "answer"].every(
      (k) => canonical(r.snapshot[k]) === canonical(expected[k]),
    ),
    "任务范围、状态与答案",
  );
  compare("calculations", "CALCULATION_MISMATCH", "复算数值、单位与公式");
  compare("facts", "FACT_MISMATCH", "输入金额、币种与会计期间");
  compare("citations", "CITATION_MISMATCH", "完整引用、年份、页码与摘录");
  compare("sources", "SOURCE_MISMATCH", "原文内容与来源指纹");
  const reviewed = validReview(r.review, expected.citations);
  add("REVIEW_INVALID", reviewed, "核对项属于本次证据且没有重复");
  report.passed = report.checks.every((c) => c.passed);
  report.recomputed_display = expected.calculations[0]?.display ?? null;
  report.reviewed_count = reviewed ? r.review.checked_citation_ids.length : 0;
  report.citation_count = expected.citations.length;
  report.request = r.request;
  // This is annotation text, never proof of a human review or executable markup.
  if (reviewed) report.notes = r.review.notes;
  return report;
}
