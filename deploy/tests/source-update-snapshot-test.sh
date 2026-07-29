#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=../source-update-git.sh
source "$ROOT_DIR/deploy/source-update-git.sh"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
REPO_DIR="$TEMP_DIR/repository"

git init -q -b main "$REPO_DIR"
git -C "$REPO_DIR" config user.name "Snapshot Test"
git -C "$REPO_DIR" config user.email "snapshot-test@example.invalid"
printf '%s\n' "original" > "$REPO_DIR/tracked.txt"
git -C "$REPO_DIR" add tracked.txt
git -C "$REPO_DIR" commit -q -m "initial"

printf '%s\n' "customized" > "$REPO_DIR/tracked.txt"
mkdir -p "$REPO_DIR/custom"
printf '%s\n' "new customization" > "$REPO_DIR/custom/untracked.txt"

SNAPSHOT_COMMIT=$(snapshot_production_changes "$REPO_DIR" "1.2.3" "snapshot-test-operation")
test -n "$SNAPSHOT_COMMIT"
test "$SNAPSHOT_COMMIT" = "$(git -C "$REPO_DIR" rev-parse HEAD)"
test -z "$(git -C "$REPO_DIR" status --porcelain)"
test "$(git -C "$REPO_DIR" show HEAD:tracked.txt)" = "customized"
test "$(git -C "$REPO_DIR" show HEAD:custom/untracked.txt)" = "new customization"
test "$(git -C "$REPO_DIR" log -1 --format=%s)" = "chore(custom): snapshot production changes before v1.2.3"
git -C "$REPO_DIR" log -1 --format=%B | grep -Fq "Source update operation: snapshot-test-operation"

HEAD_BEFORE=$(git -C "$REPO_DIR" rev-parse HEAD)
test -z "$(snapshot_production_changes "$REPO_DIR" "1.2.3" "clean-retry")"
test "$HEAD_BEFORE" = "$(git -C "$REPO_DIR" rev-parse HEAD)"
