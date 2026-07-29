#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
UPDATER="$ROOT_DIR/deploy/source-update.sh"

SYNTHAPI_REPO_DIR="$ROOT_DIR" \
SYNTHAPI_UPDATE_GUARD_FILE="$ROOT_DIR/deploy/source-update-guards.txt" \
  "$UPDATER" --check-guards

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
printf '%s\n' 'Dockerfile|literal-that-must-not-exist' > "$TEMP_DIR/bad-guards.txt"

if SYNTHAPI_REPO_DIR="$ROOT_DIR" \
  SYNTHAPI_UPDATE_GUARD_FILE="$TEMP_DIR/bad-guards.txt" \
  "$UPDATER" --check-guards >/dev/null 2>&1; then
  echo "source updater accepted a missing customization guard" >&2
  exit 1
fi
