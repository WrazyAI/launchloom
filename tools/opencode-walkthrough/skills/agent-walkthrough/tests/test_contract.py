"""Static guardrails; runtime discovery and behavior require a live smoke."""
from pathlib import Path
import re
import unittest

PACKAGE = Path(__file__).resolve().parents[3]


class ContractTests(unittest.TestCase):
    def load(self, name):
        path = PACKAGE / name
        self.assertTrue(path.is_file(), f"{name} not implemented")
        return path.read_text()

    def test_model_and_ordered_permissions(self):
        frontmatter = self.load("agents/walkthrough-verifier.md").split("---", 2)[1]
        self.assertIn("\nmode: subagent\n", frontmatter)
        self.assertIn("\nmodel: deeprelay/deepseek-v4.1-flash#xhigh\n", frontmatter)
        rules = re.findall(r'action: ([^,\n]+), resource: "([^"]+)", effect: (\w+)', frontmatter)
        self.assertGreater(len(rules), 1)
        self.assertIn(('"*"', "*", "deny"), rules)
        self.assertTrue(all(effect == "deny" for _, _, effect in rules))
        for action in ("execute", "browser", "shell", "subagent", "edit"):
            self.assertIn((action, "*", "deny"), rules)

    def test_agent_covers_required_boundaries(self):
        body = self.load("agents/walkthrough-verifier.md").lower()
        for text in ("untrusted data", "no fallback", "image understanding",
                     "production", "actual observation", "scenario", "no tools"):
            self.assertIn(text, body)

    def test_suggestion_is_not_execution(self):
        body = self.load("global-instructions.md").lower()
        for text in ("suggest", "wait for approval", "declined", "mandatory",
                     "browser", "api", "cli", "integration"):
            self.assertIn(text, body)

    def test_skill_delegates_against_the_approved_revision(self):
        body = self.load("skills/agent-walkthrough/SKILL.md")
        for text in ("walkthrough-verifier", "original requirements", "revision", "no fallback",
                     "check_evidence.py", "spec.md", "walkthrough.md", "harmless startup probe",
                     "effective skill source", "scoped runner", "runner/run.mjs",
                     "runner/approve.mjs", "digest", "private-run-root", "scenario"):
            self.assertIn(text, body)

    def test_scoped_runner_boundaries_are_documented(self):
        body = self.load("skills/agent-walkthrough/SKILL.md")
        for text in ("one scenario", "cannot", "screenshots", "observations",
                     "production", "approve"):
            self.assertIn(text, body)
