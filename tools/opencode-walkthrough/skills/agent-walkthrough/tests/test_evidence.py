"""Exercise real report validation and its CLI, not source text."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/check_evidence.py"


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.is_file(), "evidence validator is not implemented")
        spec = importlib.util.spec_from_file_location("check_evidence", SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.run_dir = Path(self.temp.name)
        (self.run_dir / "evidence").mkdir()
        (self.run_dir / "evidence/output.txt").write_text("actual: ready\n")
        digest = "a" * 64
        self.report = {
            "model": "opencode/deepseek-v4.1-flash-free#max",
            "digest": digest,
            "selection": {
                "agent": "walkthrough-verifier", "providerID": "opencode",
                "model": "deepseek-v4.1-flash-free", "variant": "max",
                "sessionID": "ses_test", "scenario": "cli-ready", "digest": digest,
            },
            "project": "synthetic-demo",
            "revision": "fixture-v1",
            "environment": "loopback disposable fixture",
            "capabilities": {"image_understanding": False},
            "cases": [{
                "id": "cli-ready", "status": "passed", "assertion_type": "functional",
                "expected": "CLI prints ready", "actual": "CLI printed ready",
                "evidence": ["evidence/output.txt"],
            }],
        }

    def errors(self, report=None):
        return self.module.validate_report(
            self.report if report is None else report, self.run_dir)

    def cli(self):
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(self.run_dir)],
            text=True, capture_output=True, timeout=5)

    def test_four_statuses_have_distinct_valid_contracts(self):
        for status in ("passed", "failed", "blocked", "untested"):
            with self.subTest(status=status):
                report = copy.deepcopy(self.report)
                case = report["cases"][0]
                case["status"] = status
                if status in ("blocked", "untested"):
                    case.update(actual="", evidence=[], reason="fixture not available")
                self.assertEqual(self.errors(report), [])

    def test_rejects_missing_empty_or_wrong_type_metadata(self):
        for key in ("model", "project", "revision", "environment", "capabilities", "cases",
                    "digest", "selection"):
            for value in (None, "", [], 123):
                with self.subTest(key=key, value=value):
                    report = copy.deepcopy(self.report)
                    report[key] = value
                    self.assertTrue(self.errors(report))
            report = copy.deepcopy(self.report)
            del report[key]
            self.assertTrue(self.errors(report))
        self.assertTrue(self.errors([]))

    def test_rejects_model_family_variant_and_provider_substitutions(self):
        for model in ("deepseek", "opencode/deepseek-v4.1-flash-free#high",
                      "deeprelay/deepseek-v4.1-flash#xhigh"):
            self.report["model"] = model
            self.assertTrue(self.errors())

    def test_rejects_unknown_or_missing_case_fields(self):
        for key in ("id", "status", "assertion_type", "expected", "actual", "evidence"):
            report = copy.deepcopy(self.report)
            del report["cases"][0][key]
            self.assertTrue(self.errors(report), key)
        for key, value in (("status", "green"), ("assertion_type", "guess"),
                           ("actual", ""), ("expected", ""), ("id", ""),
                           ("evidence", []), ("evidence", "evidence/output.txt")):
            report = copy.deepcopy(self.report)
            report["cases"][0][key] = value
            self.assertTrue(self.errors(report), key)
        self.report["cases"] = [None]
        self.assertTrue(self.errors())

    def test_blocked_and_untested_require_reason(self):
        for status in ("blocked", "untested"):
            self.report["cases"][0]["status"] = status
            self.assertTrue(self.errors())

    def test_selection_identity_and_digest_are_required(self):
        for key, value in (
            ("agent", "general"), ("providerID", "other"), ("model", "deepseek-v4.1-flash"),
            ("variant", "high"), ("digest", "0" * 64), ("sessionID", "bad"),
            ("scenario", ""),
        ):
            with self.subTest(key=key):
                report = copy.deepcopy(self.report)
                report["selection"][key] = value
                self.assertTrue(self.errors(report))
        for name in ("digest", "selection"):
            report = copy.deepcopy(self.report)
            del report[name]
            self.assertTrue(self.errors(report))

    def test_duplicate_case_ids_are_rejected(self):
        self.report["cases"].append(copy.deepcopy(self.report["cases"][0]))
        self.assertTrue(self.errors())

    def test_visual_pass_needs_boolean_image_understanding(self):
        self.report["cases"][0]["assertion_type"] = "visual"
        self.assertTrue(self.errors())
        self.report["capabilities"]["image_understanding"] = "yes"
        self.assertTrue(self.errors())
        self.report["capabilities"]["image_understanding"] = True
        (self.run_dir / "evidence/capture.png").write_bytes(b"\x89PNG\r\n\x1a\nstub")
        (self.run_dir / "evidence/image-capability.json").write_text('{"probe":"passed"}')
        self.report["capabilities"]["image_understanding_evidence"] = "evidence/image-capability.json"
        self.report["cases"][0]["evidence"] = ["evidence/capture.png"]
        self.assertEqual(self.errors(), [])

    def test_visual_failure_requires_image_understanding_and_capture(self):
        self.report["cases"][0].update(assertion_type="visual", status="failed")
        self.assertTrue(self.errors())
        self.report["capabilities"]["image_understanding"] = True
        self.assertTrue(self.errors(), "a text log is not screenshot evidence")

    def test_spec_report_and_internal_symlinks_are_not_evidence(self):
        for name in ("spec.md", "results.json", "walkthrough.md"):
            (self.run_dir / name).write_text("not an observation")
            self.report["cases"][0]["evidence"] = [name]
            self.assertTrue(self.errors())
        (self.run_dir / "evidence/alias.txt").symlink_to("output.txt")
        self.report["cases"][0]["evidence"] = ["evidence/alias.txt"]
        self.assertTrue(self.errors())

    def test_cli_rejects_symlink_fifo_and_oversized_report(self):
        import os
        report = self.run_dir / "results.json"
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "report.json"
            target.write_text(json.dumps(self.report))
            report.symlink_to(target)
            self.assertEqual(self.cli().returncode, 1)
        report.unlink()
        os.mkfifo(report)
        self.assertEqual(self.cli().returncode, 1)
        report.unlink()
        report.write_text(json.dumps(self.report) + " " * (1024 * 1024))
        self.assertEqual(self.cli().returncode, 1)

    def test_nonexistent_empty_directory_and_unsafe_evidence_rejected(self):
        (self.run_dir / "empty.txt").touch()
        for path in ("missing.txt", "empty.txt", "evidence", "/etc/hosts",
                     "../escape.txt", "evidence/../../escape.txt", "", 1):
            with self.subTest(path=path):
                self.report["cases"][0]["evidence"] = [path]
                self.assertTrue(self.errors())

    def test_symlink_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "private.txt"
            target.write_text("must not become evidence")
            (self.run_dir / "escape").symlink_to(target)
            self.report["cases"][0]["evidence"] = ["escape"]
            self.assertTrue(self.errors())

    def test_cli_distinguishes_valid_structure_from_passing_outcome(self):
        self.report["cases"][0]["status"] = "blocked"
        self.report["cases"][0]["reason"] = "unavailable fixture"
        (self.run_dir / "results.json").write_text(json.dumps(self.report))
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("blocked", result.stdout)
        self.assertIn("structure", result.stdout.lower())
        self.assertNotIn("all passed", result.stdout.lower())

    def test_cli_handles_missing_malformed_and_invalid_json(self):
        for data in (None, "{", "null", '{"cases": []}'):
            if data is not None:
                (self.run_dir / "results.json").write_text(data)
            result = self.cli()
            self.assertEqual(result.returncode, 1)
            self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
