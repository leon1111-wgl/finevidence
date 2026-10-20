# Import contention and process interruption

FE-005 was reproduced again at `19e4627d4edcb73ddae72e818755430d7e7dac38`: one real import was paused after reading an empty index, a second import completed, then the first resumed. Both reported `imported=1 documents=1`, but the final index contained only Aurora. Atomic file replacement did not protect the earlier read/merge.

## Implemented contract

`documents.import_documents` now holds an exclusive advisory lock across the entire read, source validation, conflict/duplicate checks, merge and atomic replacement. All application imports use that entry point. The lock is a separate stable `data/index.json.lock` inode, because replacing `index.json` would otherwise replace the object being locked.

Acquisition uses `fcntl.flock(LOCK_EX | LOCK_NB)`. Contention returns `INDEX_BUSY`, exit 2, immediately without entering the read/modify/write body. The user can retry after the current import finishes. There is no hidden retry loop, waiting queue or timeout-based lock stealing. The available Unix flags and error mapping follow the [Python 3.12 fcntl documentation](https://docs.python.org/3.12/library/fcntl.html#fcntl.flock); nonblocking open and no-follow flags are described in [os.open](https://docs.python.org/3.12/library/os.html#os.open).

The lock file is created with mode 0600 when absent. It is opened without truncation, without following a final symlink, and with nonblocking I/O. A descriptor check requires a regular file with exactly one hard link. Directories, FIFOs, symlinks, dangling/cyclic links and extra hard links are refused as `INDEX_LOCK_ERROR`, with no index or linked-target change. Other lock open/acquisition failures also fail closed; a missing supported locking backend returns `LOCK_UNSUPPORTED`. No unprotected import fallback is allowed.

Closing the descriptor releases ownership on success or exception. The file remains in place and is ignored by Git. Its presence, timestamp and contents do not mean an active import exists. Never delete or replace it while writers may be active: that would create a different lock inode. Readers do not take this lock; they read a complete old or new index through the existing bounded read and atomic publication path.

## Recovery behavior actually tested

| Interruption or input | Observed contract |
|---|---|
| Second importer while the first is paused after read | INDEX_BUSY, no successful write; retry sees the first commit and retains both documents |
| Duplicate import after retry | imported=0, skipped=1; index bytes unchanged |
| Same document ID with conflicting content after retry | IMPORT_CONFLICT; committed index unchanged |
| Competing writer before or after replacement | Still INDEX_BUSY; lock spans publication and result construction |
| Validation failure / injected replacement failure | Existing index unchanged; another call in the same process succeeds; ordinary failed-write temporary output cleaned |
| Process killed before replacement | Prior committed index remains authoritative; new import can acquire the existing lock file |
| Process killed after replacement but before success output | Committed data remains; retry is idempotent even though the original caller received no success acknowledgement |
| Process killed after staging a temporary file | Old index remains; staged file is not read as committed data; retry succeeds without consuming or deleting the orphan |
| Independent index path / symlink alias of the same parent directory | Independent index proceeds; alias of the same lock location returns INDEX_BUSY |

A forced process kill can leave `index.*.tmp`. The application neither reads these as an index nor automatically deletes them. Preserve them for diagnosis; manual cleanup is appropriate only after all writers are stopped. This is different from the empty stable lock file, which should normally remain.

## Regression evidence

```sh
.venv/bin/python -m unittest discover -s tests -p test_import_concurrency.py -v
.venv/bin/python -m unittest discover -s tests -v
```

The tests coordinate actual subprocesses with a pipe handshake at the read and replacement boundaries; they do not rely on a lucky timing overlap. The original reproduction's barrier required two writers to finish reading, which is incompatible with the new refusal-before-read contract. The new test holds only the first writer, so the second can fail promptly without deadlocking the harness.

The initial 13-method suite failed against the old implementation. Two harness issues were corrected before the final red run: reset the index at the start of each replacement-boundary subtest, and keep descriptor assertions inside their own error subtest. The corrected red run had 14 failures and four expected missing-backend attribute errors; the three existing controls (validation failure, replacement failure and untouched regular lock-file contents) passed. These counts are assertions/subtests, not separate product defects.

After implementation all 13 passed; an additional staged-file crash case also passes. All prior test methods and error assertions remain. See STATUS for the full-suite result and inspect the exact commit's CI before claiming remote validation.

## Limits

This contract is for cooperating FinEvidence processes using the same index pathname on a supported local POSIX filesystem. Linux and macOS are the CI targets. Windows imports fail closed until a backend is implemented; read-only commands remain available. Network/distributed filesystems, external writers that ignore advisory locks, aliases of the index file itself, deliberate lock replacement, source-file mutation races and forked descendants retaining a descriptor are outside the guarantee.

No fsync/power-loss durability, fairness, automatic retries or full workflow checkpoint recovery is claimed. A process can commit and die before reporting success; the index and idempotent retry resolve that ambiguity. This increment fixes the reproduced cooperating-writer lost update; it does not complete E1 storage, enterprise operations, Agent recovery or E7 interface work.
