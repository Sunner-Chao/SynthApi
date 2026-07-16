#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_HOST="${SYNTHAPI_BUILD_HOST:-synthapi-shanghai-build}"
REMOTE_DIR="${SYNTHAPI_BUILD_DIR:-/home/ubuntu/demo/SynthApi}"
REMOTE_OUTPUT_ROOT="${SYNTHAPI_BUILD_OUTPUT_DIR:-/home/ubuntu/demo/SynthApi-build-output}"
BUILD_ID="${SYNTHAPI_BUILD_ID:-$(date +%Y%m%d-%H%M%S)}"
INSTALL_DEPS="${SYNTHAPI_INSTALL_DEPS:-1}"

RSYNC_EXCLUDES=(
  '--exclude=/.git/'
  '--exclude=/.env'
  '--exclude=/.env.postgres'
  '--exclude=/.env.sqlite.backup'
  '--exclude=*.db'
  '--exclude=*.db-*'
  '--exclude=*.sqlite'
  '--exclude=*.sqlite3'
  '--exclude=*.log'
  '--exclude=logs/'
  '--exclude=upload/'
  '--exclude=data/'
  '--exclude=**/__pycache__/'
  '--exclude=*.pyc'
  '--exclude=**/.cache/'
  '--exclude=**/.rsbuild/'
  '--exclude=web/node_modules/'
  '--exclude=web/default/node_modules/'
  '--exclude=web/classic/node_modules/'
  '--exclude=web/default/dist/'
  '--exclude=web/classic/dist/'
  '--exclude=electron/node_modules/'
  '--exclude=electron/dist/'
  '--exclude=/synthapi'
  '--exclude=/new-api'
  '--exclude=/one-api'
  '--exclude=/synthapi-server*'
  '--exclude=/user_wallet_ranking*.csv'
)

usage() {
  cat <<'EOF'
Usage: scripts/remote-build-shanghai.sh <command>

Commands:
  status  Show Shanghai repository status with git_shell_linux.
  sync    Back up changed Shanghai files, then mirror production source there.
  build   Build both frontends and the Go binary on Shanghai, then download it.
  all     Run sync followed by build.

Environment:
  SYNTHAPI_BUILD_HOST        SSH host alias (default: synthapi-shanghai-build)
  SYNTHAPI_BUILD_DIR         Shanghai source directory
  SYNTHAPI_BUILD_OUTPUT_DIR  Shanghai artifact directory
  SYNTHAPI_BUILD_ID          Artifact suffix (default: current timestamp)
  SYNTHAPI_INSTALL_DEPS=0    Skip bun install --frozen-lockfile before building
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

check_remote() {
  ssh -o BatchMode=yes "$REMOTE_HOST" "test -d '$REMOTE_DIR/.git'"
}

show_status() {
  check_remote
  ssh "$REMOTE_HOST" "cd '$REMOTE_DIR' && GIT_PAGER=cat ./git_shell_linux/git-quick-status.sh --recent-commits 3"
}

sync_source() {
  require_command rsync
  check_remote

  local backup_dir
  backup_dir="$(dirname "$REMOTE_DIR")/SynthApi-sync-backups/$BUILD_ID"
  ssh "$REMOTE_HOST" "mkdir -p '$backup_dir'"

  rsync -rlptDz --delete-delay --omit-dir-times --itemize-changes \
    --backup --backup-dir="$backup_dir" \
    "${RSYNC_EXCLUDES[@]}" \
    "$PROJECT_ROOT/" "$REMOTE_HOST:$REMOTE_DIR/"

  local verification
  verification="$(
    rsync -rlcn --delete --omit-dir-times --itemize-changes \
      "${RSYNC_EXCLUDES[@]}" \
      "$PROJECT_ROOT/" "$REMOTE_HOST:$REMOTE_DIR/"
  )"
  if [[ -n "$verification" ]]; then
    printf 'Source verification failed; remaining differences:\n%s\n' "$verification" >&2
    exit 1
  fi

  printf 'Source sync verified. Shanghai backup: %s:%s\n' "$REMOTE_HOST" "$backup_dir"
  show_status
}

build_remote() {
  check_remote

  local remote_output_dir="$REMOTE_OUTPUT_ROOT/$BUILD_ID"
  local artifact_name="synthapi-server-$BUILD_ID"
  local remote_artifact="$remote_output_dir/$artifact_name"
  local local_archive="$PROJECT_ROOT/$artifact_name.gz"

  ssh "$REMOTE_HOST" bash -s -- \
    "$REMOTE_DIR" "$remote_output_dir" "$artifact_name" "$INSTALL_DEPS" <<'REMOTE_BUILD'
set -euo pipefail

project_root="$1"
output_dir="$2"
artifact_name="$3"
install_deps="$4"

export PATH="$HOME/.bun/bin:/usr/local/go/bin:$PATH"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
export GOMAXPROCS="${GOMAXPROCS:-4}"

mkdir -p "$output_dir"

if [[ "$install_deps" == "1" ]]; then
  cd "$project_root/web"
  bun install --frozen-lockfile
fi

cd "$project_root/web/default"
bun run build

cd "$project_root/web/classic"
bun run build

cd "$project_root"
go build -trimpath -ldflags="-s -w" -o "$output_dir/$artifact_name" .
gzip -1 -kf "$output_dir/$artifact_name"
sha256sum "$output_dir/$artifact_name" "$output_dir/$artifact_name.gz"
REMOTE_BUILD

  scp "$REMOTE_HOST:$remote_artifact.gz" "$local_archive"

  local remote_hash remote_binary_hash local_hash
  remote_hash="$(ssh "$REMOTE_HOST" "sha256sum '$remote_artifact.gz'" | awk '{print $1}')"
  remote_binary_hash="$(ssh "$REMOTE_HOST" "sha256sum '$remote_artifact'" | awk '{print $1}')"
  local_hash="$(sha256sum "$local_archive" | awk '{print $1}')"
  if [[ "$remote_hash" != "$local_hash" ]]; then
    printf 'Artifact hash mismatch: remote=%s local=%s\n' "$remote_hash" "$local_hash" >&2
    exit 1
  fi
  gzip -t "$local_archive"

  printf 'Build artifact downloaded and verified: %s\n' "$local_archive"
  printf 'Archive SHA256: %s\n' "$local_hash"
  printf 'Binary SHA256: %s\n' "$remote_binary_hash"
}

main() {
  case "${1:-}" in
    status)
      show_status
      ;;
    sync)
      sync_source
      ;;
    build)
      build_remote
      ;;
    all)
      sync_source
      build_remote
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

main "$@"
