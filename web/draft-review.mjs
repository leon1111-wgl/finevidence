import { exportFactDrafts } from "./fact-draft.mjs";
// Preparation checks only. Exact user declarations do not establish semantics.
const unknown = (v) =>
  v === null || /^(unknown|待核对|待核验|未提供)$/iu.test(v.trim());
const required = [
  "company",
  "title",
  "period",
  "source_url",
  "currency",
  "unit_scale",
  "basis",
  "scope",
];
const context = ["company", "period", "metric", "currency", "basis", "scope"];
export function reviewFactDrafts(report, drafts) {
  const pack = exportFactDrafts(report, drafts);
  const rows = pack.drafts.map((d, i) => ({
    row: i + 1,
    page: d.provenance.page,
    missing_fields: required.filter((k) => unknown(d[k])),
  }));
  const buckets = new Map();
  pack.drafts.forEach((d, i) => {
    if (d.unit_scale === null || context.some((k) => unknown(d[k]))) return;
    const key = JSON.stringify(context.map((k) => d[k]));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });
  const groups = [];
  for (const indices of buckets.values()) {
    if (indices.length < 2) continue;
    const values = [
      ...new Set(indices.map((i) => pack.drafts[i].normalized_value)),
    ];
    groups.push({
      code:
        values.length > 1 ? "DECLARED_VALUE_CONFLICT" : "REPEATED_DECLARATION",
      rows: indices.map((i) => i + 1),
      normalized_values: values,
    });
  }
  const attention = new Set(
    rows.filter((r) => r.missing_fields.length).map((r) => r.row),
  );
  for (const group of groups) for (const row of group.rows) attention.add(row);
  return {
    ...pack,
    kind: "unverified_draft_review",
    checks: {
      policy: "exact_declared_context_v1",
      rows,
      groups,
      rows_needing_attention: attention.size,
      gates: [
        "SOURCE_RIGHTS_NOT_VERIFIED",
        "AUTHENTICATED_SEMANTIC_REVIEW_REQUIRED",
      ],
    },
  };
}
