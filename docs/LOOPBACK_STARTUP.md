# Numeric loopback startup without reverse DNS

2026-10-27 Taipei. This is a local availability improvement, not a public
hosting change or a measured production speedup.

The Python workbench binds only `127.0.0.1`. Previously `HTTPServer.server_bind`
synchronously called `socket.getfqdn` just to populate server-name metadata.
That enters the system name service before `make_server` returns, although
neither the workspace nor its numeric HTTP URL needs a resolved hostname.
A slow name service therefore postpones the first financial check.

`LoopbackHTTPServer.server_bind` now uses the TCP bind directly, then records
the actual numeric address and allocated port. Threading, bind-error cleanup,
Host/Origin/CSRF checks, source validation and Decimal calculation are unchanged.
No process-wide socket monkeypatch, hostname cache, extra resolver thread or
network retry is installed. The model provider retains its own TLS/DNS behavior
and deadlines. Static GitHub Pages has no Python startup path.

## Reproducible first-attempt observations

Run `python3 scripts/evaluate_loopback_startup.py --output startup.json`.
Each of three fixed cases runs once in a fresh process: native name service,
a synthetic two-second lookup followed by an OSError, and immediate simulated
name-service denial. Real sockets and the real Python workspace perform the
session request and source-linked Aurora 2024 revenue-growth calculation.
Only the name-service boundary is injected. The authored target is under one
second from `make_server` entry to the complete calculation response; CLI build
and interpreter launch are outside this timer. The process watchdog is ten
seconds, with failures retained rather than retried.

| Case | Before seconds | After seconds | Before/after lookup calls |
|---|---:|---:|---:|
| Native | 0.014188 | 0.007588 | 1 / 0 |
| Injected two-second lookup | 2.010025 | 0.007330 | 1 / 0 |
| Immediate OSError denial | 0.008355 | 0.008279 | 1 / 0 |

The fixed startup-plus-calculation contract changes **2/3 to 3/3**. All three
before and after calculations return **20.00%** with 2023/2024 source years;
this is no arithmetic accuracy gain. OSError denial already fell back in the
standard library. The separate three-method regression first passed2/3, then3/3:
audit-style resolver refusal with actual HTTP/Host checks, occupied-port refusal,
and releasing a bound socket after workspace initialization fails.

Raw before/after records are in `docs/validation/loopback-startup-*.json`.
They identify the base SHA and dirty candidate rather than inventing a candidate
commit before publication. These are synthetic engineering cases on one local
macOS/Python3.12.2 host, n=3 per variant; they are not a tail-latency estimate,
hidden set, human-time-saving study or real-report evaluation. Model calls0.

Historical macOS CI readiness around35seconds and browser natural startup/module
transport failures were not traced at their origin. Removing this dependency
must not be described as proving their root cause. Existing8/12/15/45second
application/provider deadlines are unchanged. Exact-release CI, deployment and
browser results remain separate evidence. FE-013/first real-model7/8, genuine
source rights/review/admission and final E7 stay open.
