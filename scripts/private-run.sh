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
bash --noprofile --norc -eo pipefail "$1" >"$log" 2>&1
status=$?
if [ "$status" -eq 0 ]; then
  rm -f "$log"
  echo "private_step=ok"
  exit 0
fi
rm -f "$log"
echo "private_step=failed status=$status"
exit "$status"
