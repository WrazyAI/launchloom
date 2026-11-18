# Independent walkthrough

## Verdict and scope
Counts of passed / failed / blocked / untested; exact environment and revision.
Requested and observed model/variant, with session metadata evidence.
If no independent reviewer session exists, write “Reviewer unavailable” and do
not claim an independent review. Name the evidence collector and independent
reviewer separately.
State remaining mandatory project gates separately.

## Steps and evidence
For each case: action, expected result, actual observation, status, evidence
link, and a caption explaining what each numbered screenshot demonstrates.
Nonvisual cases link redacted command output, API responses, or logs. Name the
host scoped runner as the collector and DeepSeek as the independent reviewer.

## Limitations and cleanup
Distinguish screenshot capture from screenshot interpretation. Never imply
visual judgment from DOM checks alone. Record skipped coverage, unavailable
tools/accounts, fixture cleanup, and any remaining processes/tabs.

## Machine-readable report
The parent writes `results.json` in the same run directory using this shape:

```json
{
  "model": "opencode/deepseek-v4.1-flash-free#max",
  "project": "synthetic-example",
  "revision": "fixture-v1",
  "environment": "approved disposable loopback fixture",
  "capabilities": {"image_understanding": false},
  "cases": [{
    "id": "flow-01",
    "assertion_type": "functional",
    "status": "untested",
    "expected": "The approved action changes the displayed state",
    "actual": "",
    "evidence": [],
    "reason": "Not executed yet"
  }]
}
```

Allowed statuses: `passed`, `failed`, `blocked`, `untested`.
Executed cases need actual observations and nonempty local evidence files.
Blocked/untested cases require a reason. Evidence paths are relative to the run
directory and must start with `evidence/`; no symlinks, parent traversal or
absolute paths. Visual verdicts require confirmed image understanding and a capture.
Run `python3 scripts/check_evidence.py <run-directory>` from the skill directory.
A valid structure is not proof that assertions are true.
