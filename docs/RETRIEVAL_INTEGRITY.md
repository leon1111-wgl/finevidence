# Source consistency before retrieval

FE-004 was reproduced against `6458207d5f19e021a915e3c401a952dfec0168ac`. Editing only the index could change an excerpt from 120 to 999 million while returning the original file's SHA. Changing its company/year could hide existing evidence as NO_MATCH; reversing pages produced a wrong page citation. A well-formed snapshot and a stored hash alone did not check the relationship between these artifacts.

`workflow.retrieve` now requires an explicit `data_dir`. It calls `documents.load_verified_documents` before metadata filtering or ranking. For each indexed entry the loader resolves the source within that directory, applies the existing regular-file/size/UTF-8/document checks, then compares the entire original Document with the snapshot. Filtering, chunking and response citations use these already checked originals in memory. There is no second source read between validation and response generation.

For the current single-user small corpus, any indexed bad source fails the whole query, even when excluded by company/year. This prevents altered metadata from suppressing validation. Future multiuser retrieval must derive an authorized source range on the server first; company/year query filters are not authorization.

| Situation | Outcome |
|---|---|
| Snapshot text/metadata/page/hash differs from a readable original | SOURCE_MISMATCH |
| Original missing, a directory or a FIFO | SOURCE_ERROR |
| Original resolves outside the source directory | INVALID_PATH |
| Source is invalid UTF-8/JSON or violates document limits | Existing typed document error |
| Valid corpus, legitimate absent company/year or unmatched words | NO_MATCH, exit 0 |
| Valid empty index | NO_MATCH, exit 0 |

Errors return exit 2 with no answer, claims, calculations or citations. They do not skip bad sources, silently fall back to stale data, rewrite sources or repair the index. Valid internal source symlinks remain supported.

Run `.venv/bin/python -m unittest discover -s tests -p test_retrieval_integrity.py -v`.
Seven tests first produced 11 failing assertions/subtests against the old behavior; after the fix all seven passed in 2.680s. Cases cover both JSON/text failures, old company/year filters, altered IDs/notices/hash, false excerpts/pages, source absence/change/FIFO/directory/external links, malformed/oversized sources, unchanged index bytes and normal controls.

This closes the reproduced source/snapshot drift cases, not general cryptographic authenticity. Removing an entire index entry, coordinated changes to all trusted artifacts, concurrent source replacement races and external noncooperating writers remain outside this guarantee. Source re-reading also costs work proportional to the indexed corpus; there is no production-scale latency claim. The later FE-005 local import fix is documented in IMPORT_CONCURRENCY; it is separate from source authenticity.
