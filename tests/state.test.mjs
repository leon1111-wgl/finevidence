import test from "node:test";
import assert from "node:assert/strict";
import { readDraft, writeDraft } from "../web/state.mjs";
const request = {
  operation: "gross-margin",
  company: "Aurora Orchard",
  year: 2024,
  query: "",
};
test("draft records only scope, notes and checked evidence; stale corpus cannot restore approval", () => {
  const raw = writeDraft(
    { request, notes: "核对单位", reviewed: ["a"], selected: "a" },
    "abc",
  );
  assert.equal(readDraft(raw, "abc").notes, "核对单位");
  assert.equal(readDraft(raw, "xyz"), null);
  assert.equal(readDraft("{", "abc"), null);
  assert.equal(readDraft("x".repeat(20001), "abc"), null);
});
test("malformed fields and oversized notes rejected", () => {
  const d = JSON.parse(
    writeDraft({ request, notes: "", reviewed: [], selected: "" }, "abc"),
  );
  d.reviewed = [{}];
  assert.equal(readDraft(JSON.stringify(d), "abc"), null);
  d.reviewed = [];
  d.request.operation = "shell";
  assert.equal(readDraft(JSON.stringify(d), "abc"), null);
});
