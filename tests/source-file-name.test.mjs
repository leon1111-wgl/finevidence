import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceFileName } from "../web/file-name.mjs";
const { cases } = JSON.parse(readFileSync(new URL("fixtures/source-file-names.json", import.meta.url), "utf8"));
for (const row of cases) test(`shared source name contract: ${row.id}`, () => {
  if (row.accepted) assert.equal(sourceFileName(row.value), row.value);
  else assert.throws(() => sourceFileName(row.value), /^Error: FILE_NAME_INVALID$/);
});
