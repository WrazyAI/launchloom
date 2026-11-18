"""Validate evidence structure, never the truth of an agent's assertions."""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

MODEL = "opencode/deepseek-v4.1-flash-free#max"


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def validate_report(report: dict, run_dir: Path) -> list[str]:
    errors = []
    if not isinstance(report, dict):
        return ["report must be an object"]
    for key in ("model", "project", "revision", "environment"):
        if not nonempty(report.get(key)):
            errors.append(f"{key}: nonempty string required")
    if report.get("model") != MODEL:
        errors.append(f"model: must be {MODEL}; fallback is not permitted")
    capabilities = report.get("capabilities")
    if not isinstance(capabilities, dict) or type(
            capabilities.get("image_understanding")) is not bool:
        errors.append("capabilities.image_understanding: boolean required")
        capabilities = {}
    cases = report.get("cases")
    if not isinstance(cases, list) or not cases:
        return errors + ["cases: nonempty array required"]
    seen = set()
    root = run_dir.resolve()
    for index, case in enumerate(cases):
        label = f"case[{index}]"
        if not isinstance(case, dict):
            errors.append(f"{label}: object required")
            continue
        for key in ("id", "expected"):
            if not nonempty(case.get(key)):
                errors.append(f"{label}.{key}: nonempty string required")
        case_id = case.get("id")
        if nonempty(case_id):
            if case_id in seen:
                errors.append(f"{label}.id: duplicate")
            seen.add(case_id)
        status = case.get("status")
        if status not in ("passed", "failed", "blocked", "untested"):
            errors.append(f"{label}.status: invalid")
        assertion = case.get("assertion_type")
        if assertion not in ("functional", "visual"):
            errors.append(f"{label}.assertion_type: invalid")
        if not isinstance(case.get("actual"), str):
            errors.append(f"{label}.actual: string required")
        if status in ("passed", "failed") and not nonempty(case.get("actual")):
            errors.append(f"{label}.actual: observations required")
        if status in ("blocked", "untested") and not nonempty(case.get("reason")):
            errors.append(f"{label}.reason: explain unavailable or skipped coverage")
        if status == "passed" and assertion == "visual" and not capabilities.get(
                "image_understanding"):
            errors.append(f"{label}: visual pass without image understanding")
        evidence = case.get("evidence")
        if not isinstance(evidence, list):
            errors.append(f"{label}.evidence: array required")
            continue
        if status in ("passed", "failed") and not evidence:
            errors.append(f"{label}.evidence: evidence required")
        for name in evidence:
            try:
                if not nonempty(name):
                    raise ValueError("nonempty relative path required")
                relative = Path(name)
                if relative.is_absolute() or ".." in relative.parts:
                    raise ValueError("absolute paths and parent traversal forbidden")
                target = (root / relative).resolve()
                target.relative_to(root)
                if not target.is_file() or target.stat().st_size == 0:
                    raise ValueError("nonempty evidence file required")
            except (OSError, ValueError, RuntimeError) as error:
                errors.append(f"{label}.evidence: invalid path ({error})")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_directory", type=Path)
    args = parser.parse_args()
    try:
        report = json.loads((args.run_directory / "results.json").read_text())
        errors = validate_report(report, args.run_directory)
    except (OSError, ValueError, RecursionError) as error:
        errors = [f"results.json: cannot read valid JSON ({error})"]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    counts = Counter(case["status"] for case in report["cases"])
    print("Valid evidence structure only; not a correctness verdict: "
          + ", ".join(f"{key}={counts[key]}" for key in
                      ("passed", "failed", "blocked", "untested")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
