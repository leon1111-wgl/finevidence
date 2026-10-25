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
