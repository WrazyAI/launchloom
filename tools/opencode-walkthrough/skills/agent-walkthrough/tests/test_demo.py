import json
from pathlib import Path
import subprocess
import sys
from urllib.request import urlopen
import unittest

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/demo.py"


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(FIXTURE.is_file(), "synthetic demo is not implemented")

    def start(self, *options):
        process = subprocess.Popen(
            [sys.executable, str(FIXTURE), "serve", "--port", "0", *options],
            stdout=subprocess.PIPE, text=True)
        self.addCleanup(self.stop, process)
        import select
        self.assertTrue(select.select([process.stdout], [], [], 5)[0], "no ready URL")
        url = process.stdout.readline().strip()
        self.assertRegex(url, r"^http://127\.0\.0\.1:\d+$")
        return url

    @staticmethod
    def stop(process):
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        process.stdout.close()

    def test_cli_help(self):
        result = subprocess.run([sys.executable, str(FIXTURE), "--help"],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("serve", result.stdout)

    def test_health_status_and_body(self):
        with urlopen(self.start() + "/health", timeout=5) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response), {"ok": True})

    def test_panel_fixture_markup(self):
        with urlopen(self.start(), timeout=5) as response:
            body = response.read().decode()
        self.assertIn('aria-controls="sites"', body)
        self.assertIn('id="sites" hidden', body)
        self.assertIn('const broken = false;', body)

    def test_broken_mode_is_served(self):
        with urlopen(self.start("--broken"), timeout=5) as response:
            self.assertIn('const broken = true;', response.read().decode())
