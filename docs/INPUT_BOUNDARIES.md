# Offline input boundaries

The 2026-10-20 review at `caafb75daa3644e47229cf9f93f56b7ee2471c8d` reproduced three local-input defects. This increment fixes them within the existing offline CLI. It introduces no model, service, database or new dependency.

## Observed failures and resulting behavior

| Finding | Prior reproduction | Result after fix |
|---|---|---|
| FE-009 | Replace an absent `data/index.json` with `os.mkfifo(...)`, without a writer. Query, calculation and import all exceeded a 2-second subprocess timeout | Each returns exit 2 / INDEX_INVALID with no answer or citations; no FIFO read is attempted |
| FE-010 | A valid UTF-8 JSON file has `pages=["revenue " + chr(0xD800)]` or U+DC00, encoded by json.dumps with ASCII escapes. Import exited 1 with UnicodeEncodeError | Source validation returns INVALID_DOCUMENT / exit 2 before persistence. Invalid text in a stored index returns INDEX_INVALID. Valid non-BMP text remains verbatim |
| FE-011 | `data/synthetic/self.json` links to itself; import exited 1 with RuntimeError from Path.resolve on Python 3.12 | Source path resolution returns INVALID_PATH / exit 2, preserving the previous index |

The Unicode crash did not corrupt the old index in the observed baseline. The fix makes rejection explicit and early; it is not a claim of repairing previously demonstrated data loss. Cyclic source paths were not shown to bypass containment or expose an outside file.

## Index reading and storage capacity

The local index is limited to **1 MiB = 1,048,576 encoded UTF-8 bytes**, including formatting and its final newline. This is a deliberate small-corpus policy, not a measured production capacity. The source-file limit remains 64 KiB and ten synthetic pages per document.

`read_index` opens the index with O_NONBLOCK on POSIX, checks the opened descriptor with fstat, and accepts only a regular file. This avoids waiting for a FIFO writer and validates the actual opened object. It reads at most the limit plus one byte, distinguishing an exactly-at-limit file from an oversized file. The descriptor closes on success and failure.

- A genuinely absent index returns INDEX_MISSING to query/calculation; import may initialize it.
- A directory, FIFO, unresolved/broken index link or other unreadable index returns INDEX_INVALID. An invalid index is not equivalent to an empty corpus.
- Oversized input returns INDEX_LIMIT before JSON parsing.
- `write_index` counts UTF-8 bytes while encoding to a temporary file, using the same capacity. An over-limit batch raises INDEX_LIMIT, removes its temporary output and leaves the original index unchanged. It must not report a successful import that creates an unreadable index.

No automatic deletion or truncation is performed. For an oversized corpus, preserve the index and sources; use a smaller explicit corpus or deliberately revise the storage design and tests. Do not merely disable the read limit. This policy can reject a manually created or legacy index that exceeds the limit.

The descriptor check is not a transaction or full hostile-filesystem sandbox. Concurrent changes to regular files, concurrent imports, source-path replacement races and network filesystem stalls are not claimed solved. Valid index links to regular files still follow their target for reads. Snapshot authenticity remains FE-004, and lost concurrent updates remain FE-005.

## Text and path validation

`validate_document` checks decoded source text, consumed text metadata and stored filename by strict UTF-8 encoding. Valid source bytes alone are insufficient: a JSON escape can decode into an isolated surrogate. Rejection preserves source fidelity; characters are not dropped or replaced. A properly paired escape that decodes to a non-BMP Unicode scalar remains valid.

`safe_source_path` converts filesystem, cycle and invalid-value errors from path resolution into INVALID_PATH, while retaining the resolved-path containment check. Dangling source links return SOURCE_ERROR, outside links return INVALID_PATH, and a valid inside link remains accepted. The exception mapping is scoped to resolution, not a blanket catch around the whole application.

## Executed regression evidence

```sh
.venv/bin/python -m unittest discover -s tests -p 'test_input_boundaries.py' -v
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m finevidence import aurora_2024.json harbor_2024.json
.venv/bin/python -m finevidence query revenue --company 'Aurora Orchard' --year 2024 --top-k 1 --json
.venv/bin/python -m finevidence calculate gross-margin --company 'Aurora Orchard' --year 2024 --json
```

On macOS 14.6.1 arm64 / Python 3.12.2, the new suite initially ran 13 tests: 10 test methods had failing assertions, including all three FIFO entrypoints and both source-cycle cases; three controls already passed. One first-run test cleanup error was corrected before the final red run. That final red run had 32 failing subtests/assertions and no test errors. The first fixes passed 13/13 in 2.008s and 64 full-suite tests in 7.388s. A follow-up test then reproduced two path failures through the calculation CLI: a lone surrogate raised UnicodeEncodeError, and an embedded null raised ValueError. Resolution now maps both to INVALID_PATH. Final verification passed 14/14 boundary tests in 2.107s and 65 full-suite tests in 7.322s. Counts describe test methods and subtests separately; they are not defect counts or accuracy metrics.

The new suite also verifies directory/broken-link indexes, the exact read-capacity boundary, over-limit reads/writes, no partial batch persistence, valid non-BMP text, retained old-index bytes and temporary-file cleanup. The normal smoke returned imported=2 / skipped=0 / documents=2 / chunks=8, EVIDENCE_FOUND, and the explicitly synthetic Aurora gross margin 30.00%. Repeat import returned imported=0 / skipped=2; the filtered lamps query returned NO_MATCH.

GitHub Actions runs the same suite on macOS and Ubuntu; verify the exact commit's run before claiming CI success. POSIX FIFO/link behavior, other Python versions, Windows and a production workload are different claims. This increment does not establish real-report quality, human verification, Agent safety or UI acceptance.
