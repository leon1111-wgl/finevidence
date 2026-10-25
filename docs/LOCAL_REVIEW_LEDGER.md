# Local review ledger

Design date: 2026-10-25. This adds accountable local review **observations** on
pending drafts, not financial approval/admission, rights clearance or enterprise SSO.

## Two design passes

Pass one: source/page citations enable inspection, but an unsigned browser note
cannot establish which configured operator recorded an observation, survive service
restart, or show that an opinion was withdrawn. Add an opt-in loopback ledger with
server-bound operator label, exact draft snapshot/digest, UTC time and revocation.

Pass two: a locally configured label and shared secret are not verified employment
or legal identity. The server has no PDF bytes and cannot certify extraction or
financial semantics. Never offer an approved-fact state. Preserve pending status,
source/rights unknown and calculation=false. Receipts are unsigned snapshots and
can become stale after revocation; authoritative current state is the local ledger.
A machine owner can edit the DB. No tamper-proof/compliance/competitor-win claims.

Official references rechecked and accessible 2026-10-25:
[Tencent ADP](https://adp.tencentcloud.com/solutions/enterprise-knowledge-expert)
(employee checking/editing and original references, Shenzhen platform context) and
[AlphaSense](https://developer.alpha-sense.com/agent-api/response-parsing)
(document/page/statement citations, international competitor). Undated product
documentation supports workflow needs only, not measured performance or hiring levels.

## Implementation plan

- [x] Red tests: actual HTTP auth, request boundaries, identity spoofing, durable
  restart, idempotent retries, concurrent duplicate/revoke, missing IDs and no admission.
- [x] SQLite ledger: private external directory, bounded records, strict pending-draft
  envelope, immutable snapshots plus a single appended revocation event; transactional
  request IDs. Opt-in server config with hidden terminal secret input.
- [x] UI: local-only connection, per-row explicit snapshot selection, observation,
  list/export, revoke with reason, manual retry. Refresh has no stored credential;
  no automatic requests or PDF/model transfer. Historical HTML remains usable.
- [x] Local actual Chrome desktop/narrow: complete save/reload/reconnect/export/revoke,
  wrong secret, lost response/idempotent retry, source change, keyboard, safe text,
  empty/loading/error; static disabled/no POST.
- [ ] Release gate: exact CI/Pages/fresh clone; recorded with the published SHA.

Implementation is Codex-assisted; tests use synthetic actors and source data.
No human semantic review or user-independent implementation is inferred.

## Run and complete the workflow

Python 3.12, macOS/Linux, no new runtime dependency. Start from the repository:

```sh
python3 -m finevidence.server --review-directory "$HOME/.finevidence-review" --reviewer 'Your local operator label'
```

Choose a **new** private directory outside the repository; its parent must exist.
The service creates it with mode0700 and reviews.sqlite with mode0600, or rejects
insecure/symlink locations. Store a separate random32+character secret in your
password manager and enter it at the hidden terminal prompt. This is **not** your
model API key. A process-only FINEVIDENCE_REVIEW_TOKEN may be used by local tooling.
Do not put either secret in a command line, source, public page or shared record.
Same directory must retain the original operator label; restarting with a new
secret rotates access without rewriting old records. Anyone holding that secret
acts as the configured operator: this is single-operator local authentication,
not individual identity proof, roles, SSO or separation of duties.

1. Open the printed loopback URL. Expand **本机审核记录**, enter the same local
   secret and connect. No data is read before this explicit action.
2. Inspect a local PDF, its physical-page layout and pending financial drafts.
   Choose **登记草稿 N 审核意见** on a saved row. Review the selected snapshot,
   choose needs-changes or a limited-scope observation, and describe your evidence
   and unknowns. Save explicitly. Only this draft/excerpt and note reach the
   loopback service; no PDF bytes, entire report or model call is sent.
3. Query/export the receipt. It retains the exact declared draft, its canonical
   SHA-256, server operator/time and non-admission status. Changing the saved
   draft/list clears the selection; it cannot rewrite an existing record.
4. Refresh the page or restart the service using the same directory/operator.
   Reconnect with the secret to retrieve records. The browser stores no secret
   or ledger data in localStorage; page exit/disconnect clears its memory state.
5. Select **撤回此意见**, state a reason, then confirm. Original snapshot/note/time
   remain; revocation adds operator/time/reason. Export again for current state.
   An old exported JSON cannot learn about subsequent revocation. It is unsigned
   and is not a credential, an approved fact, or an importable financial input.

The default server and GitHub Pages keep this feature disabled. No public upload
endpoint or browser-to-loopback connection is provided. The server must stay bound
to127.0.0.1. Model configuration is independent and not needed for these steps.

## Failure and storage contract

- Host/Origin/cross-site and POST CSRF protections plus a separate bearer secret
  guard every ledger read/write. Runtime metadata exposes only enabled/disabled.
  Operator identity, timestamp and status are server-controlled; extra fields,
  duplicate JSON keys, invalid types and promotion attempts reject explicitly.
- JSON request limit32KiB, note/reason2000UTF-16 units, existing draft limits,
 100 records per directory (including withdrawn records). Reaching the limit
  does not delete history. Export and preserve that directory before opening
  another private store. There is no automatic rotation, retention or backup.
- Transactions serialize writes. A UUID request ID binds action+body; identical
  retries return that record's **current** state; different content with the same
  ID gets409. Two concurrent revocations cannot overwrite the first reason.
  A failed transaction does not consume the ID. No automatic retries.
- The browser waits at most8seconds per request. A lost response is an unknown
  outcome; explicit retry reuses the same payload/ID. Disconnect cannot cancel
  an already committed write. Reconnect/query before starting another action.
  The server uses1second SQLite busy timeout and returns503 on store errors.
- PDF hash, metadata, excerpt offsets and financial declarations are still user
  assertions. The server checks bounded structure and decimal normalization; it
  does not receive PDF bytes or repeat browser extraction/visual/semantic checks.
  Both draft and receipt remain financial_calculation_eligible=false, source
  verification not performed by server, licensing_status=not_verified.
- Plaintext local SQLite, OS permissions, no signatures/encryption or tamper-proof
  append-only claim against the machine owner. API records are immutable; local
  owners can change files. Stop the server before making a filesystem backup;
  keep it outside this public repository. No automatic deletion or cloud backup.

## Reproducible verification

```sh
python3 -m unittest discover -s tests -p test_review_ledger.py -v
python3 scripts/build_web.py
pnpm test:review-ledger
```

The browser suite starts isolated loopback servers and synthetic operator stores,
restarts them, exercises Chrome at1440/390 and removes its own temporary stores.
It requires the same Playwright setup as the existing browser suite. Screenshots
and fixed-denominator results are saved even when a scenario fails. CI executes
it separately from the default static/Python regression, without real credentials.


Local release regression retained three first-run static initialization failures:
startup15/16, base flow stopped before assertions, retry6/7. The initial startup
screenshot reports STARTUP_LOAD_FAILED. Separate unchanged-deadline diagnostics
passed12/12 cold starts on each runtime, and one instrumented repeat of the three
original scripts passed16/16,14/14,7/7 respectively. Instrumentation recorded only
the intentional fault injections; it did not explain the earlier failure. No
startup fix or all-first-runs-green claim is made. Python originals passed those
same three plans on their first run. Publication still requires exact CI and
fresh-clone verification. No results are silently replaced.

The first Python draft-receiving run also retained25/26: desktop discard-staged
timed out at a waitForFunction (6000ms). That runner did not capture the failing
wait location or a failure screenshot, so its phase/cause is unknown. One
unchanged-assertion/deadline run with network/page-error instrumentation passed
26/26; no repair is inferred and the first result is preserved.


## Store recovery validation (FE-025, 2026-10-25)

Reopening a store performs a read-only transaction first. Version1 alone does not
identify this application: the complete closed v1 schema must match the shipped
four tables, implicit indexes, columns, constraints and relationships. Unexpected
objects (including triggers/views/indexes), other application IDs, missing owner,
unknown versions or malformed database headers reject as REVIEW_STORE_SCHEMA.
A different configured owner rejects as REVIEW_OWNER_MISMATCH. No table creation,
owner claim, version rewrite or automatic repair occurs on these rejection paths.

Published bbb94fc v1 stores remain supported without migration. The existing owner,
records, revocations and request IDs remain intact, and reopening a supported
store itself performs no database write. This is an exact application-owned schema
contract, not a general SQLite schema-equivalence parser: manually reformatted or
extended databases are unsupported even if their SQL could be equivalent. Copying
the format cannot prove authenticity; the machine owner can still edit the file.
This check does not certify financial semantics or validate every stored JSON row.

Only an empty version0 database with application_id0 can initialize. After acquiring
BEGIN IMMEDIATE, the initializer rechecks it, then creates all tables, owner and
version in one transaction. An interrupted/failed initializer can therefore roll
back instead of leaving partly created tables. execute is used for each statement;
[Python executescript](https://docs.python.org/3.12/library/sqlite3.html#sqlite3.Connection.executescript)
would commit a pending transaction first. Schema comparison includes all entries
in the [SQLite schema table](https://www.sqlite.org/schematab.html), except rootpage
locations, which are storage layout rather than schema identity. Documentation
accessed2026-10-25; no external library is added.

On refusal, stop the server and retain the original private directory. Verify you
selected the intended backup and its original operator label. Do not delete tables,
change user_version or remove the owner to force acceptance. There is no in-place automatic repair. Use the copy-only procedure below for a
stopped store; starting a blank store must use a separate new private directory.

Reproduce the boundary and legacy restart contract:

```sh
python3 scripts/evaluate_review_store.py --output recovery.json
python3 -m unittest discover -s tests -p test_review_store_schema.py -v
python3 -m unittest discover -s tests -p test_review_ledger.py -v
```

The independent original five fixtures changed3/5 to5/5 locally: expected refusal
with unchanged bytes2/4 to4/4; empty-store acceptance1/1 remains. Nine new engineering
methods cover20 rejected-file variations, two empty-store paths, published-v1
lifecycle/replay and injected initialization failure. All9 pass locally; the
unmodified base had21 failed assertions and one uncaught malformed-file error.
The first test harness reused failed subcase files; that harness failure was kept
and isolation corrected before implementation. These are known-defect synthetic
recovery cases, not hidden cases, real-data quality or saved analyst time.

FE-022 (opaque filename API compatibility) and FE-026 (editing after a definite
422) remain open. The prior independent browser13/14 and its diagnostic1/1 do not
become14/14 retroactively; their intermittent wait location/cause is unresolved.


## Recovering a hot rollback journal (FE-025 follow-up, 2026-10-25)

A process killed during an actual record/revocation transaction can leave a hot
`reviews.sqlite-journal`. SQLite must write rollback pages before it can read
that database. The normal read-only validation therefore reports
`REVIEW_RECOVERY_REQUIRED` instead of silently changing the original. Keep both
files together. Do not delete the journal, clear the store or change its owner.

The supported recovery workflow is explicitly offline and copy-only:

1. Stop **all** servers and other processes using the source directory. Preserve
   an offline backup of the whole source directory, including journal companions.
2. Create a separate private parent directory outside this repository, owned by
   the current user (mode0700). Keep the original configured reviewer label.
3. Run the command below. `--stopped` is an operator acknowledgement, not proof
   that a different/older program has stopped. Recovery never opens a SQLite
   connection against the source and never overwrites a chosen destination.
4. Read the returned `directory`, then explicitly start the local server with
   that directory and the original reviewer. Check records and revoked state;
   retry an interrupted operation with its original request ID. Keep the original
   backup until this verification is complete. Use only one chosen restored copy
   as the working store; there is no merge of independently modified copies.

```sh
mkdir -m 700 ../private-review-recovery
python3 -m finevidence.review_recovery \
  --source ../private-review-store \
  --output-parent ../private-review-recovery \
  --reviewer 'Your original local operator label' --stopped
# Use the exact newly generated directory returned above:
python3 -m finevidence.server --review-directory <returned-directory> \
  --reviewer 'Your original local operator label'
```

The command makes a uniquely named mode0700 directory and mode0600 file copies,
lets SQLite recover **only those copies**, then checks the closed-v1 schema,
original owner, SQLite integrity and foreign keys. The source pair's bytes and
file identities are compared before/after; observed changes refuse publication.
These checks are not a live backup protocol or a lock against noncooperating
writers. The stop requirement is mandatory. Concurrent recoveries produce separate
copies without replacing each other. No source file is created, removed or changed.

Each source file is bounded to64MiB and must be a private, singly linked regular
file, not a symlink/FIFO. WAL mode/companions, super-journal trailers (attached
transactions), malformed/non-hot journal headers and unsupported schema refuse;
this is not a general damaged-database salvage tool. SQLite VM checking has a
5-second progress deadline; filesystem I/O is not a hard wall-clock guarantee.
SQLite verifies rollback under its normal single-database crash assumptions;
checksums/schema do not establish authenticity or certify deliberately altered
journal contents. No semantic or organization approval is added.

`RECOVERY_INCOMPLETE` marks a staging directory until validation and source checks
finish. A caught error removes only that newly created staging copy. If recovery
itself is killed, the incomplete directory may remain; the server refuses it as
`REVIEW_RECOVERY_INCOMPLETE`. Leave the original pair intact and rerun into another
unique directory. Never remove the marker to force admission. A complete output
also contains `recovery.json` with source/recovered hashes and the new location;
no bearer secret or full receipt is printed in the CLI report.

Mechanism: [SQLite hot journals](https://www.sqlite.org/lockingv3.html#hot_journals)
and [SQLITE_READONLY_ROLLBACK](https://www.sqlite.org/rescode.html#readonly_rollback).
The [SQLite pager](https://github.com/sqlite/sqlite/blob/master/src/pager.c)
describes the super-journal trailer. Official sources accessed2026-10-25.

```sh
python3 -m unittest discover -s tests -p test_review_recovery.py -v
python3 scripts/evaluate_review_recovery.py --output crash-recovery.json
```

The evaluator runs two synthetic tasks once: actual record/revoke interrupted
beforeCOMMIT after forcing page spill with connection-local cache_size=1. After
copy recovery, committed history (including prior revocation), request replay,
retry of the interrupted operation and actual server construction must pass;
original DB/journal hashes must remain unchanged. Old direct startup0/2 remains
an observation: this change adds a deliberate recovery step, not transparent
in-place startup. This is known-defect recovery evidence, not real outage frequency,
financial accuracy or saved analyst time. Independent closure remains pending.

Release validation also runs `pnpm test:review-recovery`: two crash types × two
viewports=4 checks of restored record/revocation states, keyboard connection and
actual receipt downloads. Local4/4, original ledger14/14 and JS213/213 pass.
Local base14/14, retry7/7 and startup16/16 pass; restore first5/6 failed in
repeated-failure-retry with STARTUP_LOAD_FAILED and a30000ms wait. One unchanged
assertion/deadline diagnostic6/6 did not establish its cause. Keep both results;
no natural-startup fix is claimed. Exact-release CI/public checks are separate.
