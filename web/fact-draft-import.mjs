import { createFactDraft, exportFactDrafts } from "./fact-draft.mjs";
import { sourceFileName } from "./file-name.mjs";
export const MAX_DRAFT_IMPORT_BYTES = 1024 * 1024;
const fail = (code) => {
  throw Error(code);
};
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
// Validate the JSON grammar first, then inspect structural tokens. Keys are
// decoded before comparison so escaped aliases cannot conceal duplicates.
function parse(raw) {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_DRAFT_IMPORT_BYTES
  )
    fail("IMPORT_LIMIT");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("IMPORT_JSON");
  }
  const stack = [];
  for (const match of raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]]/g)) {
    const token = match[0];
    if (token === "{" || token === "[") {
      stack.push(token === "{" ? new Set() : null);
      if (stack.length > 12) fail("IMPORT_LIMIT");
    } else if (token === "}" || token === "]") stack.pop();
    else if (/^\s*:/.test(raw.slice(match.index + token.length))) {
      const key = JSON.parse(token),
        keys = stack.at(-1);
      if (keys.has(key)) fail("IMPORT_JSON");
      keys.add(key);
    }
  }
  const pending = [value];
  let nodes = 0;
  while (pending.length) {
    const v = pending.pop();
    if (++nodes > 5000 || (typeof v === "number" && !Number.isFinite(v)))
      fail("IMPORT_LIMIT");
    if (v && typeof v === "object")
      for (const child of Object.values(v)) {
        if (pending.length + nodes >= 5000) fail("IMPORT_LIMIT");
        pending.push(child);
      }
  }
  return value;
}
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (object(v))
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
function rebuild(report, drafts) {
  if (!Array.isArray(drafts) || drafts.length < 1 || drafts.length > 20)
    fail("IMPORT_CHANGED");
  return exportFactDrafts(
    report,
    drafts.map((d) =>
      createFactDraft(report, {
        ...d,
        page: d?.provenance?.page,
        excerpt: d?.provenance?.excerpt,
        source_url: d?.source_url ?? "",
        scale: d?.unit_scale ?? "unknown",
        currency: d?.currency ?? "unknown",
      }),
    ),
  );
}
export function importFactDrafts(raw, report) {
  const received = parse(raw);
  if (
    !object(received) ||
    received.schema_version !== 1 ||
    received.kind !== "unverified_fact_drafts"
  )
    fail("IMPORT_SCHEMA");
  if (
    !object(report?.file) ||
    !Array.isArray(report?.pages) ||
    !object(received.file) ||
    received.file.sha256 !== report.file.sha256 ||
    received.file.bytes !== report.file.bytes ||
    received.classification !== report.classification
  )
    fail("IMPORT_SOURCE");
  const name = received.file.name;
  try {
    sourceFileName(name);
    // Validate every received field against a reconstruction, including fields
    // that must never grant approval. Ignore only object-key order, not arrays.
    const original = { ...report, file: { ...report.file, name } };
    const checked = rebuild(original, received.drafts);
    if (canonical(received) !== canonical(checked)) fail("IMPORT_CHANGED");
    // The byte digest, not a filename, is the source identity. Rebind a renamed
    // local file only AFTER validating original row/envelope name consistency.
    return rebuild(report, checked.drafts);
  } catch {
    fail("IMPORT_CHANGED");
  }
}
