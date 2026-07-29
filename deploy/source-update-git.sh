#!/usr/bin/env bash

# Commits all non-ignored production changes so the isolated official merge can
# preserve them and the backup repository can receive the exact deployed source.
snapshot_production_changes() {
  local repo_dir=$1
  local target_version=$2
  local operation_id=$3

  if [[ -z "$(git -C "$repo_dir" status --porcelain)" ]]; then
    return 0
  fi
  if [[ -n "$(git -C "$repo_dir" ls-files --unmerged)" ]]; then
    printf '%s\n' "Production repository has unresolved Git conflicts" >&2
    return 1
  fi
  if ! git -C "$repo_dir" add -A; then
    printf '%s\n' "Failed to stage local production changes" >&2
    return 1
  fi
  if git -C "$repo_dir" diff --cached --quiet; then
    printf '%s\n' "Git reported local changes but none could be snapshotted" >&2
    return 1
  fi
  if ! git -C "$repo_dir" \
    -c user.name="SynthAPI Source Updater" \
    -c user.email="source-update@synthapi.local" \
    -c commit.gpgsign=false \
    -c core.hooksPath=/dev/null \
    commit \
    -m "chore(custom): snapshot production changes before v${target_version}" \
    -m "Source update operation: ${operation_id}" >/dev/null; then
    printf '%s\n' "Failed to commit local production changes" >&2
    return 1
  fi
  if [[ -n "$(git -C "$repo_dir" status --porcelain)" ]]; then
    printf '%s\n' "Production repository is still dirty after the snapshot commit" >&2
    return 1
  fi

  git -C "$repo_dir" rev-parse HEAD
}
