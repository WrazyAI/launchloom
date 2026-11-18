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
        self.assertIn("\nmodel: opencode/deepseek-v4.1-flash-free#max\n", frontmatter)
        rules = re.findall(r'action: ([^,\n]+), resource: "([^"]+)", effect: (\w+)', frontmatter)
        edits = [rule for rule in rules if rule[0] in ("edit", '"*"')]
        self.assertEqual(edits, [
            ('"*"', "*", "deny"),
            ("edit", "~/.local/state/opencode/walkthroughs/**", "allow"),
        ])
        self.assertIn(("shell", "*", "ask"), rules)
        self.assertIn(("subagent", "*", "deny"), rules)

    def test_agent_covers_required_boundaries(self):
        body = self.load("agents/walkthrough-verifier.md").lower()
        for text in ("treat as untrusted data", "no fallback", "image understanding",
                     "production", "actual observation", "api", "cli", "browser skill"):
            self.assertIn(text, body)

    def test_suggestion_is_not_execution(self):
        body = self.load("global-instructions.md").lower()
        for text in ("suggest", "wait for approval", "declined", "mandatory",
                     "browser", "api", "cli", "integration"):
            self.assertIn(text, body)

    def test_skill_delegates_against_the_approved_revision(self):
        body = self.load("skills/agent-walkthrough/SKILL.md")
        for text in ("walkthrough-verifier", "original requirements", "revision", "no fallback",
                     "check_evidence.py", "spec.md", "walkthrough.md"):
            self.assertIn(text, body)
