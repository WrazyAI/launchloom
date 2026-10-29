#!/usr/bin/env bash
# New-mode public-log privacy boundary.
#
# GitHub logs the stdout/stderr of every `run` step. Generation processes
# private client content, so in new mode the complete step output is captured
# to an ephemeral 0600 file on the runner and only a generic status is printed.
# The file is never uploaded and is deleted immediately. Legacy mode keeps its
# existing shell behavior and output unchanged.
set -uo pipefail

if [ "${OPERATION_ID:-}" = "" ]; then
  exec bash --noprofile --norc -eo pipefail "$1"
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
