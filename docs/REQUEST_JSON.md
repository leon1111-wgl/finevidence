# Local request JSON and dispatch

`POST /api/run` accepts one object with operation, company, year and query.
Origin/CSRF, content type/transfer encoding, 16 KiB size and request-slot gates
still precede parsing. The whole-body 5-second deadline is unchanged.

Every object must have unique decoded member names. Duplicate equal values,
Unicode-escaped aliases and repeated scope/operation names return 400 with the
existing INVALID_REQUEST payload, no financial output and no model audit field:
no provider has been created or called. The parser does not pick the first or
last value and never repairs/retries an ambiguous request. Ordinary escaped
names and duplicate-looking JSON text inside a query string remain supported.

`_unique_request_object` applies the existing review endpoint check to the run
endpoint as well. Review authentication, 32 KiB cap, mutation/idempotency rules
and rejection of non-finite constants remain unchanged. Model-generated
messages use the separate Agent decoder and DUPLICATE_KEYS diagnosis; a request
parse failure is not a model-decision failure. This change does not address all
JSON consumers, organization authorization, public hosting or semantic intent.

Run `python3 -m unittest tests.test_run_json_keys -v` and the existing request-body,
review-ledger and Agent diagnostics suites. The nine known wire cases cover
8 fixed operations and 1 duplicated operation selecting Agent; before the fix
all returned 200, with 1 tool each and 2 offline model calls in the Agent case.
Afterward all 9 return 400 with 0 tools/provider constructions/calls. Normal
30.00% and facts/calculations/citations match the fixed control. Fixtures are
synthetic, not hidden tests or real-model effectiveness measurements.

The first new suite had 3/6 passing methods and 10 failed entries; the first Agent
fixture used an empty question (422) before it was corrected to a valid question
(200 with 2 offline calls). Both failures are retained. Initial JavaScript checks
ran before build_web generated bundle.json (226/229, three file failures);
after the required build 260/260 passed. Full Python 314/314, adjacent 39/39.
See [first-result metrics](validation/request-duplicate-keys-2026-10-31.json).
Paid/live calls 0; real-model first 8-question record remains 7/8 and FE-013 open.

Actual Chromium at 1440/390 completed 2/2 flows: keyboard submission with a duplicate operation returned 400, removed stale financial output and disabled export; explicit retry with an unambiguous request restored 30.00%, source review and a real JSON download. Model provider constructions 0 and external requests 0. Additional local workflows 14/14, briefs 8/8, recovery 4/4 and startup keyboard 6/6 passed.
