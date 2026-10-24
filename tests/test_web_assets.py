import json
import tempfile
import unittest
import shutil
from unittest.mock import patch
from pathlib import Path
from scripts.build_web import build
from finevidence.service import ROOT


class WebAssetTests(unittest.TestCase):
    def test_changed_child_changes_release_without_a_git_commit(self):
        # A fixed commit-only path would reuse stale child/Worker bytes while
        # developing or rebuilding a dirty checkout.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)/'source'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns(
                '.git', 'assets', 'node_modules', 'browser-artifacts', '__pycache__'))
            with patch('scripts.build_web.subprocess.check_output', return_value='f'*40):
                build(root=root)
                before=json.loads((root/'web/manifest.json').read_text())['asset_version']
                child=root/'web/engine.mjs'
                child.write_text(child.read_text()+'\n// synthetic release change\n')
                build(root=root)
                after=json.loads((root/'web/manifest.json').read_text())['asset_version']
            self.assertNotEqual(before, after)
            self.assertEqual((root/'web/assets'/after/'engine.mjs').read_bytes(), child.read_bytes())

    def test_built_document_uses_one_complete_versioned_graph(self):
        # Reusing an unversioned child/worker/data URL breaks cache isolation.
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            build(output=output)
            manifest = json.loads((output / 'manifest.json').read_text())
            release = manifest['asset_version']
            self.assertRegex(release, r'^[0-9a-f]{64}$')
            graph = output / 'assets' / release
            html = (output / 'index.html').read_text()
            self.assertIn(f'./assets/{release}/bootstrap.mjs', html)
            self.assertIn(f'./assets/{release}/styles.css', html)
            for name in ['workbench.mjs', 'engine.mjs', 'pdf-intake.mjs',
                         'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs',
                         'pdf-demo.pdf', 'bundle.json', 'manifest.json']:
                self.assertTrue((graph / name).is_file(), name)
            self.assertEqual((graph/'manifest.json').read_bytes(), (output/'manifest.json').read_bytes())
            self.assertEqual((graph/'bundle.json').read_bytes(), (output/'bundle.json').read_bytes())
            self.assertEqual((graph/'vendor/pdf.min.mjs').read_bytes(), (ROOT/'web/vendor/pdf.min.mjs').read_bytes())
            build(output=output)
            self.assertEqual(json.loads((output/'manifest.json').read_text())['asset_version'], release)
