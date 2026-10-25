"""Actual special-file startup must be bounded, classified and non-destructive."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from finevidence.review_ledger import ReviewLedger, ReviewError
from scripts.evaluate_review_path import evaluate

ROOT = Path(__file__).resolve().parents[1]

class StorePathTests(unittest.TestCase):
    def test_special_files_refuse_and_regular_controls_survive(self):
        report = evaluate()
        self.assertEqual(report['passed'], report['total'], report['rows'])

    def test_fifo_never_reaches_sqlite(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            os.mkfifo(directory / 'reviews.sqlite', 0o600)
            with patch('finevidence.review_ledger.sqlite3.connect') as connect:
                with self.assertRaisesRegex(ReviewError, '^REVIEW_STORE_PATH$'):
                    ReviewLedger(directory, 'Synthetic path operator')
                connect.assert_not_called()

    def test_cli_directory_refusal_is_classified_without_traceback(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / 'reviews.sqlite').mkdir(mode=0o700)
            env = os.environ.copy()
            env['FINEVIDENCE_REVIEW_TOKEN'] = 'synthetic-test-secret-123456789012345'
            child = subprocess.run([sys.executable, '-m', 'finevidence.server', '--port', '0',
                                    '--review-directory', str(directory), '--reviewer', 'Synthetic path operator'],
                                   cwd=ROOT, env=env, capture_output=True, text=True, timeout=10)
            self.assertEqual(child.returncode, 2, child.stderr)
            self.assertIn('REVIEW_STORE_PATH', child.stderr)
            self.assertNotIn('Traceback', child.stderr)
            self.assertNotIn(str(directory), child.stderr)
            self.assertNotIn(env['FINEVIDENCE_REVIEW_TOKEN'], child.stderr)
            self.assertTrue((directory / 'reviews.sqlite').is_dir())
