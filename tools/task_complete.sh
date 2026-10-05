#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${REPO_ROOT}/.collab"
LOG_FILE="${LOG_DIR}/task-complete.log"

MESSAGE="${*:-Task completed}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
SHA="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "unknown")"

mkdir -p "${LOG_DIR}"
printf "%s | branch=%s | sha=%s | %s\n" "${TIMESTAMP}" "${BRANCH}" "${SHA}" "${MESSAGE}" >> "${LOG_FILE}"

printf "Task complete logged.\n"
printf -- "- message: %s\n" "${MESSAGE}"
printf -- "- branch: %s\n" "${BRANCH}"
printf -- "- commit: %s\n" "${SHA}"
printf -- "- log: %s\n" "${LOG_FILE}"
