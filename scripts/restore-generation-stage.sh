#!/usr/bin/env bash
# Restore workflow state from the PRIVATE per-client repository.
# GitHub Actions jobs use fresh runners; never upload intake data or creative
# evidence as artifacts from the public LaunchLoom repository.
set -euo pipefail

CLIENT_REPO="${1:?Usage: restore-generation-stage.sh <private-client-repo> <pages-project>}"
CLIENT_PROJECT="${2:?Missing Pages project}"
EXPECTED_SHA="${3:-}"
if [ -n "$EXPECTED_SHA" ] && ! [[ "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Invalid expected private checkpoint commit." >&2
  exit 1
fi
case "$CLIENT_REPO" in
  WrazyAI/launchloom-*) ;;
  *) echo "Refusing to restore from a non-client repository." >&2; exit 1 ;;
esac
[[ "$CLIENT_PROJECT" =~ ^launchloom-[a-z0-9-]+$ ]] || {
  echo "Invalid Pages project identifier." >&2
  exit 1
}
: "${RUNNER_TEMP:?Missing GitHub runner temp directory}"
: "${GITHUB_OUTPUT:?Missing GitHub step output file}"
: "${GITHUB_ORG_TOKEN:?Missing GitHub organization token}"

CLIENT_DIR="$RUNNER_TEMP/$CLIENT_PROJECT"
if [ -e "$CLIENT_DIR" ]; then
  echo "A workspace for this client already exists." >&2
  exit 1
fi
gh repo clone "$CLIENT_REPO" "$CLIENT_DIR" -- --branch review/initial --depth 1
ACTUAL_SHA=$(git -C "$CLIENT_DIR" rev-parse HEAD)
if [ -n "$EXPECTED_SHA" ] && [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "::error title=Private stage checkpoint moved::Expected $EXPECTED_SHA, found $ACTUAL_SHA; refusing to run on changed client source." >&2
  exit 1
fi

git -C "$CLIENT_DIR" config user.name "LaunchLoom"
git -C "$CLIENT_DIR" config user.email "automation@launchloom.app"
git -C "$CLIENT_DIR" remote set-url origin \
  "https://x-access-token:${GITHUB_ORG_TOKEN}@github.com/$CLIENT_REPO.git"

# The source of truth is committed on the client's PRIVATE review branch.
for entry in \
  'src/site.config.json:site.config.json' \
  '.launchloom/seo-research.json:seo-research.json' \
  '.launchloom/seo-map.md:seo-map.md' \
  '.launchloom/business-enrichment.json:business-enrichment.json' \
  '.launchloom/canonical-site-brief.json:canonical-site-brief.json' \
  '.launchloom/inspiration-pack.json:inspiration-pack.json' \
  '.launchloom/reasoning-preflight.json:reasoning-preflight.json' \
  '.launchloom/site-config-usage.json:site-config-usage.json' \
  '.launchloom/reference-dna-usage.json:reference-dna-usage.json' \
  '.launchloom/seo-research-email.txt:seo-research-email.txt'; do
  source_path="${entry%%:*}"
  destination_path="${entry#*:}"
  if [ -f "$CLIENT_DIR/$source_path" ]; then
    cp "$CLIENT_DIR/$source_path" "/tmp/$destination_path"
  fi
done

test -s /tmp/site.config.json || { echo "Private client configuration is missing." >&2; exit 1; }
test -s /tmp/inspiration-pack.json || { echo "Private inspiration pack is missing." >&2; exit 1; }

if [ -d "$CLIENT_DIR/.launchloom/generated-experiences" ]; then
  mkdir -p /tmp/generated-experiences
  cp -R "$CLIENT_DIR/.launchloom/generated-experiences/." /tmp/generated-experiences/
fi
if [ "${REUSE_AUTHORED_CANDIDATES:-false}" = "true" ]; then
  test -d /tmp/generated-experiences || { echo "Reusable private candidates are missing." >&2; exit 1; }
  mkdir -p "$RUNNER_TEMP/reusable-authored-candidates"
  cp -R /tmp/generated-experiences/. "$RUNNER_TEMP/reusable-authored-candidates/"
fi
if [ "${QA_REPAIR_EXPERIMENT:-false}" = "true" ]; then
  test -f "$CLIENT_DIR/.launchloom/generated-assets.json" || { echo "Frozen QA manifest is missing." >&2; exit 1; }
  test -d "$CLIENT_DIR/public/images/generated" || { echo "Frozen QA images are missing." >&2; exit 1; }
  mkdir -p "$RUNNER_TEMP/frozen-qa-assets/images"
  cp "$CLIENT_DIR/.launchloom/generated-assets.json" "$RUNNER_TEMP/frozen-qa-assets/manifest.json"
  cp -R "$CLIENT_DIR/public/images/generated/." "$RUNNER_TEMP/frozen-qa-assets/images/"
fi
printf 'dir=%s\n' "$CLIENT_DIR" >> "$GITHUB_OUTPUT"
echo "Restored private client review branch; no public artifacts or runner state shared."
