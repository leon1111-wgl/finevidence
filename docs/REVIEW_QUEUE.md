# Review queue

## FE-029 / P2 implementation ready for independent review (2026-10-26)

At 3f977c9, actual local server SIGINT/SIGKILL left its worker and TLS connection
alive after 16 seconds (0/2 original audit). The new fixed four-case exit judge
also reproduces SIGTERM and the remaining Agent budget: 0/4 baseline, 4/4 local
candidate. The child now independently arms the same absolute deadline using a
Unix default-action timer before constructing TLS; ignored/blocked alarm state
is reset inside that child. Parent kill/wait and bounded output remain unchanged.

First release ac5dbce failed macOS readiness before any TLS request (four
cases not exercised); preserve CI40331105323. Judge3 bounds startup separately
at60s and retains original15/45 request budgets. Do not call that earlier run a
passing exit test or infer an unproven startup root cause.

Review actual HTTP/Agent/TLS exit on Linux/macOS, original 15-second and remaining
45-second budgets, inherited signal state, no network on unsupported timers,
normal two-call financial parity and original six deadlines/four-slot release.
Distinguish exited orphan zombies from live socket owners on Linux. Retain unknown
client usage after server exit; do not infer remote cancellation or zero billing.
See PROVIDER_DEADLINE and its versioned raw evaluation. Independent review owns
closure; no closure from local implementation results alone.
Interview: why does a request-thread finally block not guarantee cleanup when
its server exits, and why must a child inherit an absolute deadline rather than
restart a relative timeout? E2/final E7 and historical 7/8/FE-013 stay open.


## FE-003 / E3 local transport deadline enhancement (2026-10-26)

The independent60259f8 audit measured the documented socket/checkpoint boundary
(its first strict-target2/5 is preserved). A disposable process now owns network
I/O and is killed/reaped on expiry. The versioned six-case plan is2/6→6/6; this
is an implemented P2 reliability suggestion, not a newly discovered regression.
Independently review TLS/header/body stalls, actual15/45 budgets, four-slot release,
worker crash, unknown usage, no automatic retries and late-output refusal. Do not
close E3 or claim remote cancellation/billing cessation from local process exit.
Interview: why does socket timeout not bound a slow response, why is a timed-out
thread insufficient, and how do you prove resource recovery without hiding cost?

FE-028 was independently closed in observed scope at60259f8 on2026-10-26:
startup state8/8, fault resources6/6 and independent boundaries18/18. Historical
version1 reports and unexplained natural startup failures remain unchanged.

## FE-028 / P3 implementation ready for independent review (2026-10-26)

The62e533e audit reproduced misleading startup visibility2/8 and omitted catalog
failure events (fault capture4/6). Version2 separates panel/link/data controls;
the same eight observations are8/8 and resources6/6 locally. Review ancestor and
missing-node controls12/12, schema compatibility, unchanged1.5second capture
limit, safe module-name coverage and the last16 event cap. Check that version1
archives retain their original interpretation and injected children still exit1.
Do not close until independently verified on the published SHA. This does not
explain or fix prior natural ERR_SOCKET_NOT_CONNECTED/readiness timeouts.
Interview: why can an element's own hidden attribute disagree with rendered
visibility, and how do safe-name diagnostics stay current as dependencies grow?
E2/finalE7, genuine semantic labels and historical model7/8/FE-013 remain open.

## Local review diagnostics ready for independent review (2026-10-26 Taipei)

The543f4c2 audit's390px revoke-lost-response timeout is still unexplained. Review
the14-case checkpoint and phase contract in BROWSER_FAILURE_EVIDENCE, with normal
suite14/14, actual-child negative controls2/2 and screenshot pixel checks2/2.
Verify that both intentional failures remain exit1/13-of-14, prior passes survive,
URLs/body/headers/notes/bearers/raw exceptions cannot enter diagnostics, and
unavailable capture/cleanup failure never becomes success. The initial ineffective
style mask and first failed report contracts are retained in implementation evidence.
Interview: why can a correct nonzero exit still leave an incident untriageable,
and why is a saved screenshot not proof that redaction worked?

FE-022 was independently closed on543f4c2 in its reproduced filename scope.
Do not close natural startup observations or FE-013 based on this reporting work.
E2 rights/semantic admission, finalE7 and historical real-model7/8 remain open.

## FE-022 / P3 API compatibility ready for independent review (2026-10-26 Taipei)

Baseline41ae1c9 rejects six browser-produced special-name submissions with422.
The fixed ten-case Chrome plan passes10/10 locally, including downloaded receipt
snapshot equality; known name tasks0/6→6/6, ordinary/refusal controls4/4 unchanged.
Review raw LF versus literal backslash-n, Unicode normalization distinctions,
512 UTF-16 units including astral characters, NUL/lone-surrogate refusal, exact
restart/retry identity and the absence of filename-derived filesystem access.
Shared29-case fixture covers both validators. Do not close until independently
reproduced on the published SHA; do not weaken note/path/auth/schema checks.

FE-027 independently closed on41ae1c9 (13/13 reproduced constructor/CLI/control
checks). Natural startup transport failures remain unresolved and retain first
failures. FE-013/live7/8, E2 and finalE7 remain open.

## FE-027 / P3 implementation ready for independent review (2026-10-26 Taipei)

Observed c7f498e baseline: FIFO timeout, directory IsADirectoryError and socket
OSError. Added nonblocking open + descriptor regular-file check and classified
CLI refusal. Frozen6cases changed3/6→6/6; all3 expected refusals pass and3 regular
controls remain accepted. Inspect REVIEW_STORE_PATH and both raw first-run reports.
Verify original path preservation, no SQLite call for nonregular objects, valid
v1 history/retry, hot-journal recovery, CLI exit2/no private diagnostic. Do not
close until independently reproduced on the published SHA. Same-user path swaps
and broader filesystem failures are outside the claim.

FE-026 independently closed on c7f498e after additional12/12 correction sequences;
FE-022 opaque filename compatibility remains open. Restore startup first5/6 and
single diagnostic1/1 are retained separately, root cause unknown. No paid call;
FE-013/live7/8, E2 and finalE7 remain open.

## Historical FE-026 / P3 correction handoff (2026-10-26 Taipei)

Observed7aa283d: real422 validation refusals keep editing disabled and reuse the
same invalid payload. New fixed plan12/18→18/18; correction tasks0/4→4/4.
Review exact HTTP status+known code, preserved note/reason/draft, focused editable
field, corrected submission with new ID, rejected-source invalidation and late
disconnect. A prior unknown write outcome, malformed/unknown response, wrong status
or post-write GET failure must keep the original ID/body and produce no duplicate.
No automatic retry or financial admission. Independent closure is pending.
Interview: why does a422 on a retry not establish that a preceding attempt failed?

FE-025 independently closed on7aa283d in the reproduced copy-recovery scope.
FE-027/P3, found by that review, remains open: normal ReviewLedger construction
blocks in sqlite3.connect when reviews.sqlite is a private FIFO; directory instead
raises IsADirectoryError. Reject nonregular paths with a stable error before SQLite,
preserve original bytes, and retain valid/hot-store recovery regression. A SQLite
busy timeout does not bound filesystem opening. FE-022 opaque filename API
compatibility and FE-013/live7/8 remain open; no new paid call.


## FE-025 / P2 hot-journal follow-up, 2026-10-25

Independent585a7e8 review reproduced valid record/revoke crash journals blocking
startup0/2 (SQLITE_READONLY_ROLLBACK), while previousbbb94fc reopened2/2. Original
adoption five cases and six added concurrency boundaries passed. Do not close the
whole issue based only on schema refusal.

The implementation adds typed startup guidance and offline copy recovery. Review
original pair preservation, old receipts/revocations/request replay, repeated and
concurrent recovery, source drift, wrong owner/unknown hot schema, symlink/FIFO,
size/WAL/super-journal refusal and a kill during recovery. Explicitly switch to the
validated new directory; never clear a journal or incomplete marker. No live backup
or automatic overwrite. See LOCAL_REVIEW_LEDGER for commands and limits.

Prior local restore first5/6 (STARTUP_LOAD_FAILED,30000ms wait) remains unexplained;
current passing runs cannot replace it. FE-022/026 and E2/finalE7 remain open.

## FE-025 / P2 store recovery implementation (2026-10-25)

Observed onbbb94fc: version1 unrelated/malformed databases received new tables;
original probe3/5. ReviewLedger now validates the entire shipped v1 schema and owner
in a read-only transaction. Empty-store initialization rechecks under BEGIN
IMMEDIATE and commits DDL/owner/version together. Original probe5/5 locally,
refusal+original bytes4/4; nine added engineering methods pass, including published
v1 record/revocation/idempotency restart and initialization rollback.

Await independent closure on the published SHA. Check extra/missing tables,
columns, primary/not-null/check/foreign-key/collation changes, indexes/views/triggers,
foreign application ID, owner loss/mismatch and non-database files. Preserve bytes
on refusal and restart existing valid stores with no migration. Exact SQL shape is
a deliberate closed-format contract, not arbitrary equivalent-schema support.
See LOCAL_REVIEW_LEDGER for commands, first failures and limitations.

FE-022/P3 remains open at the browser-draft → ledger API filename boundary; the
older producer/receiver fix is retained. FE-026/P3 remains open: definite422 locks
editing as if outcome were unknown. This cycle does not change those contracts.
Prior ledger Chrome first13/14 remains with its unexplained6000ms narrow-screen
revoke wait; diagnostic1/1 does not close it. FE-013/live-model7/8 and E2/finalE7
remain unchanged. Interview: why do a schema version and CREATE IF NOT EXISTS fail
to identify a store, and why can executescript defeat rollback expectations?


## Next independent review: local observation ledger, 2026-10-25

Verify explicit opt-in and same-origin/CSRF/bearer guards, server-bound label,
private external storage, strict pending schema and absence of calculation
admission. Reproduce restart, lost-response retry, conflicting IDs, concurrent
revocations, lock failure and capacity behavior with synthetic identities.
Confirm stale receipts do not supersede current revocation, browser disconnect
ignores late reads, source/list changes clear selected snapshots and historical
HTML remains usable. Public Pages must never accept/send a local review secret.
The current release first static startup15/16, base initialization timeout and
retry6/7 remain diagnostic evidence. Original-plan instrumented checks16/16,14/14,
7/7 and cold-start12/12 per runtime did not explain the earlier failure. Merge
this with the existing natural startup observation, not FE-024.
Python draft receiving first25/26 also includes an unlocalized6000ms wait timeout
in desktop discard-staged; instrumented unchanged-plan26/26 did not reproduce it.
Keep that evidence separate until its failing phase can be identified.
No human or organizational identity proof is asserted. FE-001/002/008 and FE-013
remain open. Exact cases and limits: LOCAL_REVIEW_LEDGER.

Previous independent6e9dd4e audit closed FE-024 for the reproduced null-DOM wait
defect: original12/12 plus lifecycle8/8. Its initial public navigation6/8 and
subsequent diagnostic2/2 are retained separately; their natural timeout cause is
unknown. The historical handoff below is superseded only in that closure scope.

## FE-024 and group navigation handoff, 2026-10-25

The independent d1f90d1 review verified draft preparation in its observed scope and
found FE-024/P3: startup test#status dereferenced before body parsing after commit.
This release shares presence-aware ready/data-error predicates and adds delayed
body plus absent/wrong-state controls (12/12 locally; original0/12). Full startup
still checks actual failure/retry/export and retains existing deadlines. Await
independent closure; do not reclassify this as an FE-023 product regression or
explain prior natural transport timeouts with this test-specific root cause.

Also review the dense-group presentation: one native expandable member list,
keyboard navigation in both directions, deletion/reindex, resolved/empty groups,
old HTML compatibility and unchanged actual JSON. Local new8/8 and original24/24
pass. Check390px layout and export-button spacing. No change to provenance,
financial trust, source rights or authenticated reviewer identity; FE-001/002,
FE-013 and final real-business E7 remain open. No paid calls.


## Next independent review: draft preparation and correction (2026-10-25)

Check the published SHA, missing-field row locations, exact normalized-value
conflicts, original-page edit/cancel, invalid/duplicate replacement preservation,
list/import/page/file invalidation, legacy HTML control initialization and real
JSON downloads on desktop/narrow. Checklists must remain unsigned/ineligible and
be rejected by both formal replay and draft receiving. Do not close FE-001/002
for these preparation checks. The existing natural startup-timeout observation
remains unassigned; one diagnostic pass does not resolve its cause.
Prior e58d1ac independent review closed FE-023 in the observed cache scope (local
review record2026-10-24); this feature must preserve those regression contracts.

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

## 2026-10-23 independent closure and draft handoff

FE-019 was independently checked at fe1e56e: original reproduction 1/1, existing report cases 2/2, extra launch/navigation/assertion cases 3/3 and SIGKILL checkpoint 1/1. The first SIGTERM expectation was wrong because Playwright handles the signal; its failed evidence remains in the local review. Close only this observed report-retention scope.

Next independently inspect source-bound drafts: exact excerpt/page ownership, raw numeric token versus substring/sign, string decimal precision, unknown units, user-supplied period/currency/scope, duplicate/count limits, new-file/clear invalidation, saved-versus-unsaved export, replay rejection and HTML text rendering. Real-source rights, semantic support, authenticated approval and FE-013 remain open; no claim of automated extraction quality.

## FE-020: clipped amount context (2026-10-23)

P2, reproduced at f5e06d9 by independent review. `createFactDraft` validated amount boundaries only inside a clipped excerpt:120 could become12, or -120 could become positive120 in an unverified saved/exported row. Financial calculation admission remained blocked.

Implemented: search raw tokens only inside the selected excerpt; inspect boundaries in the full page at its first exact occurrence. Export rebuilds against the same context. Regression includes repeated occurrences, clipped symbols, whitespace, UTF-16 and preserved saved/downloaded rows. New unit tests2/16→16/16; original review string probe13/21→21/21. Wrong page-global search mutation14/16 is rejected by the new scope tests. Publication and independent closure must follow verified release evidence; do not infer them from this note. FE-013 and the original real-model7/8 remain unchanged.


## FE-020 Unicode follow-up, 2026-10-23

The independent57b6b7c review confirmed old ASCII behavior but reproduced incorrect positive120 fromFF0D minus,FF05 percent and066A percent (actualPDF public/Python12/18; full excerpt2/8). Same P2 issue, not a new finding. Boundaries now classify compatibility forms and an explicit Unicode numeric-marker repertoire without changing source text, raw amounts or UTF-16 offsets. Save/export revalidation share the check; existing saved rows remain unchanged on refusal. SeeFACT_DRAFTS for the exact repertoire and reproducible tests. Implementation validation and publication are recorded separately; independent closure remains pending. No verified-fact admission or formal-calculation bypass was observed. FE-013/live7/8 unchanged.

## 2026-10-24 observed closure and source-catalog review

FE-020 was independently closed on2ec41ba in the observed ASCII/Unicode clipping
scope: original string21/21, clipped PDF18/18, full excerpt8/8, plus14 independent
PDF controls per public/Python surface. This does not close semantic review.

New catalog review: check official metadata, changed/renamed bytes, stale identity
after failure/clear, local-only requests, unverified exports and catalog trust
boundary. Do not call metadata matching source-rights or financial approval.

FE-021 / P3 capability limitation, observed on2ec41ba plus catalog working tree:
`containsToken` rejects amounts attached directly to currency codes (e.g. RMB),
so the page-1 draft step failed in4/4 real-document/viewport runs. The same documents
work using separate table cells; this is conservative refusal, not wrong numeric
acceptance. Proposed follow-up: define an allowlisted currency-prefix grammar
while preserving signs, complete tokens and first-excerpt ownership; accept exact
RMB-prefixed amounts and reject clipped signs/digits/percentages with real PDF and
synthetic controls. No automatic unit inference. Interview: when is a letter a
currency prefix rather than part of an identifier? FE-013 remains open.


## Currency-prefix implementation, 2026-10-24

FE-021's attached-code and trailing-clause-comma limits are implemented, pending exact-release verification and independent closure. The original page-1 real workflow is0/4 before,4/4 per local static/Python surface after; no alternate page replaces the failed task.

FE-020/P2 has an additional observed sign-context variant on2b981a9: a full/clipped `-RMB 120` can be saved as positive120. It is merged into the same amount-context finding, not a new ID. The prefix rule now examines context before the currency code too;40 unit methods (base24/40) and28 browser checks (base12/28) pass locally. Formal financial admission remains blocked throughout. Review whole/clipped text, embedded codes, signed and accounting amounts, grouping/decimal/percent suffixes, repeated occurrences, export revalidation and preservation of saved rows.

Minimal rule and real diagnostic failures are inFACT_DRAFTS. Do not relax identifier/sign boundaries or infer currency/unit scales. Interview: why did a passing synthetic prefix test still leave both real reports unusable, and what distinguishes a clause comma from a thousands separator? FE-013/live7/8 and E2 rights/human verification remain open.


2026-10-24 independent review of4cad7d0 closed FE-021 only for the two official
page-1 amount preparation paths (4/4 each public/Python). FE-020 / P2 remains
open for the additionally reproduced currency-symbol sign gap: `-$120` and
`-HK$120` could be exported as positive120. Same24 constructed cases16/24 and
actualPDF16 scenarios8/16 per surface, while16 erroneous exports remained refused
by replay. No formal-calculation bypass is claimed.

This implementation checks before symbols/qualifiers and preserves source offsets,
unknown metadata and valid contiguous negatives. New41 unit methods22/41→41/41,
expanded actualPDF60 cases40/60→60/60 locally; independent strings24/24. Rejecting
a bad entry keeps prior saved rows and actual download unchanged. Await exact
release verification and independent closure of this observed scope; the broader
real-source rights/semantic review/admission gaps and FE-013 remain open.

2026-10-24 independent review closed FE-020 on e03369b in the observed currency-symbol scope (original24 string cases; original16 and independent32 PDF scenarios per public/Python surface). No universal numeric-notation guarantee.

New original-page preview awaits independent review: byte digest mismatch, page selection during pending rendering, late completion after cancel/clear, failed Worker/explicit retry, fixed raster size, blank page, keyboard scrolling, actual export equality and no upload/model requests. Rendering must never set verified_by, admit facts, or imply rights approval. See PDF_PREVIEW. FE-001/002/013 remain open.

## Pending draft receiver review handoff (2026-10-24)

Independently review DRAFT_RECEIVING after publication: whole-envelope trust fields, current-byte identity vs renamed files, parser/catalog drift, duplicate/escaped JSON keys, UTF-8 and structure bounds, stale read/apply after source or list changes, preserved saved-download equality, safe text and keyboard/narrow flow. Check that consistent semantic edits remain explicitly unverified and never enter calculation. This is a feature review request, not a newly invented defect. FE-013 and the actual rights/review/admission gaps remain open.

## FE-022 / P3 source-filename round trip (2026-10-24)

Independent review on c9d1446 reproduced unchanged LF/TAB filename handoffs
refused as IMPORT_CHANGED: strings10/12 and actual browser16/20. The producer
and receiver disagreed about supported names; no calculation admission bypass.

The shared source-name contract and escaped presentation are implemented in this
cycle, pending exact-release verification and independent closure. Preserve old
version-1 exports and renamed-source behavior, including unknown units and pending
trust fields. Check actual LF versus literal backslash-n display, directional and
HTML-like name text, row-name mismatch, invalid-name retry, keyboard apply and
unchanged actual exports. The original independent probes now12/12 and20/20 on
local static/Python. New unit14/14 and browser14/14 on static/Python cover added controls.

Interview: why can escaping a display name fix ambiguity without changing source
identity, and why is a shared input contract different from sanitizing raw data?
Do not infer authenticated review or financial semantic quality. FE-013 and the
E2 rights/human review/admission gaps remain open.

Separate environment observation: two local restore invocations had one startup
timeout each (different scenarios); a diagnostic captured Chrome
ERR_SOCKET_NOT_CONNECTED on an existing module. An unchanged suite on a new
loopback server passed6/6. No restore assertion/timeout was weakened and no
production connection fix is claimed. Retain first failures and independently
check startup on the actual deployment/runtime before classifying the root cause.

## FE-023 / P2 module startup failure (2026-10-24)

Independent review on ec0e6a2 reproduced a missing recovery boundary: a failed
pdf-preview-panel.mjs request prevents the entry module from running, leaving
loading text and hidden data retry. Four normal controls pass; four controlled
module failures fail recovery. Manual document reload restores all four saved
records; the original Chrome transport failure cause remains unknown.

This cycle adds an independent bootstrap, native HTML reload fallback, inert
pre-start UI and an explicit idempotent business start. Local fixed16-scenario
contract improves4/16→16/16 per static/Python surface. Exact release verification
and independent closure remain separate gates. Review rejection, actual timeout,
late evaluation, missing bootstrap, disabled JavaScript, keyboard reload, saved
notes/checks/actual exports, and no automatic model calls. Data-only retry must
remain distinct. Do not count a reload link as repairing unavailable server assets.

Interview: why does catching fetch errors inside initialize not catch an entry's
static dependency failure, and why is Promise.race alone insufficient to stop a
late module from starting the application? See STARTUP_RECOVERY.


## FE-023 cache branch — implementation handoff

The independent0428af8 mixed-version finding is part of FE-023, not a new issue.
Versioned graphs and old-entry compatibility are implemented; keep open pending
independent review. Recheck actual HTTP cache (routing disables it), both frozen
old HTML/app conventions, full nested/Worker URL isolation, missing graph reload,
late completion, notes/checks/actual export and Python CSRF/root runtime paths.
Historical cached artifacts cannot be rewritten; removed versions have explicit
reload, not silent fallback. Retain earlier natural transport anomalies as
unexplained observations. See STARTUP_RECOVERY and browser-cache.cjs.
