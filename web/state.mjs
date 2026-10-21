const validRequest = (r) =>
  r &&
  typeof r.company === "string" &&
  r.company.length < 120 &&
  Number.isInteger(r.year) &&
  typeof r.query === "string" &&
  r.query.length <= 1000 &&
  [
    "search",
    "gross-margin",
    "revenue-growth",
    "gross-margin-change",
    "facts",
  ].includes(r.operation);
export function writeDraft(d, corpus) {
  return JSON.stringify({
    version: 1,
    corpus,
    request: d.request,
    notes: d.notes,
    reviewed: d.reviewed,
    selected: d.selected,
  });
}
export function readDraft(raw, corpus) {
  try {
    if (typeof raw !== "string" || raw.length > 20000) return null;
    const d = JSON.parse(raw);
    if (
      d.version !== 1 ||
      d.corpus !== corpus ||
      !validRequest(d.request) ||
      typeof d.notes !== "string" ||
      d.notes.length > 3000 ||
      !Array.isArray(d.reviewed) ||
      d.reviewed.length > 32 ||
      !d.reviewed.every((x) => typeof x === "string" && x.length < 200) ||
      typeof d.selected !== "string" ||
      d.selected.length > 200
    )
      return null;
    return d;
  } catch {
    return null;
  }
}
