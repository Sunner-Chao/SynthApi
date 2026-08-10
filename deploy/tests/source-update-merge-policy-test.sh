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
