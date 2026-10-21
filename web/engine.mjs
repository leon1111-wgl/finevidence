// Deterministic public-sample engine. Python remains the backend reference.
const fail = (code) => {
  throw new Error(code);
};
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
const encode = (x) => new TextEncoder().encode(x);
const text = (x) =>
  typeof x === "string" &&
  x.length < 16000 &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
    x,
  );
function decimal(s) {
  if (typeof s !== "string" || s.length > 64 || !/^-?\d+(\.\d+)?$/.test(s))
    fail("FACT_INVALID");
  const [a, b = ""] = s.split(".");
  return [BigInt(a + b), 10n ** BigInt(b.length)];
}
const mul = ([a, b], [c, d]) => [a * c, b * d];
const sub = ([a, b], [c, d]) => [a * d - c * b, b * d];
const div = ([a, b], [c, d]) => {
  if (c <= 0n) fail("INVALID_DENOMINATOR");
  return [a * d, b * c];
};
export function roundRatio(n, d) {
  if (d <= 0n) fail("INVALID_DENOMINATOR");
  const neg = n < 0n;
  n = (neg ? -n : n) * 100n;
  let q = n / d;
  const r = n % d;
  if (2n * r > d || (2n * r === d && q % 2n)) q++;
  return (
    (neg && q !== 0n ? "-" : "") +
    q / 100n +
    "." +
    String(q % 100n).padStart(2, "0")
  );
}
export async function validateBundle(bundle) {
  if (
    bundle?.schema_version !== 1 ||
    bundle.classification !== "SYNTHETIC" ||
    !Array.isArray(bundle.sources) ||
    bundle.sources.length < 1 ||
    bundle.sources.length > 32 ||
    !Array.isArray(bundle.facts) ||
    bundle.facts.length > 32
  )
    fail("CORPUS_INVALID");
  const docs = [],
    chunks = [],
    ids = new Set();
  for (const s of bundle.sources) {
    if (
      !text(s.raw) ||
      !/^[a-z0-9_]+\.json$/.test(s.filename) ||
      !/^[a-f0-9]{64}$/.test(s.sha256)
    )
      fail("CORPUS_INVALID");
    if ((await sha256(encode(s.raw))) !== s.sha256) fail("SOURCE_MISMATCH");
    let d;
    try {
      d = JSON.parse(s.raw);
    } catch {
      fail("CORPUS_INVALID");
    }
    if (
      !text(d.doc_id) ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(d.doc_id) ||
      ids.has(d.doc_id) ||
      !text(d.company) ||
      !d.company ||
      !Number.isInteger(d.year) ||
      d.year < 1000 ||
      d.year > 9999 ||
      d.classification !== "SYNTHETIC" ||
      d.language !== "en" ||
      !text(d.notice) ||
      !d.notice.includes("SYNTHETIC") ||
      !Array.isArray(d.pages) ||
      !d.pages.length ||
      d.pages.length > 10 ||
      !d.pages.every(text)
    )
      fail("CORPUS_INVALID");
    ids.add(d.doc_id);
    d = { ...d, filename: s.filename, sha256: s.sha256 };
    docs.push(d);
    d.pages.forEach((p, i) =>
      p
        .split(/\r?\n[ \t]*\r?\n/)
        .filter((x) => x.trim())
        .forEach((excerpt, j) =>
          chunks.push({
            citation_id: `${d.doc_id}:p${i + 1}:c${j + 1}`,
            chunk_id: `${d.doc_id}:p${i + 1}:c${j + 1}`,
            doc_id: d.doc_id,
            source_file: d.filename,
            source_sha256: d.sha256,
            company: d.company,
            year: d.year,
            page: i + 1,
            page_kind: "synthetic",
            classification: "SYNTHETIC",
            excerpt,
          }),
        ),
    );
  }
  const factIds = new Set(),
    slots = new Set();
  for (const f of bundle.facts) {
    if (
      !f ||
      Object.values(f).some((v) => typeof v === "string" && !text(v)) ||
      !text(f.fact_id) ||
      factIds.has(f.fact_id) ||
      f.verification_status !== "synthetic_fixture" ||
      f.verified_by !== null ||
      !["revenue", "gross_profit"].includes(f.metric) ||
      f.report_type !== "annual"
    )
      fail("FACT_INVALID");
    decimal(f.raw_value);
    const scale = decimal(f.unit_scale);
    if (scale[0] <= 0n) fail("FACT_INVALID");
    const d = docs.find((d) => d.doc_id === f.doc_id),
      c = chunks.find(
        (c) =>
          c.doc_id === f.doc_id &&
          c.page === f.page &&
          c.excerpt === f.source_excerpt,
      );
    if (
      !d ||
      !c ||
      d.company !== f.company ||
      d.filename !== f.source_file ||
      d.sha256 !== f.source_sha256 ||
      f.period_start !== `${d.year}-01-01` ||
      f.period_end !== `${d.year}-12-31`
    )
      fail("SOURCE_MISMATCH");
    const slot = JSON.stringify([f.company, f.period_start, f.metric]);
    if (slots.has(slot)) fail("FACT_INVALID");
    slots.add(slot);
    factIds.add(f.fact_id);
    for (const k of ["currency", "accounting_basis", "consolidation_scope"])
      if (!text(f[k]) || !f[k]) fail("FACT_INVALID");
  }
  return { docs, chunks, facts: structuredClone(bundle.facts) };
}
const tokens = (s) => s.toLowerCase().match(/[a-z0-9]+/g) || [];
function search(chunks, query) {
  if (
    !text(query) ||
    !query.trim() ||
    query.length > 500 ||
    /[^\x00-\x7F]/.test(query.replace(/[^\p{L}]/gu, ""))
  )
    fail("INVALID_QUERY");
  const terms = [...new Set(tokens(query))].sort();
  if (!terms.length) fail("INVALID_QUERY");
  if (!chunks.length) return [];
  const docs = chunks.map((c) => tokens(c.excerpt)),
    avg = docs.reduce((s, d) => s + d.length, 0) / docs.length;
  const result = chunks.map((c, i) => {
    let score = 0;
    for (const t of terms) {
      const tf = docs[i].filter((x) => x === t).length;
      if (!tf) continue;
      const df = docs.filter((d) => d.includes(t)).length;
      score +=
        (Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)) * tf * 2.2) /
        (tf + 1.2 * (0.25 + (0.75 * docs[i].length) / avg));
    }
    return { ...c, score };
  });
  return result
    .filter((c) => c.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.citation_id < b.citation_id
          ? -1
          : a.citation_id > b.citation_id
            ? 1
            : 0),
    )
    .slice(0, 5);
}
export function run(corpus, operation, company, year, query = "") {
  if (!corpus.docs.some((d) => d.company === company)) fail("INVALID_COMPANY");
  if (
    !Number.isInteger(year) ||
    !corpus.docs.some((d) => d.company === company && d.year === year)
  )
    fail("INVALID_YEAR");
  const r = {
    schema_version: "1.0",
    trace_id: crypto.randomUUID(),
    mode: "browser_synthetic",
    status: "CALCULATED",
    resolved_operation: operation,
    filters: { company, year },
    query,
    answer: null,
    claims: [],
    calculations: [],
    facts: [],
    citations: [],
    limitations: [
      "SYNTHETIC fixtures; not real financial reports or verified facts.",
      "Browser deterministic workflow; no model call.",
      "Hash consistency is not semantic verification.",
    ],
  };
  if (operation === "search") {
    r.citations = search(
      corpus.chunks.filter((c) => c.company === company && c.year === year),
      query,
    );
    r.status = r.citations.length ? "EVIDENCE_FOUND" : "NO_MATCH";
    return r;
  }
  if (
    ![
      "gross-margin",
      "revenue-growth",
      "gross-margin-change",
      "facts",
    ].includes(operation)
  )
    fail("INVALID_OPERATION");
  const years = ["revenue-growth", "gross-margin-change"].includes(operation)
    ? [year, year - 1]
    : [year];
  const metrics =
    operation === "revenue-growth" ? ["revenue"] : ["revenue", "gross_profit"];
  const picked = years.flatMap((y) =>
    metrics.map((metric) => {
      const f = corpus.facts.find(
        (f) =>
          f.company === company &&
          f.period_start === `${y}-01-01` &&
          f.metric === metric,
      );
      if (!f) fail("FACTS_NOT_FOUND");
      return f;
    }),
  );
  for (const k of [
    "company",
    "currency",
    "accounting_basis",
    "consolidation_scope",
    "report_type",
  ])
    if (picked.some((f) => f[k] !== picked[0][k])) fail("INCOMPARABLE_FACTS");
  r.facts = picked.map((f) => ({ ...f, classification: "SYNTHETIC" }));
  r.citations = [
    ...new Map(
      picked.map((f) => {
        const c = corpus.chunks.find(
          (c) =>
            f.doc_id === c.doc_id &&
            f.page === c.page &&
            f.source_excerpt === c.excerpt,
        );
        return [c.citation_id, c];
      }),
    ).values(),
  ];
  const value = (y, m) => {
    const f = picked.find(
      (f) => f.period_start === `${y}-01-01` && f.metric === m,
    );
    return mul(decimal(f.raw_value), decimal(f.unit_scale));
  };
  const margin = (y) => div(value(y, "gross_profit"), value(y, "revenue"));
  if (operation === "facts") {
    r.status = "FACTS_FOUND";
    return r;
  }
  let ratio,
    formula,
    unit = "%";
  if (operation === "gross-margin") {
    ratio = margin(year);
    formula = "gross_profit / revenue × 100";
  } else if (operation === "revenue-growth") {
    const current = value(year, "revenue");
    if (current[0] < 0n) fail("INVALID_REVENUE");
    ratio = div(
      sub(current, value(year - 1, "revenue")),
      value(year - 1, "revenue"),
    );
    formula = "(current revenue − prior revenue) / prior revenue × 100";
  } else {
    ratio = sub(margin(year), margin(year - 1));
    formula =
      "(current gross_profit / revenue − prior gross_profit / revenue) × 100";
    unit = " pp";
  }
  const display = roundRatio(ratio[0] * 100n, ratio[1]) + unit;
  r.calculations = [
    {
      display,
      formula,
      metric: operation,
      citation_ids: r.citations.map((c) => c.citation_id),
      precision: "exact rational; half-even to two decimals",
    },
  ];
  r.answer = `SYNTHETIC: ${company} ${year} ${operation} = ${display}`;
  return r;
}
