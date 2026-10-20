"""Real processes coordinated at read/replace boundaries; no timing-based races."""

import errno
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from finevidence import documents


PROJECT = Path(__file__).resolve().parents[1]
PAUSED_IMPORT = """
import sys
from pathlib import Path
from finevidence import documents, cli

phase, filename = sys.argv[1:]
def gate():
    print("READY", flush=True)
    if sys.stdin.readline().strip() != "continue":
        raise RuntimeError("test controller disconnected")

if phase == "after_read":
    real_read = documents.read_index
    def read(*args, **kwargs):
        result = real_read(*args, **kwargs)
        gate()
        return result
    documents.read_index = read
else:
    real_replace = Path.replace
    def replace(path, target):
        if phase == "before_replace":
            gate()
        result = real_replace(path, target)
        if phase == "after_replace":
            gate()
        return result
    Path.replace = replace
raise SystemExit(cli.main(["import", filename]))
"""


@unittest.skipUnless(os.name == "posix", "local POSIX locking contract")
class ImportConcurrencyTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        shutil.copytree(PROJECT / "finevidence", self.root / "finevidence",
                        ignore=shutil.ignore_patterns("__pycache__"))
        self.data = self.root / "data/synthetic"
        shutil.copytree(PROJECT / "data/synthetic", self.data)
        shutil.copytree(PROJECT / "data/facts", self.root / "data/facts")
        self.index = self.root / "data/index.json"
        self.lock = self.index.with_name("index.json.lock")

    def cli(self, *args):
        return subprocess.run([sys.executable, "-m", "finevidence", *args], cwd=self.root,
                              text=True, capture_output=True, timeout=3)

    def paused_import(self, phase="after_read", filename="aurora_2024.json"):
        worker = subprocess.Popen(
            [sys.executable, "-c", PAUSED_IMPORT, phase, filename], cwd=self.root,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        def cleanup():
            if worker.poll() is None:
                worker.kill()
            worker.communicate(timeout=3)
        self.addCleanup(cleanup)
        readable, _, _ = select.select([worker.stdout], [], [], 5)
        self.assertTrue(readable, "worker did not reach its test boundary")
        line = worker.stdout.readline()
        self.assertEqual(line, "READY\n", line)
        return worker

    def finish(self, worker):
        output, error = worker.communicate("continue\n", timeout=3)
        self.assertEqual(worker.returncode, 0, output + error)
        return output

    def assert_busy(self, result):
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertTrue(result.stderr.startswith("INDEX_BUSY:"), result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def ids(self):
        return {d["doc_id"] for d in json.loads(self.index.read_text())["documents"]}

    def test_overlapping_import_refuses_then_retry_preserves_both_documents(self):
        first = self.paused_import()
        second = self.cli("import", "harbor_2024.json")
        first_output = self.finish(first)
        # Complete both old-version writes before asserting, reproducing lost update.
        self.assertEqual(second.returncode, 2,
                         f"first={first_output!r}; second={second.stdout!r}; final IDs={self.ids()}")
        self.assert_busy(second)
        self.assertIn("imported=1", first_output)
        self.assertEqual(self.ids(), {"syn_aurora_2024"})
        retry = self.cli("import", "harbor_2024.json")
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertIn("documents=2", retry.stdout)
        self.assertEqual(self.ids(), {"syn_aurora_2024", "syn_harbor_2024"})

    def test_duplicate_retry_is_idempotent(self):
        first = self.paused_import()
        second = self.cli("import", "aurora_2024.json")
        self.finish(first)
        self.assert_busy(second)
        before = self.index.read_bytes()
        retry = self.cli("import", "aurora_2024.json")
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertIn("imported=0 skipped=1", retry.stdout)
        self.assertEqual(self.index.read_bytes(), before)

    def test_independent_index_is_not_blocked_but_parent_alias_is(self):
        first = self.paused_import()
        other = self.root / "other/index.json"
        result = documents.import_documents(self.data, other, ["harbor_2024.json"])
        self.assertEqual(result.documents, 1)
        alias = self.root / "data_alias"
        alias.symlink_to(self.index.parent, target_is_directory=True)
        with self.assertRaisesRegex(documents.DocumentError, "INDEX_BUSY"):
            documents.import_documents(self.data, alias / "index.json", ["harbor_2024.json"])
        self.finish(first)
        self.assertEqual(self.ids(), {"syn_aurora_2024"})

    def test_conflicting_retry_does_not_overwrite_committed_source(self):
        source = json.loads((self.data / "aurora_2024.json").read_text())
        source["pages"][0] += " SYNTHETIC conflicting version."
        (self.data / "conflict.json").write_text(json.dumps(source))
        first = self.paused_import()
        second = self.cli("import", "conflict.json")
        self.finish(first)
        self.assert_busy(second)
        before = self.index.read_bytes()
        retry = self.cli("import", "conflict.json")
        self.assertEqual(retry.returncode, 2)
        self.assertTrue(retry.stderr.startswith("IMPORT_CONFLICT:"))
        self.assertEqual(self.index.read_bytes(), before)

    def test_lock_spans_replace_and_readers_keep_complete_snapshot(self):
        for phase in ("before_replace", "after_replace"):
            with self.subTest(phase=phase):
                self.index.unlink(missing_ok=True)
                self.assertEqual(self.cli("import", "harbor_2024.json").returncode, 0)
                first = self.paused_import(phase)
                second = self.cli("import", "aurora_2023.json")
                query = self.cli("query", "revenue", "--company", "Harbor Lantern", "--json")
                self.finish(first)
                self.assert_busy(second)
                self.assertEqual(query.returncode, 0, query.stderr)
                self.assertEqual(json.loads(query.stdout)["status"], "EVIDENCE_FOUND")
                self.assertEqual(self.ids(), {"syn_aurora_2024", "syn_harbor_2024"})

    def test_process_death_before_replace_releases_lock_and_preserves_index(self):
        self.assertEqual(self.cli("import", "harbor_2024.json").returncode, 0)
        before = self.index.read_bytes()
        first = self.paused_import()
        self.assert_busy(self.cli("import", "aurora_2024.json"))
        first.kill()
        first.communicate(timeout=3)
        self.assertEqual(self.index.read_bytes(), before)
        retry = self.cli("import", "aurora_2024.json")
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(self.ids(), {"syn_aurora_2024", "syn_harbor_2024"})

    def test_process_death_after_replace_retries_without_duplicate(self):
        first = self.paused_import("after_replace")
        self.assert_busy(self.cli("import", "aurora_2024.json"))
        first.kill()
        first.communicate(timeout=3)
        before = self.index.read_bytes()
        retry = self.cli("import", "aurora_2024.json")
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertIn("imported=0 skipped=1", retry.stdout)
        self.assertEqual(self.index.read_bytes(), before)

    def test_death_with_staged_file_keeps_committed_index_authoritative(self):
        self.assertEqual(self.cli("import", "harbor_2024.json").returncode, 0)
        before = self.index.read_bytes()
        first = self.paused_import("before_replace")
        staged = list(self.index.parent.glob("index.*.tmp"))
        self.assertEqual(len(staged), 1)
        staged_bytes = staged[0].read_bytes()
        first.kill()
        first.communicate(timeout=3)
        self.assertEqual(self.index.read_bytes(), before)
        query = self.cli("query", "revenue", "--company", "Aurora Orchard", "--json")
        self.assertEqual(json.loads(query.stdout)["status"], "NO_MATCH")
        retry = self.cli("import", "aurora_2024.json")
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(self.ids(), {"syn_aurora_2024", "syn_harbor_2024"})
        self.assertEqual(list(self.index.parent.glob("index.*.tmp")), staged)
        self.assertEqual(staged[0].read_bytes(), staged_bytes)

    def test_validation_failure_releases_in_same_process_without_partial_batch(self):
        documents.import_documents(self.data, self.index, ["aurora_2024.json"])
        before = self.index.read_bytes()
        with self.assertRaisesRegex(documents.DocumentError, "SOURCE_ERROR"):
            documents.import_documents(self.data, self.index, ["harbor_2024.json", "missing.json"])
        self.assertEqual(self.index.read_bytes(), before)
        result = documents.import_documents(self.data, self.index, ["harbor_2024.json"])
        self.assertEqual((result.imported, result.documents), (1, 2))

    def test_failed_replace_releases_in_same_process_and_removes_temporary_output(self):
        documents.import_documents(self.data, self.index, ["aurora_2024.json"])
        before = self.index.read_bytes()
        with patch.object(Path, "replace", side_effect=OSError(errno.EIO, "injected replace failure")):
            with self.assertRaises(OSError):
                documents.import_documents(self.data, self.index, ["harbor_2024.json"])
        self.assertEqual(self.index.read_bytes(), before)
        self.assertEqual(list(self.index.parent.glob("index.*.tmp")), [])
        result = documents.import_documents(self.data, self.index, ["harbor_2024.json"])
        self.assertEqual(result.documents, 2)

    def test_lock_file_is_stable_and_not_truncated_or_unlinked(self):
        self.lock.write_text("lock presence is not ownership\n")
        original = self.lock.stat()
        for name in ("aurora_2024.json", "harbor_2024.json", "aurora_2024.json"):
            result = self.cli("import", name)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(self.lock.read_text(), "lock presence is not ownership\n")
            self.assertEqual((self.lock.stat().st_dev, self.lock.stat().st_ino),
                             (original.st_dev, original.st_ino))

    def test_bad_lock_objects_fail_without_mutating_index_or_target(self):
        self.assertEqual(self.cli("import", "aurora_2024.json").returncode, 0)
        before = self.index.read_bytes()
        self.lock.unlink(missing_ok=True)
        target = self.root / "sentinel.txt"
        target.write_bytes(b"FABRICATED_SENTINEL")
        for kind in ("directory", "fifo", "symlink", "dangling", "self_link", "hardlink"):
            with self.subTest(kind=kind):
                self.index.write_bytes(before)
                if kind == "directory":
                    self.lock.mkdir()
                elif kind == "fifo":
                    os.mkfifo(self.lock)
                elif kind == "hardlink":
                    os.link(target, self.lock)
                else:
                    self.lock.symlink_to({"symlink": target, "dangling": self.root / "absent",
                                          "self_link": self.lock.name}[kind])
                result = self.cli("import", "harbor_2024.json")
                if kind == "directory":
                    self.lock.rmdir()
                else:
                    self.lock.unlink()
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertTrue(result.stderr.startswith("INDEX_LOCK_ERROR:"), result.stderr)
                self.assertEqual(self.index.read_bytes(), before)
                self.assertEqual(target.read_bytes(), b"FABRICATED_SENTINEL")
                self.assertNotIn("FABRICATED_SENTINEL", result.stdout + result.stderr)

    def test_unavailable_locking_fails_closed(self):
        with patch.object(documents, "fcntl", None):
            with self.assertRaisesRegex(documents.DocumentError, "LOCK_UNSUPPORTED"):
                documents.import_documents(self.data, self.index, ["aurora_2024.json"])
        self.assertFalse(self.index.exists())

    def test_lock_syscall_errors_have_distinct_codes_and_close_descriptors(self):
        for error, code in ((errno.EAGAIN, "INDEX_BUSY"), (errno.EACCES, "INDEX_BUSY"),
                            (errno.EIO, "INDEX_LOCK_ERROR")):
            with self.subTest(error=error):
                descriptors = []
                def failure(descriptor, operation):
                    descriptors.append(descriptor)
                    raise OSError(error, "injected flock failure")
                with patch.object(documents.fcntl, "flock", side_effect=failure):
                    with self.assertRaisesRegex(documents.DocumentError, code):
                        documents.import_documents(self.data, self.index, ["aurora_2024.json"])
                self.assertEqual(len(descriptors), 1)
                with self.assertRaises(OSError):
                    os.fstat(descriptors[0])
                self.assertFalse(self.index.exists())
        self.assertEqual(documents.import_documents(self.data, self.index, ["aurora_2024.json"]).imported, 1)


if __name__ == "__main__":
    unittest.main()
