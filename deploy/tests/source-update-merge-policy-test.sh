#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
UPDATER="$ROOT_DIR/deploy/source-update.sh"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

if ! grep -Fq 'merge --no-ff --no-edit -X ours "$UPSTREAM_REF"' "$UPDATER"; then
  echo "source updater does not favor production customizations in merge conflicts" >&2
  exit 1
fi
if ! grep -Fq 'replay_official_first_customizations' "$UPDATER"; then
  echo "source updater does not replay branding on official authentication views" >&2
  exit 1
fi
if ! grep -Fq 'CURRENT_PHASE="geo_audit"' "$UPDATER" || \
  ! grep -Fq 'deploy/geo-audit.py' "$UPDATER" || \
  ! grep -Fq 'Candidate GEO verification failed; previous image restored' "$UPDATER"; then
  echo "source updater does not enforce the GEO audit before recording deployment" >&2
  exit 1
fi
if ! grep -Fq 'CURRENT_VERSION" == "$TARGET_VERSION" && -z "$(git -C "$REPO_DIR" status --porcelain)"' "$UPDATER"; then
  echo "source updater does not rebuild the current version when customizations are pending" >&2
  exit 1
fi
for updater_guard in \
  'BUILDKIT_STEP_LOG_MAX_SIZE=1048576' \
  'existing_state=$(python3' \
  'fetch_succeeded=false'; do
  if ! grep -Fq "$updater_guard" "$UPDATER"; then
    echo "source updater is missing production hardening: $updater_guard" >&2
    exit 1
  fi
done
for official_first_path in \
  'backend/internal/repository/gateway_cache.go' \
  'backend/internal/handler/grok_media.go' \
  'frontend/src/views/auth/EmailVerifyView.vue' \
  'frontend/src/views/auth/RegisterView.vue'; do
  if ! grep -Fq "\"$official_first_path\"" "$UPDATER"; then
    echo "source updater is missing official-first merge policy for $official_first_path" >&2
    exit 1
  fi
done
if [[ ! -f "$ROOT_DIR/backend/internal/repository/gateway_cache_cmcc.go" ]]; then
  echo "CMCC Seedance cache customization is not isolated from the official gateway cache" >&2
  exit 1
fi
REPO="$TEMP_DIR/repo"
git init -q -b main "$REPO"
git -C "$REPO" config user.name "Source update test"
git -C "$REPO" config user.email "source-update-test@local"

printf '%s\n' base > "$REPO/shared.txt"
printf '%s\n' base > "$REPO/official-only.txt"
git -C "$REPO" add .
git -C "$REPO" commit -q -m base
BASE=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" switch -q -c official
printf '%s\n' official > "$REPO/shared.txt"
printf '%s\n' official-change > "$REPO/official-only.txt"
git -C "$REPO" commit -qam official
OFFICIAL=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" switch -q main
printf '%s\n' local-customization > "$REPO/shared.txt"
git -C "$REPO" commit -qam customization
git -C "$REPO" merge -q --no-ff --no-edit -X ours "$OFFICIAL"

test "$(cat "$REPO/shared.txt")" = "local-customization"
test "$(cat "$REPO/official-only.txt")" = "official-change"
git -C "$REPO" merge-base --is-ancestor "$BASE" HEAD
git -C "$REPO" merge-base --is-ancestor "$OFFICIAL" HEAD
