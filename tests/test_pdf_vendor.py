"""Pinned third-party artifacts; no downloads or PDF parsing in Python runtime."""
import hashlib,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PDFVendorTests(unittest.TestCase):
    def test_pinned_artifacts_and_license(self):
        expected = {'pdf.min.mjs': '57456c8e0c81e46be31174b499ef77f2b9f5ee46d04412ba627320a36755d4c2', 'pdf.worker.min.mjs': '9536359f1b8367850d485731ca1d5e45c159a7b7a0912325e539937aa21ceb18', 'PDFJS-LICENSE': '0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594'}
        manifest=json.loads((ROOT/'web/vendor/manifest.json').read_text())
        self.assertEqual(manifest['version'],'6.4.299')
        self.assertEqual(manifest['license'],'Apache-2.0')
        self.assertEqual(manifest['files'],expected)
        for name,digest in expected.items():
            self.assertEqual(hashlib.sha256((ROOT/'web/vendor'/name).read_bytes()).hexdigest(),digest)
    def test_demo_is_explicit_generated_fixture(self):
        raw=(ROOT/'web/pdf-demo.pdf').read_bytes()
        self.assertEqual(raw,(ROOT/'tests/fixtures/pdf/text.pdf').read_bytes())
        self.assertIn(b'SYNTHETIC',raw)
        manifest=json.loads((ROOT/'tests/fixtures/pdf/manifest.json').read_text())
        for name,digest in manifest['files'].items():
            self.assertEqual(hashlib.sha256((ROOT/'tests/fixtures/pdf'/name).read_bytes()).hexdigest(),digest)
