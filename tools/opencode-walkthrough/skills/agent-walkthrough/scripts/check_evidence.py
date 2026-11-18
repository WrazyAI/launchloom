"""Validate evidence structure, never the truth of an agent's assertions."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import stat
import sys

MODEL = "opencode/deepseek-v4.1-flash-free#max"
MAX_REPORT_BYTES = 1024 * 1024
IMAGE_SUFFIXES = {".png", ".webp", ".jpeg", ".jpg"}
SELECTION_KEYS = ["agent", "digest", "model", "providerID", "scenario", "sessionID", "variant"]


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def safe_evidence(root: Path, name):
    if not nonempty(name):
        raise ValueError("nonempty relative path required")
    relative = Path(name)
    if (relative.is_absolute() or ".." in relative.parts
            or len(relative.parts) < 2 or relative.parts[0] != "evidence"):
        raise ValueError("expected a relative path inside evidence/")
    target = root
    for part in relative.parts:
        target /= part
        if target.is_symlink():
            raise ValueError("symlinked evidence is not allowed")
    if not target.is_file() or target.stat().st_size == 0:
        raise ValueError("nonempty evidence file required")
    return target


def validate_report(report: dict, run_dir: Path) -> list[str]:
    errors = []
    if not isinstance(report, dict):
        return ["report must be an object"]
    for key in ("model", "project", "revision", "environment"):
        if not nonempty(report.get(key)):
            errors.append(f"{key}: nonempty string required")
    if report.get("model") != MODEL:
        errors.append(f"model: must be {MODEL}; fallback is not permitted")
    if not nonempty(report.get("digest")) or len(report["digest"]) != 64:
        errors.append("digest: 64-character approval digest required")
    selection = report.get("selection")
    if not isinstance(selection, dict) or sorted(selection) != SELECTION_KEYS:
        errors.append("selection: exact child selection artifact required")
    else:
        if (selection.get("agent") != "walkthrough-verifier" or
                selection.get("providerID") != "opencode" or
                selection.get("model") != "deepseek-v4.1-flash-free" or
                selection.get("variant") != "max" or
                selection.get("digest") != report.get("digest") or
                not nonempty(selection.get("scenario")) or
                not isinstance(selection.get("sessionID"), str) or
                not re.fullmatch(r"ses_[A-Za-z0-9]+", selection["sessionID"])):
            errors.append("selection: identity or digest mismatch")
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
        visual_verdict = status in ("passed", "failed") and assertion == "visual"
        evidence = case.get("evidence")
        if not isinstance(evidence, list):
            errors.append(f"{label}.evidence: array required")
            continue
        if status in ("passed", "failed") and not evidence:
            errors.append(f"{label}.evidence: evidence required")
        has_capture = False
        for name in evidence:
            try:
                target = safe_evidence(root, name)
                if target.suffix.lower() in IMAGE_SUFFIXES:
                    with target.open("rb") as image:
                        has_capture |= image.read(8) == b"\x89PNG\r\n\x1a\n"
            except (OSError, ValueError, RuntimeError) as error:
                errors.append(f"{label}.evidence: invalid path ({error})")
        if visual_verdict:
            if not capabilities.get("image_understanding"):
                errors.append(f"{label}: visual verdict without image understanding")
            capability = capabilities.get("image_understanding_evidence")
            try:
                safe_evidence(root, capability)
            except (OSError, ValueError, RuntimeError) as error:
                errors.append(f"{label}: image capability evidence invalid ({error})")
            if not has_capture:
                errors.append(f"{label}: visual verdict requires a PNG screenshot")
    return errors


def read_report(run_dir: Path):
    fd = os.open(run_dir / "results.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as report:
        attributes = os.fstat(report.fileno())
        if not stat.S_ISREG(attributes.st_mode) or attributes.st_size > MAX_REPORT_BYTES:
            raise ValueError("report must be a regular file of at most 1 MiB")
        content = report.read(MAX_REPORT_BYTES + 1)
        if len(content) > MAX_REPORT_BYTES:
            raise ValueError("report exceeds 1 MiB")
        return json.loads(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_directory", type=Path)
    args = parser.parse_args()
    try:
        report = read_report(args.run_directory)
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
