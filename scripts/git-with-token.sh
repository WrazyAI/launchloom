#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GH_TOKEN:-}" || "$#" -lt 1 ]]; then
  echo "GH_TOKEN and a Git command are required." >&2
  exit 2
fi

case "$1" in
  fetch|push|ls-remote) ;;
  *) echo "Unsupported authenticated Git command: $1" >&2; exit 2 ;;
esac

git_auth=$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=http.https://github.com/.extraheader \
GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $git_auth" \
  git "$@"
unset git_auth
