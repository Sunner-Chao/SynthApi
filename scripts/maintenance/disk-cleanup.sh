#!/usr/bin/env bash

set -Eeuo pipefail
umask 027

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
export LC_ALL=C

readonly APP_DIR="/home/ubuntu/demo/SynthApi"
readonly APP_BINARY="${APP_DIR}/synthapi-server-new"
readonly LOCK_DIR="/run/synthapi-maintenance"
readonly LOCK_FILE="${LOCK_DIR}/cleanup.lock"
readonly DEFAULT_THRESHOLD_BYTES=$((5 * 1024 * 1024 * 1024))
readonly DEFAULT_TARGET_BYTES=$((7 * 1024 * 1024 * 1024))
# Keep the inspection bounded without skipping normal release history. A full
# release is roughly 100 MiB, so the limit remains far below an unbounded scan.
readonly MAX_BINARY_CANDIDATES=512

THRESHOLD_BYTES="${THRESHOLD_BYTES:-${DEFAULT_THRESHOLD_BYTES}}"
TARGET_BYTES="${TARGET_BYTES:-${DEFAULT_TARGET_BYTES}}"
MIN_AGE_MINUTES="${MIN_AGE_MINUTES:-120}"
BINARY_MIN_AGE_SECONDS="${BINARY_MIN_AGE_SECONDS:-900}"
DRY_RUN=0
FORCE=0
INSPECT_UID=""
INSPECT_GID=""

log() {
  printf 'synthapi-disk-cleanup: %s\n' "$*"
}

usage() {
  cat <<'EOF'
Usage: synthapi-disk-cleanup [--dry-run] [--force]

  --dry-run  Show the allowlisted paths and commands without deleting anything.
  --force    Run the cleanup plan even when free space is above the trigger.
EOF
}

for argument in "$@"; do
  case "${argument}" in
    --dry-run)
      DRY_RUN=1
      ;;
    --force)
      FORCE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "unknown argument: ${argument}"
      usage >&2
      exit 2
      ;;
  esac
done

if (( EUID != 0 )); then
  log "must run as root"
  exit 1
fi

for value_name in THRESHOLD_BYTES TARGET_BYTES MIN_AGE_MINUTES BINARY_MIN_AGE_SECONDS; do
  value="${!value_name}"
  if [[ ! "${value}" =~ ^[0-9]+$ ]]; then
    log "${value_name} must be a non-negative integer"
    exit 2
  fi
done

if (( TARGET_BYTES < THRESHOLD_BYTES )); then
  log "TARGET_BYTES must be greater than or equal to THRESHOLD_BYTES"
  exit 2
fi

if [[ -L "${LOCK_DIR}" ]]; then
  log "unsafe lock directory: ${LOCK_DIR} is a symbolic link"
  exit 1
fi
if [[ ! -e "${LOCK_DIR}" ]]; then
  mkdir -m 0700 -- "${LOCK_DIR}"
fi
lock_dir_metadata="$(stat -c '%u:%a' "${LOCK_DIR}" 2>/dev/null || true)"
if [[ ! -d "${LOCK_DIR}" || "${lock_dir_metadata}" != "0:700" || -L "${LOCK_FILE}" ]]; then
  log "unsafe lock directory or lock file; refusing to continue"
  exit 1
fi

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "another cleanup is already running; exiting"
  exit 0
fi

available_bytes() {
  local available
  available="$(df -B1 --output=avail / | awk 'NR == 2 {gsub(/[[:space:]]/, "", $0); print $0}')"
  [[ "${available}" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "${available}"
}

format_bytes() {
  awk -v bytes="$1" 'BEGIN {printf "%.2f GiB", bytes / 1073741824}'
}

current_available="$(available_bytes)" || {
  log "could not determine free space on /"
  exit 1
}

if (( FORCE == 0 && current_available >= THRESHOLD_BYTES )); then
  exit 0
fi

if (( DRY_RUN == 1 )); then
  log "dry-run cleanup plan; / has $(format_bytes "${current_available}") available"
else
  log "low disk space detected; / has $(format_bytes "${current_available}") available"
fi

target_reached() {
  local available

  (( DRY_RUN == 1 )) && return 1
  available="$(available_bytes)" || return 1
  if (( available >= TARGET_BYTES )); then
    log "cleanup target reached: $(format_bytes "${available}") available"
    return 0
  fi
  return 1
}

remove_path() {
  local path="$1"

  [[ -e "${path}" || -L "${path}" ]] || return 0
  if command -v mountpoint >/dev/null 2>&1 && mountpoint -q -- "${path}"; then
    log "warning: ${path} is a mount point; leaving it in place"
    return 0
  fi
  if (( DRY_RUN == 1 )); then
    log "would remove ${path}"
    return 0
  fi

  if rm -rf --one-file-system -- "${path}"; then
    log "removed ${path}"
  else
    log "warning: failed to remove ${path}"
  fi
}

remove_binary_file() {
  local path="$1"

  if [[ ! -f "${path}" || -L "${path}" ]]; then
    log "warning: ${path} is no longer a regular binary; leaving it in place"
    return 0
  fi
  if (( DRY_RUN == 1 )); then
    log "would remove ${path}"
    return 0
  fi

  if rm -f -- "${path}"; then
    log "removed ${path}"
  else
    log "warning: failed to remove ${path}"
  fi
}

run_cleanup_command() {
  if (( DRY_RUN == 1 )); then
    printf 'synthapi-disk-cleanup: would run'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  if ! "$@"; then
    log "warning: cleanup command failed: $*"
  fi
}

go_build_id() {
  local file="$1"
  local note id

  # Parse untrusted release files without root privileges or whole-file hashing.
  note="$(
    timeout 5s setpriv --reuid="${INSPECT_UID}" --regid="${INSPECT_GID}" \
      --clear-groups --no-new-privs readelf -p .note.go.buildid "${file}" 2>/dev/null
  )" || return 1
  id="$(awk 'NF >= 3 && length($NF) > 20 {print $NF; exit}' <<<"${note}")"
  (( ${#id} >= 20 && ${#id} <= 256 )) || return 1
  [[ "${id}" =~ ^[A-Za-z0-9._/-]+$ ]] || return 1
  printf '%s\n' "${id}"
}

build_id_key() {
  local key

  # The fixed hexadecimal key is safe in Bash array subscripts.
  key="$(printf '%s' "$1" | sha256sum | awk '{print $1}')" || return 1
  [[ "${key}" =~ ^[0-9a-f]{64}$ ]] || return 1
  printf '%s\n' "${key}"
}

inode_is_running() {
  local wanted_inode="$1"
  local proc_exe inode

  for proc_exe in /proc/[0-9]*/exe; do
    inode="$(stat -Lc '%d:%i' "${proc_exe}" 2>/dev/null || true)"
    if [[ -n "${inode}" && "${inode}" == "${wanted_inode}" ]]; then
      return 0
    fi
  done
  return 1
}

prune_service_binaries() {
  local file id key inode size mtime previous_mtime current_id current_key
  local rollback_key="" now index canonical_index=-1 rollback_index=-1
  local check_inode check_size check_mtime check_id app_owner expected_owner candidate_count=0
  local -a files=() ids=() keys=() inodes=() sizes=() mtimes=() keep=()
  local -A newest_mtime_by_key=()
  local -A running_inode=()

  if [[ ! -d "${APP_DIR}" || -L "${APP_DIR}" \
      || ! -f "${APP_BINARY}" || -L "${APP_BINARY}" || ! -x "${APP_BINARY}" ]] \
    || ! command -v readelf >/dev/null 2>&1 \
    || ! command -v setpriv >/dev/null 2>&1 \
    || ! command -v timeout >/dev/null 2>&1; then
    log "warning: canonical binary or ELF inspection tools unavailable; skipping binary pruning"
    return 0
  fi

  app_owner="$(stat -c '%u:%g' "${APP_DIR}" 2>/dev/null || true)"
  expected_owner="$(id -u ubuntu 2>/dev/null || true):$(id -g ubuntu 2>/dev/null || true)"
  if [[ ! "${app_owner}" =~ ^[1-9][0-9]*:[1-9][0-9]*$ \
    || "${app_owner}" != "${expected_owner}" ]]; then
    log "warning: application directory is not owned by ubuntu; skipping binary pruning"
    return 0
  fi
  INSPECT_UID="${app_owner%%:*}"
  INSPECT_GID="${app_owner##*:}"

  current_id="$(go_build_id "${APP_BINARY}" || true)"
  if [[ -z "${current_id}" ]]; then
    log "warning: canonical binary has no readable Go Build ID; skipping binary pruning"
    return 0
  fi
  current_key="$(build_id_key "${current_id}" || true)"
  if [[ -z "${current_key}" ]]; then
    log "warning: could not create a safe key for the canonical binary; skipping binary pruning"
    return 0
  fi

  while IFS= read -r -d '' file; do
    (( candidate_count += 1 ))
    if (( candidate_count > MAX_BINARY_CANDIDATES )); then
      log "warning: too many binary candidates; skipping binary pruning"
      return 0
    fi
    id="$(go_build_id "${file}" || true)"
    [[ -n "${id}" ]] || continue
    key="$(build_id_key "${id}" || true)"
    [[ -n "${key}" ]] || continue
    inode="$(stat -Lc '%d:%i' "${file}" 2>/dev/null || true)"
    size="$(stat -Lc '%s' "${file}" 2>/dev/null || true)"
    mtime="$(stat -Lc '%Y' "${file}" 2>/dev/null || true)"
    [[ "${inode}" =~ ^[0-9]+:[0-9]+$ \
      && "${size}" =~ ^[0-9]+$ \
      && "${mtime}" =~ ^[0-9]+$ ]] || continue

    files+=("${file}")
    ids+=("${id}")
    keys+=("${key}")
    inodes+=("${inode}")
    sizes+=("${size}")
    mtimes+=("${mtime}")
    keep+=(0)
    index=$((${#files[@]} - 1))
    [[ "${file}" == "${APP_BINARY}" ]] && canonical_index="${index}"

    previous_mtime="${newest_mtime_by_key["${key}"]-}"
    if [[ -z "${previous_mtime}" ]] || (( mtime > previous_mtime )); then
      newest_mtime_by_key["${key}"]="${mtime}"
    fi
  done < <(
    find "${APP_DIR}" -xdev -mindepth 1 -maxdepth 1 -type f \
      -name 'synthapi-server*' -perm /111 -print0 2>/dev/null
  )

  if (( canonical_index < 0 )) || [[ "${keys[canonical_index]}" != "${current_key}" ]]; then
    log "warning: canonical binary changed during inspection; skipping binary pruning"
    return 0
  fi

  if (( ${#newest_mtime_by_key[@]} < 2 )); then
    log "fewer than two distinct service versions found; skipping binary pruning"
    return 0
  fi

  for index in "${!files[@]}"; do
    if inode_is_running "${inodes[index]}"; then
      running_inode["${inodes[index]}"]=1
    fi
  done

  while read -r mtime key; do
    [[ "${key}" == "${current_key}" ]] && continue
    rollback_key="${key}"
    break
  done < <(
    for key in "${!newest_mtime_by_key[@]}"; do
      printf '%s %s\n' "${newest_mtime_by_key["${key}"]}" "${key}"
    done | sort -rn
  )

  if [[ -z "${rollback_key}" ]]; then
    log "no distinct rollback version found; skipping binary pruning"
    return 0
  fi

  keep[canonical_index]=1
  for index in "${!files[@]}"; do
    if [[ -n "${running_inode[${inodes[index]}]+present}" ]]; then
      keep[index]=1
    fi
  done

  mtime=0
  for index in "${!files[@]}"; do
    if [[ "${keys[index]}" == "${rollback_key}" ]] && (( mtimes[index] > mtime )); then
      rollback_index="${index}"
      mtime="${mtimes[index]}"
    fi
  done
  if (( rollback_index < 0 )); then
    log "warning: rollback binary changed during inspection; skipping binary pruning"
    return 0
  fi
  keep[rollback_index]=1

  if (( DRY_RUN == 1 )); then
    log "would keep current binary ${APP_BINARY}"
    log "would keep rollback binary ${files[rollback_index]}"
  fi

  now="$(date +%s)"
  for index in "${!files[@]}"; do
    file="${files[index]}"
    (( keep[index] == 0 )) || continue
    (( now - mtimes[index] >= BINARY_MIN_AGE_SECONDS )) || continue

    check_inode="$(stat -Lc '%d:%i' "${file}" 2>/dev/null || true)"
    check_size="$(stat -Lc '%s' "${file}" 2>/dev/null || true)"
    check_mtime="$(stat -Lc '%Y' "${file}" 2>/dev/null || true)"
    check_id="$(go_build_id "${file}" || true)"
    if [[ "${check_inode}" != "${inodes[index]}" \
      || "${check_size}" != "${sizes[index]}" \
      || "${check_mtime}" != "${mtimes[index]}" \
      || "${check_id}" != "${ids[index]}" ]]; then
      log "warning: ${file} changed during inspection; leaving it in place"
      continue
    fi
    if inode_is_running "${check_inode}"; then
      log "warning: ${file} became active; leaving it in place"
      continue
    fi
    remove_binary_file "${file}"
  done
}

build_is_running() {
  local process_name proc_cwd cwd

  for process_name in go compile link npm npx pnpm yarn bun rspack webpack vite esbuild; do
    if pgrep -x "${process_name}" >/dev/null 2>&1; then
      return 0
    fi
  done

  for proc_cwd in /proc/[0-9]*/cwd; do
    cwd="$(readlink "${proc_cwd}" 2>/dev/null || true)"
    case "${cwd}" in
      /tmp/synthapi-build-*|/tmp/synthapi-backend-build-*|/tmp/synthapi-live-web-*)
        return 0
        ;;
    esac
  done
  return 1
}

cleanup_stale_build_artifacts() {
  local path

  if build_is_running; then
    log "a Go or frontend build process is active; skipping transient build artifacts"
    return 0
  fi

  while IFS= read -r -d '' path; do
    remove_path "${path}"
  done < <(
    # This allowlist intentionally excludes /tmp/go and /tmp/go1.26.4.
    find /tmp -xdev -mindepth 1 -maxdepth 1 -mmin "+${MIN_AGE_MINUTES}" \
      \( \
        -name 'synthapi-build-*' -o \
        -name 'synthapi-backend-build-*' -o \
        -name 'synthapi-fast-route-release-*' -o \
        -name 'synthapi-live-web-*' -o \
        -name 'synthapi-smoke-*' -o \
        -name 'synthapi-server-candidate-*' -o \
        -name 'synthapi-gocache*' -o \
        -name 'synthapi-gomodcache' -o \
        -name 'codex-gomodcache' -o \
        -name 'go-build[0-9]*' -o \
        -name 'go*.linux-amd64.tar.gz' \
      \) -print0 2>/dev/null
  )
}

cleanup_compiler_and_package_caches() {
  local path

  if build_is_running; then
    log "a Go or frontend build process is active; skipping compiler and package caches"
    return 0
  fi

  for path in \
    /root/.cache/go-build \
    /home/ubuntu/.cache/go-build \
    /root/.npm/_cacache \
    /root/.npm/_logs \
    /root/.npm/_npx \
    /home/ubuntu/.npm/_cacache \
    /home/ubuntu/.npm/_logs \
    /home/ubuntu/.npm/_npx; do
    remove_path "${path}"
  done
}

cleanup_module_download_caches() {
  local path

  if build_is_running; then
    log "a Go or frontend build process is active; skipping module download caches"
    return 0
  fi

  for path in \
    /root/go/pkg/mod/cache \
    /home/ubuntu/go/pkg/mod/cache; do
    remove_path "${path}"
  done
}

prune_service_binaries
target_reached && exit 0

cleanup_stale_build_artifacts
target_reached && exit 0

cleanup_compiler_and_package_caches
target_reached && exit 0

run_cleanup_command timeout 60s apt-get -q clean
run_cleanup_command journalctl --vacuum-size=100M --vacuum-time=7d
target_reached && exit 0

cleanup_module_download_caches

final_available="$(available_bytes)" || final_available=0
if (( DRY_RUN == 1 )); then
  log "dry-run complete; no files were changed"
elif (( final_available < THRESHOLD_BYTES )); then
  log "warning: cleanup finished with only $(format_bytes "${final_available}") available"
else
  log "cleanup finished with $(format_bytes "${final_available}") available"
fi
