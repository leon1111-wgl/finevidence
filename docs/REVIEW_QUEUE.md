# Review queue

Baseline review: 2026-10-19, before first public repository commit. These are observed limitations / roadmap gaps unless explicitly labeled reproduced defects.

| ID | Priority | Kind | Evidence / impact | Next acceptance check |
|---|---|---|---|---|
| FE-001 | P1 | Financial capability gap | Partial E1: synthetic gross margin, annual revenue growth and margin percentage-point change implemented; read-only SQLite is now implemented; actual human fact review remains absent | Keep open for the real review boundary; verify snapshot lifecycle and source checks |
| FE-002 | P1 | Real-evidence gap, preflight implemented | Four synthetic financial sources; local unverified PDF physical-page extraction exists, but real-report quality and fact review are unmeasured | Approved source intake and actual human fact review remain open |
| FE-003 | P1 | Agent capability gap, partially implemented | Bounded local model loop and two actual MornAI browser tasks executed on synthetic data | Continue independent holdout and failure evaluation; protocol fixtures remain separate from live results |
| FE-004 | P2 | Reproduced drift fixed | At 6458207 altered text/company/year/pages/hash or unavailable originals could yield false evidence or false NO_MATCH | Query now validates all indexed originals before filters and uses checked objects. Seven new regressions plus the prior 32-case script were run; see RETRIEVAL_INTEGRITY. Cryptographic authenticity and coordinated edits remain unsupported |
| FE-005 | P2 | Reproduced cooperating-writer lost update fixed | Reproduced at 19e4627: both imports reported success; final index retained only Aurora | Stable local POSIX lock spans read/validate/merge/replace; contention is INDEX_BUSY, explicit retry retains both. Fourteen concurrency/failure tests pass; distributed/noncooperating writers and power loss remain outside scope |
| FE-006 | P2 | Retrieval limitation | Lexical overlap can return a different year/company unless explicit filters are applied | E0 filter tests; later evidence-support labeling, not score-as-confidence |
| FE-007 | P2 | Publication/operations gap | Baseline had no remote CI, container smoke or rollback evidence | E0 CI and clean clone; later measured container/operations validation |
| FE-008 | P2 | Product gap, partially implemented | Static and Python sample workbench supports source review, calculations, notes, export/replay; actual browser checks executed | Keep organization authorization and real-report workflow open; independently review public deployment |
| FE-009 | P2 | Fixed input defect | At caafb75, FIFO index blocked query/calculation/import; input read was unbounded | Now reject nonregular descriptors, read at most 1 MiB + 1 byte, enforce the same write cap. FIFO, directory, broken links, exact cap, over-cap read and batch-write tests pass |
| FE-010 | P2 | Fixed observed document, fact and query text defects | Document/fact fixes held, but af20584 accepted invalid query/company text and could emit non-UTF-8 JSON or exit 1 | Shared retrieval and direct search now reject invalid text; seven new tests cover real argv bytes, direct calls, both output modes and valid Unicode. All 112 tests pass; original ten query-review failures return typed errors. Source filenames retain INVALID_PATH |
| FE-011 | P2 | Fixed input defect | At caafb75, a source symlink cycle raised uncaught RuntimeError | Resolve errors become INVALID_PATH; self/two-node cycles, dangling/external links and valid internal link controls pass |
| FE-012 | P3 | Fixed response-contract defect | At f1b3c1c, build-facts failures used synthetic_calculation despite the correct refusal status | Dedicated build envelope for success and both error handlers; five added tests, six pre-fix failing assertions/subtests, original mode reproduction now passes; no change to snapshot protection |
| FE-014 | P2 | Fixed, independently verified observed scope | At 3df0b55, editing inputs left the old failure callback active | Independent review of 6d8efe3 passed seven retry cases on public and Python workbenches; draft restoration is separately tracked as FE-015 |
| FE-015 | P2 | Reproduced draft loss fixed locally | At 6d8efe3, Retry after failed draft replay dropped restore and overwrote notes/checked IDs | Keep restoration context across explicit retries; six browser/Python cases 3/6 to 6/6, original review script 2/3 to 3/3; editing still revokes. Await independent closure; see DRAFT_RECOVERY |

Do not mark FE-001/002/003 closed merely because an interface or stub exists. Each closure needs a commit and executed acceptance evidence.

## 2026-10-20 implementation review

The E1 increment's working tree reproduced three boundary defects before publication: UTF-16 manifests accepted despite the UTF-8 contract, deep JSON producing RecursionError, and facts relabelled as 2025 against a 2024 source. `test_manifest_encoding_and_nesting_are_bounded` and `test_report_year_cannot_be_relabelled_in_fact_manifest` initially failed and now pass. These are fixed pre-release defects, not claims that the prior baseline already had a finance module. Source trust limitations are documented separately and remain open where applicable.

A fourth pre-release defect was reproduced in the existing context-isolation test: changing Decimal DefaultContext traps could make 1/3 raise Inexact. Explicit context traps now isolate the function from both active and default context settings. All 51 tests pass locally after this fix.

Follow-up to 0dedb2b: the fact constructor recursively copied unvalidated field values. A 600-level list caused RecursionError. Direct field type checks now precede serialization; the added regression passes with INVALID_FACT. Final suite: 51 tests, including 24 financial tests.

## Input-boundary fix verification, 2026-10-20

The independent review of `caafb75daa3644e47229cf9f93f56b7ee2471c8d` reproduced FE-009/010/011. This increment adds `tests/test_input_boundaries.py`: initially 13 tests, 10 methods failing against the old implementation (32 failing subtests/assertions after test-fixture cleanup was corrected), three controls already passing. A follow-up test reproduced two more invalid source-path failures (lone surrogate and embedded null in the fact manifest); both now return INVALID_PATH. Final result: 14 boundary tests and 65 full-suite tests pass locally. See [INPUT_BOUNDARIES](INPUT_BOUNDARIES.md) for reproduction, error contracts and the 1 MiB capacity decision. Inspect CI for the exact release commit before claiming remote verification.

At that release FE-004 remained open: editing only the snapshot from 120 to 999 million preserved the displayed source hash and produced EVIDENCE_FOUND during review; calculation correctly returned SOURCE_MISMATCH. A file-size/type check does not authenticate the snapshot. FE-005 remains open despite atomic replacement. These are local-tool limitations, not claims about an exposed production service.

## FE-010 fact-field follow-up, 2026-10-20

Independent review at `bebb86597578c90d60ecdc8bd73283b010aca256` appended U+D800/U+DC00 to both selected facts' accounting_basis or consolidation_scope. All four cases exited 1 with UnicodeEncodeError at finance.gross_margin's calculation-ID encoding. The prior document fix remained valid; this was a different input path and was merged into FE-010.

Five added test methods first produced 20 failing subtests across three methods (14 constructor checks, four CLI crashes, two invalid-verifier status checks); two controls already passed. The fact constructor now checks every accepted string by strict UTF-8 encoding after type/length validation. Optional verifier null remains valid; a valid non-null identity still cannot enable synthetic calculations. No bad value is echoed in the error. Source filenames keep the prior INVALID_PATH contract. Targeted 29 and full 70 tests pass locally; see INPUT_BOUNDARIES for limits and commands. No production arithmetic, source data, retrieval behavior, model or UI changed. At that release FE-004/005 stayed open; current disposition is in the table above.

## Retrieval integrity and annual growth, 2026-10-20

The 6458207 review extended FE-004 to old-company/year false NO_MATCH and wrong page citations. Seven regression methods first produced 11 failing subtests/assertions; the fix passes all seven (2.680s). The original 32-case review script was rerun without changes: no timeout, index bytes preserved, expected source/index/text errors and normal controls. This closes the observed retrieval drift, not whole-corpus completeness or cryptographic authenticity.

Revenue growth adds fourteen tests with literal +20%, -20%, 0% and -100% oracles, explicit units and adjacent-calendar-year policy, zero/negative-prior refusal, comparable metadata and two-source CLI lineage. All 91 tests pass locally (12.540s). FE-001 remains partial, FE-005 remains open, and FE-008/E7 remain unimplemented. See FINANCIAL_CALCULATIONS for the two fixture-conflict failures corrected without weakening their target assertions.

## Import contention and interruption, 2026-10-20

FE-005 was reproduced at 19e4627 with a controlled first-reader pause and a second real CLI. Both reported imported=1/documents=1; the final index held only syn_aurora_2024. The new lock covers the complete operation, uses a stable separate inode, and never deletes or truncates that lock file. In the same scenario the contender now exits 2/INDEX_BUSY, first import commits one document, and an explicit retry commits the second. Duplicate retry skips, conflicting retry refuses.

Fourteen added tests cover actual subprocesses at read/before-replace/after-replace boundaries, reader continuity, independent index/parent aliases, kill/retry, staged orphan files, same-process exception release, malformed lock objects, unavailable backend and lock syscall failures. Initial corrected red run: 13 methods with 14 failed assertions/subtests and four missing-backend attribute errors. Final targeted 14 pass in 2.103s; full 105 pass in 14.951s. Prior 91 tests are unchanged. Scope and residual risks are in IMPORT_CONCURRENCY; this closure does not establish distributed locking, power-loss durability or general workflow recovery.

## Query text follow-up after af20584, 2026-10-20

The independent review passed 105 tests and rechecked the FE-004/005 fixes, but found another FE-010 entry point. Invalid UTF-8 POSIX argv bytes became a lone surrogate in the question/company filter. Default stdout could emit invalid UTF-8 despite exit 0; strict stdout and direct cli.main surrogate inputs exited 1. Document and fact validators did not protect query parameters.

Seven new test methods first produced 27 failing assertions/subtests across six methods; the valid non-BMP control passed. The minimal fix validates query type/text in shared retrieval and direct search, and company text before index reads. The targeted seven pass in 1.080s; all 112 pass in 16.249s. The original 30-scenario review script was rerun unchanged: all ten malformed-query cases now return exit 2 with valid UTF-8 JSON, no traceback/answer/citations, and unchanged index bytes. Known source, financial and concurrent-import behavior remains covered. This closes the observed query input omission, not all possible caller or output-environment failures.

## Margin percentage-point increment, 2026-10-21

FE-001 remains partial. Fifteen new tests first produced 59 failed assertions/subtests because the function and CLI operation were absent; they pass in 1.493s after implementation. The prior 112 tests are unchanged; all 127 pass locally in 15.773s. Coverage includes four-operand scales/identities/review status, within/across-year comparability, calendar alignment, zero/negative revenues, negative profits, early rounding, near cancellation, context isolation and actual CLI source drift/refusal/lineage. A separate seeded Fraction/integer-rounding oracle matched 1,014 synthetic cases. This does not add SQLite, human review, model inference or UI acceptance.

## SQLite snapshot increment, 2026-10-21

The latest independent review of b8822d7 reported no new defects. This implementation adds explicit snapshot build and read-only parameterized lookup to all three financial workflows, keeping manifest mode as the reference. Twenty-three additional tests bring the full suite to 150. Read-only connection enforcement, schema/file rejection, source checks after build, failed publication/cleanup, real competing builds, busy reads and six-result backend parity were executed.

Before release, extra regressions found an unclosed connection on an injected insert failure, a LIKE underscore wildcard that hid an unsupported user table, and the database version overwriting the response version. These were fixed; prior tests were not weakened. See FACT_STORE for complete scope and observed integration failures. FE-001 remains open for actual review; FE-002/003/008 and E7 are unchanged.

## FE-012 response identity, 2026-10-21

Review of f1b3c1c reproduced FACT_STORE_EXISTS with mode=synthetic_calculation after a repeated build. This P3 issue misclassified the operation; the refusal and old snapshot were already correct. cli.main now selects store_build_envelope once for the command and uses it for successful output and both runtime exception branches. Build errors keep an empty financial result and exit 2.

The original independent scripts and their mode assertion were rerun without changes. Five new methods cover document/finance failures, publication OSError cleanup/retry and calculation controls; all 155 tests pass locally. The initial new test mistakenly expected CALCULATION_COMPLETE; the existing API is CALCULATED, and that test error was corrected before the production fix. No original assertions were weakened. This closes the observed response defect only; real fact review, reports, models and E7 remain open.

## Workbench pre-release findings

A real model run first calculated revenue growth and then searched; the later result discarded the numeric output. test_later_search_preserves_completed_calculation failed with an empty calculations list. The loop now keeps calculation results and all tool observations. A static browser run found prior/current citation order differed from Python; a parity assertion failed and the browser now orders citations by selected facts. Original tests were not weakened. Neither issue is attributed to the older CLI-only commit.

## FE-013 — P2: live missing-prior request has the wrong refusal outcome

Observed on 9cc3b6c, first frozen development evaluation. Reproduce with the missing-prior case via scripts/evaluate.py --live; the full run is bounded and requires configured credentials. Expected FACTS_NOT_FOUND or AGENT_NO_RESULT with no answer; observed AGENT_TOOL_REJECTED, one model call, 295 reported tokens, empty output. Six arithmetic cases and all citations passed. No arbitrary tool was executed and no financial number escaped. This is a reproduced business-completion gap, not evidence of a permission bypass.

Location: agent._decision / run_agent. Raw invalid content was intentionally not retained, so the exact rejected field is unknown. Next add a non-content schema-failure category and reproduce before changing model guidance. Retain strict allowlists and scope. Acceptance: missing-prior returns the intended refusal; malformed/extra arguments stay rejected; failed runs retain usage, and the next evaluation keeps this original 7/8 result rather than overwriting it. Interview question: why is a safely blocked request still a failed business task?

### FE-013 diagnostic prerequisite, 2026-10-22

Implemented fixed non-content categories INVALID_JSON, DECISION_SCHEMA, UNKNOWN_TOOL, ARGUMENT_KEYS and ARGUMENT_VALUE with call ordinals. Raw rejected content remains absent. Twelve offline protocol and twelve real loopback HTTP scenarios now expose the expected category without echoing a private canary; 349 decisions preserve acceptance/status versus c718947. Five added test methods first produced 26 failing assertions, then passed. Full local suite 181 passes. This completes the diagnostic prerequisite only: no new live call, no inferred original rejected field, no change to the 7/8 benchmark and no FE-013 closure. Next authorized observation can distinguish schema failure before proposing a behavioral fix.

## FE-014 — input changes revoke stale retries

The independent review reproduced the same stale callback in the public and Python workbenches. New browser tests first failed five of seven scenarios on both unmodified surfaces; unchanged-refusal and network-retry controls already passed. clearResult now clears retryAction and hides the button along with the stale financial result. No automatic request is added. Local seven-scenario verification passes. See RETRY_STATE for the protocol and release evidence; FE-013 and its original 7/8 result remain open.

## FE-015 — restore metadata across a failed replay and retry

Independent review on 6d8efe3 observed correct 20.00% but empty notes, 0/2
checked sources and overwritten storage/export after one failed local HTTP
replay followed by Retry. Normal reload and fault-then-reload controls retained
the review. Location: app.mjs execute's failure callback omitted the restore
option; the subsequent successful save persisted empty review metadata.

The callback now retains restore with the same request. Six browser cases
first failed three expected note-preservation assertions, then all passed;
the original independent script also passes all three cases unchanged. Failed
attempts preserve saved bytes, repeated retries retain metadata, invalid IDs
are filtered, scope edits revoke restoration, and no model operation occurs.
This does not establish server persistence or authenticated review. Verify
release and independently rerun before closing. Interview question: which
state besides a correct financial value must survive recovery?

## 2026-10-22 user-requested handoff implementation

- FE-015: independent review of 3adb203 closed the observed restoration-loss scope (original audit 3/3, six-scenario suite 6/6); broader state/recovery gaps remain.
- FE-016 / P3: review of 3adb203 reproduced non-ASCII CSRF values causing a dropped connection. `Handler.do_POST` now rejects them before string compare; local regression and unchanged original audit pass (9/11 to 11/11). Implemented, pending independent review; not an observed auth bypass.
- New handoff capability: review local-only file handling, exact data/version boundary, unsigned notes, mismatches and non-destructive import using HANDOFF_REPLAY and browser-replay.cjs. No new defect is claimed just to populate the queue.
- FE-013 remains open, with 7/8 original live-model result preserved; no paid rerun.


## FE-017 — P3 usability suggestion: show the currently checked file

Independent review at 9c469be found that file input resets for reselection, but no persistent filename/digest identified the current report. Downloaded hashes were already correct; this was not a numeric defect or signature bypass. `handoff.mjs::bindHandoff` now displays the current attempt's safe-text name, a short digest and expandable full hash; reports include the same name. Old hashes/reports clear before async reads. Failed reads and export feedback cannot masquerade as the previous import's success. Same-file reselection and cancel behavior remain.

The corrected unchanged 20-scenario browser suite fails 20 checks against 9c469be and passes 20 locally in each runtime. Six identify files/bytes; fourteen cover failure/loading/retry/text/keyboard/state boundaries. Initial invalid timestamp fixtures were corrected to the existing protocol, not accepted by weakening it. See HANDOFF_REPLAY. Implementation complete locally, release/independent closure separate. Interview question: why can a correct hash in a downloaded report still leave a handoff object ambiguous in the UI?

FE-016 is independently closed in the observed scope on 9c469be: original 11 HTTP cases and four real loopback business-entry probes pass; malformed CSRF values perform zero business calls. No authentication/production-security guarantee is implied. FE-013 remains open; no live-model rerun.

## PDF preflight release scope, 2026-10-23

FE-017 independently closed at83d1989 in observed scope (original identity checks and20 independent browser checks); no authentication claim. E2/FE-002 remains partial after local PDF preflight. Review page numbering, unknown/textless outcomes, byte/page/text caps, deadline and cancellation termination, module-failure retry, data-request isolation and report invalidation. Prerelease fault test2/3→3/3 fixed cached module-fetch failure. Do not count an empty extracted page as scanned-file detection or human-approved facts. FE-013 remains open.


## FE-018 — P2 stalled PDF component prevents effective manual retry

Observed commit:82ab62c4704ea35f925ad2f958026f801fb410b6. Independent review held the first vendor/pdf.min.mjs request, waited for PDF_TIMEOUT, restored connectivity for new requests and selected the file again. Both public/Python retries still timed out (0/2); a fresh-URL import control succeeded, and ending the original request allowed a later retry. Impact: users could not recover without waiting for the hung request or reloading.

Minimal fix in web/pdf-intake.mjs::loadLibrary/inspectPdf: cache active validated successes only, own pending imports per explicit attempt, and never let abandoned settlement write cache/start Worker. pdf-panel.mjs distinguishes component deadline from parse deadline without changing the 12-second total budget. New real-browser regression8 cases first fails0/8 on the observed commit, then passes8/8 per static/Python surface locally; old PDF34/fault4 and broader workflow checks remain release gates. No pending-import network-cancellation claim. Implemented, pending exact release verification and independent closure; see PDF_INTAKE.

Interview question: why does Promise.race stopping a caller not cancel or invalidate the promise it was waiting for? How can an old rejection break a newer successful cache?


## FE-018 independent closure and FE-019 reporting correction, 2026-10-23

Independent review of8ee1830 closed the observed FE-018 recovery scope: original held-request contract2/2, existing loading8/8 per public/Python surface and four additional lifecycle cases4/4 per surface. Native import cancellation/memory and real financial quality remain outside that closure.

FE-019 / P3 was reproduced at8ee1830 in tests/browser-pdf-faults.cjs: navigation/readiness occurred outside the case catch, so first/second startup failure exited1 without final JSON and lost structured prior results. The runner now persists a fixed plan and checkpoints, captures initialization separately, retains prior passes/not-run rows and exits nonzero. Two actual-child-suite regressions changed0/2 to2/2 with bounded diagnostics and a content-leak canary; normal4/4 remains. Implemented pending release verification and independent closure. See BROWSER_FAILURE_EVIDENCE. Do not infer a cause or fix for the earlier uncaptured public startup timeout. Interview question: why is a failing CI exit insufficient to explain which checks actually ran?
