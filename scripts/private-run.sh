#!/usr/bin/env bash
# New-mode public-log privacy boundary.
#
# GitHub logs the stdout/stderr of every `run` step. Generation processes
# private client content, so in new mode the complete step output is captured
# to an ephemeral 0600 file on the runner and only a generic status is printed.
# The file is never uploaded and is deleted immediately. Legacy mode preserves
# its live output but keeps the same ephemeral file long enough to extract a
# bounded, scrubbed failure excerpt before deleting it.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
runtime_dir="${RUNNER_TEMP:-/tmp}"
evidence="$runtime_dir/launchloom-step-failure.json"

if [ "${OPERATION_ID:-}" = "" ]; then
  umask 077
  out="$runtime_dir/launchloom-legacy-out-$$-${RANDOM}.log"
  err="$runtime_dir/launchloom-legacy-err-$$-${RANDOM}.log"
  log="$runtime_dir/launchloom-legacy-step-$$-${RANDOM}.log"
  : >"$out"; : >"$err"
  exec 3> >(tee "$out")
  exec 4> >(tee "$err" >&2)
  set +e
  bash --noprofile --norc -eo pipefail "$1" >&3 2>&4
  status=$?
  exec 3>&- 4>&-
  wait
  if [ "$status" -ne 0 ] && [ ! -s "$evidence" ] && command -v node >/dev/null 2>&1; then
    cat "$out" "$err" >"$log" 2>/dev/null || true
    node "$script_dir/capture-step-failure.mjs" --log "$log" --status "$status" --out "$evidence" || true
  fi
  rm -f "$out" "$err" "$log"
  exit "$status"
fi

umask 077
log="${RUNNER_TEMP:-/tmp}/launchloom-private-step-$$-${RANDOM}.log"
summary="${RUNNER_TEMP:-/tmp}/launchloom-private-summary-$$-${RANDOM}.md"
: > "$summary"
# Some tools write to the runner-provided step summary. Redirect that channel
# to a private file in new mode so no script can publish content to the public
# run page. Legacy mode is untouched.
export GITHUB_STEP_SUMMARY="$summary"
bash --noprofile --norc -eo pipefail "$1" >"$log" 2>&1
status=$?
rm -f "$log" "$summary"
if [ "$status" -eq 0 ]; then
  echo "private_step=ok"
  exit 0
fi
echo "private_step=failed status=$status"
exit "$status"
