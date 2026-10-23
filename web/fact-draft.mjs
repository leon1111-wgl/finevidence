// Local, untrusted annotations. This module never admits facts to calculations.
const scales = ["1", "1000", "10000", "1000000", "100000000", "unknown"];
const fail = (code) => {
  throw new Error(code);
};
function field(value, max, optional = false, multiline = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!optional && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value) ||
    (!multiline && /[\n\r\t]/u.test(value)) ||
    /[\ud800-\udfff]/u.test(value)
  )
    fail("DRAFT_FIELD");
  return value.trim();
}
export function decimalToken(raw, scale) {
  field(raw, 64);
  if (
    !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw) &&
    !/^\((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?\)$/.test(raw)
  )
    fail("DRAFT_NUMBER");
  const negative = raw.startsWith("-") || raw.startsWith("(");
  const [whole, fraction = ""] = raw.replace(/[(),-]/g, "").split(".");
  if (whole.length > 40 || fraction.length > 18) fail("DRAFT_NUMBER");
  if (scale === "unknown") return null;
  if (!/^10{0,8}$/.test(scale)) fail("DRAFT_UNIT");
  // Decimal point shifting on bounded strings; no IEEE-754 conversion.
  const shift = scale.length - 1;
  let digits = (
    whole +
    fraction +
    "0".repeat(Math.max(0, shift - fraction.length))
  ).replace(/^0+(?=\d)/, "");
  const places = Math.max(0, fraction.length - shift);
  digits = digits.padStart(places + 1, "0");
  let result = places
    ? digits.slice(0, -places) + "." + digits.slice(-places)
    : digits;
  result = result.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return negative && result !== "0" ? "-" + result : result;
}
function containsToken(pageText, excerptStart, excerpt, raw) {
  for (
    let start = excerpt.indexOf(raw);
    start >= 0;
    start = excerpt.indexOf(raw, start + 1)
  ) {
    // Search only this excerpt; inspect boundaries at its original page position.
    // Clipping or trimming must not erase a sign, digit, decimal or percent suffix.
    const absoluteStart = excerptStart + start;
    // Normalize boundary context only, never the source, amount or its offsets.
    // Compatibility forms include fullwidth/small signs and punctuation. Cf
    // characters cannot hide an adjacent numeric marker from this refusal check.
    const boundary = (s) => s.normalize("NFKC").replace(/\p{Cf}/gu, "");
    const before = boundary(pageText.slice(0, absoluteStart)),
      after = boundary(pageText.slice(absoluteStart + raw.length));
    if (
      !/[\p{N}A-Za-z.,()+\-\u2010-\u2015−٫٬]$/u.test(before) &&
      !/^[\p{N}A-Za-z.,()%٪‰‱؉؊٫٬]/u.test(after) &&
      !/[+\-\u2010-\u2015−(]\s*$/u.test(before) &&
      !/^\s*[)%٪‰‱؉؊]/u.test(after)
    )
      return true;
  }
  return false;
}
export function createFactDraft(report, input) {
  if (
    !report ||
    !["USER_SUPPLIED_UNVERIFIED", "SYNTHETIC_DEMO_UNVERIFIED"].includes(
      report.classification,
    ) ||
    !/^[a-f0-9]{64}$/.test(report.file?.sha256)
  )
    fail("DRAFT_SOURCE");
  const page = report.pages.find(
    (p) => p.page === input.page && p.page_kind === "pdf_physical",
  );
  if (!Number.isInteger(input.page) || !page?.text) fail("DRAFT_PAGE");
  const excerpt = field(input.excerpt, 4000, false, true);
  const start = page.text.indexOf(excerpt);
  if (start < 0) fail("DRAFT_EXCERPT");
  const raw = field(input.raw_value, 64);
  if (!scales.includes(input.scale)) fail("DRAFT_UNIT");
  const normalized = decimalToken(raw, input.scale);
  if (!containsToken(page.text, start, excerpt, raw)) fail("DRAFT_TOKEN");
  if (!["revenue", "gross_profit"].includes(input.metric)) fail("DRAFT_METRIC");
  if (!["CNY", "HKD", "USD", "EUR", "JPY", "unknown"].includes(input.currency))
    fail("DRAFT_CURRENCY");
  const url = field(input.source_url, 1000, true);
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      fail("DRAFT_URL");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      fail("DRAFT_URL");
  }
  return {
    classification: report.classification,
    review_status: "pending_human_review",
    verified_by: null,
    financial_calculation_eligible: false,
    company: field(input.company, 200),
    title: field(input.title, 200),
    source_url: url || null,
    metric: input.metric,
    raw_value: raw,
    normalized_value: normalized,
    unit_scale: input.scale === "unknown" ? null : input.scale,
    currency: input.currency === "unknown" ? null : input.currency,
    period: field(input.period, 120),
    basis: field(input.basis, 120),
    scope: field(input.scope, 120),
    provenance: {
      file_name: report.file.name,
      file_sha256: report.file.sha256,
      page: page.page,
      page_kind: "pdf_physical",
      excerpt,
      excerpt_start: start,
      excerpt_end: start + excerpt.length,
      offset_unit: "utf16_code_unit",
      parser: { ...report.parser },
    },
  };
}
export function exportFactDrafts(report, drafts) {
  if (!Array.isArray(drafts) || drafts.length < 1 || drafts.length > 20)
    fail("DRAFT_COUNT");
  const seen = new Set();
  const checked = drafts.map((d) => {
    const fresh = createFactDraft(report, {
      ...d,
      page: d.provenance.page,
      excerpt: d.provenance.excerpt,
      source_url: d.source_url ?? "",
      scale: d.unit_scale ?? "unknown",
      currency: d.currency ?? "unknown",
    });
    const serialized = JSON.stringify(fresh);
    if (serialized !== JSON.stringify(d)) fail("DRAFT_CHANGED");
    if (seen.has(serialized)) fail("DRAFT_DUPLICATE");
    seen.add(serialized);
    return fresh;
  });
  return {
    schema_version: 1,
    kind: "unverified_fact_drafts",
    classification: report.classification,
    source_metadata_status: "user_supplied_unverified",
    licensing_status: "not_verified",
    financial_calculation_eligible: false,
    file: { ...report.file },
    drafts: checked,
    limitations: [
      "Exact text membership is not semantic or visual verification.",
      "Company, period, currency, scale, basis, scope and URL are user assertions.",
      "No authenticated approval, source-rights verification or calculation admission.",
      "Unsigned local handoff; no authenticity or tamper-proof claim.",
    ],
  };
}
