#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MPAY_ROOT="$(cd -- "$PROJECT_ROOT/.." && pwd)/mpay"

OUTPUT_DIR="${HOME:-/tmp}"
SERVICE_NAME="synthapi.service"
MPAY_SERVICE_NAME="mpay.service"
NGINX_SERVICE_NAME="nginx.service"
MODE="offline"
LEAVE_STOPPED=0
INCLUDE_LOGS=0
INCLUDE_SYSTEM_CONFIG=1
INCLUDE_MPAY=1
ENCRYPT_ARCHIVE=0
ASSUME_YES=0
CHECK_ONLY=0
ZSTD_LEVEL=10

WORK_DIR=""
APP_WAS_ACTIVE=0
NGINX_WAS_ACTIVE=0
MPAY_WAS_ACTIVE=0
APP_STOPPED_BY_SCRIPT=0
MPAY_STOPPED_BY_SCRIPT=0
NGINX_STOPPED_BY_SCRIPT=0
KEEP_SOURCE_STOPPED=0
ARCHIVE_PATH=""
ARCHIVE_TMP=""
ENCRYPTED_PATH=""

log() {
  printf '[migration-export] %s\n' "$*"
}

warn() {
  printf '[migration-export] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[migration-export] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Create a portable SynthAPI migration bundle.

Usage:
  export-synthapi.sh [options]

Options:
  --output-dir DIR         Destination directory (default: $HOME)
  --service NAME           Source systemd unit (default: synthapi.service)
  --mpay-root DIR          MPay project directory (default: sibling mpay directory)
  --mpay-service NAME      MPay systemd unit (default: mpay.service)
  --no-mpay                Exclude MPay and its MariaDB database
  --online                 Do not stop traffic or SynthAPI; suitable for rehearsal only
  --leave-stopped          Keep source Nginx and SynthAPI stopped after a successful export
  --include-logs           Include application logs (excluded by default)
  --no-system-config       Do not bundle Nginx, TLS, systemd, or local key backups
  --encrypt                Encrypt the final archive with GnuPG symmetric AES256
  --zstd-level N           Outer archive compression level 1-19 (default: 10)
  --yes                    Skip the offline-mode confirmation prompt
  --check                  Run read-only prerequisites and database checks, then exit
  -h, --help               Show this help

Default offline mode briefly stops Nginx, MPay, and SynthAPI so pending batch
billing can flush before the database dumps. Services are restarted automatically
unless --leave-stopped is used. On failure, stopped services are restarted.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

systemd_is_active() {
  systemctl is-active --quiet "$1" 2>/dev/null
}

restore_source_services() {
  local failed=0

  if (( APP_STOPPED_BY_SCRIPT == 1 )); then
    log "Starting source service $SERVICE_NAME"
    if sudo systemctl start "$SERVICE_NAME"; then
      APP_STOPPED_BY_SCRIPT=0
    else
      warn "failed to restart $SERVICE_NAME"
      failed=1
    fi
  fi

  if (( MPAY_STOPPED_BY_SCRIPT == 1 )); then
    log "Starting source service $MPAY_SERVICE_NAME"
    if sudo systemctl start "$MPAY_SERVICE_NAME"; then
      MPAY_STOPPED_BY_SCRIPT=0
    else
      warn "failed to restart $MPAY_SERVICE_NAME"
      failed=1
    fi
  fi

  if (( NGINX_STOPPED_BY_SCRIPT == 1 )); then
    log "Starting source service $NGINX_SERVICE_NAME"
    if sudo systemctl start "$NGINX_SERVICE_NAME"; then
      NGINX_STOPPED_BY_SCRIPT=0
    else
      warn "failed to restart $NGINX_SERVICE_NAME"
      failed=1
    fi
  fi

  return "$failed"
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM

  if (( status != 0 )); then
    [[ -z "$ARCHIVE_TMP" ]] || rm -f -- "$ARCHIVE_TMP"
    [[ -z "$ENCRYPTED_PATH" ]] || rm -f -- "$ENCRYPTED_PATH" "$ENCRYPTED_PATH.partial"
    if (( ENCRYPT_ARCHIVE == 1 )) && [[ -n "$ARCHIVE_PATH" ]]; then
      rm -f -- "$ARCHIVE_PATH"
    fi
  fi

  if (( status != 0 )) || (( KEEP_SOURCE_STOPPED == 0 )); then
    restore_source_services || status=1
  fi

  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf -- "$WORK_DIR"
  fi
  exit "$status"
}

trap cleanup EXIT INT TERM

while (( $# > 0 )); do
  case "$1" in
    --output-dir)
      [[ $# -ge 2 ]] || die "--output-dir requires a value"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --service)
      [[ $# -ge 2 ]] || die "--service requires a value"
      SERVICE_NAME="$2"
      shift 2
      ;;
    --mpay-root)
      [[ $# -ge 2 ]] || die "--mpay-root requires a value"
      MPAY_ROOT="$2"
      shift 2
      ;;
    --mpay-service)
      [[ $# -ge 2 ]] || die "--mpay-service requires a value"
      MPAY_SERVICE_NAME="$2"
      shift 2
      ;;
    --no-mpay)
      INCLUDE_MPAY=0
      shift
      ;;
    --online)
      MODE="online"
      shift
      ;;
    --leave-stopped)
      LEAVE_STOPPED=1
      shift
      ;;
    --include-logs)
      INCLUDE_LOGS=1
      shift
      ;;
    --no-system-config)
      INCLUDE_SYSTEM_CONFIG=0
      shift
      ;;
    --encrypt)
      ENCRYPT_ARCHIVE=1
      shift
      ;;
    --zstd-level)
      [[ $# -ge 2 ]] || die "--zstd-level requires a value"
      ZSTD_LEVEL="$2"
      shift 2
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --check)
      CHECK_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[[ "$ZSTD_LEVEL" =~ ^[0-9]+$ ]] || die "--zstd-level must be an integer"
(( ZSTD_LEVEL >= 1 && ZSTD_LEVEL <= 19 )) || die "--zstd-level must be between 1 and 19"
if [[ "$MODE" == "online" && "$LEAVE_STOPPED" == "1" ]]; then
  die "--online and --leave-stopped cannot be used together"
fi

for cmd in bash python3 rsync tar zstd sha256sum pg_dump pg_restore psql git; do
  require_command "$cmd"
done
if (( ENCRYPT_ARCHIVE == 1 )); then
  require_command gpg
fi

[[ -f "$PROJECT_ROOT/.env" ]] || die "missing $PROJECT_ROOT/.env"
[[ -x "$PROJECT_ROOT/synthapi-server-new" ]] || die "missing executable $PROJECT_ROOT/synthapi-server-new"
[[ -f "$SCRIPT_DIR/restore-synthapi.sh" ]] || die "missing restore-synthapi.sh"
[[ -f "$SCRIPT_DIR/README.md" ]] || die "missing migration README.md"
if (( INCLUDE_MPAY == 1 )); then
  [[ -d "$MPAY_ROOT" ]] || die "MPay directory not found: $MPAY_ROOT"
  MPAY_ROOT="$(cd -- "$MPAY_ROOT" && pwd)"
  [[ -f "$MPAY_ROOT/.env" ]] || die "missing $MPAY_ROOT/.env"
  [[ -f "$MPAY_ROOT/think" ]] || die "missing $MPAY_ROOT/think"
  if command -v mariadb >/dev/null 2>&1; then
    MYSQL_CLIENT_BIN="$(command -v mariadb)"
  elif command -v mysql >/dev/null 2>&1; then
    MYSQL_CLIENT_BIN="$(command -v mysql)"
  else
    die "MariaDB/MySQL client not found"
  fi
  if command -v mariadb-dump >/dev/null 2>&1; then
    MYSQL_DUMP_BIN="$(command -v mariadb-dump)"
  elif command -v mysqldump >/dev/null 2>&1; then
    MYSQL_DUMP_BIN="$(command -v mysqldump)"
  else
    die "mariadb-dump/mysqldump not found"
  fi
fi

set -a
# shellcheck disable=SC1091
source "$PROJECT_ROOT/.env"
set +a
: "${SQL_DSN:?SQL_DSN is not set in .env}"

parse_database_url() {
  local -a parts=()
  mapfile -d '' -t parts < <(
    python3 <<'PY'
import os
import sys
from urllib.parse import parse_qs, unquote, urlparse

dsn = os.environ.get("SQL_DSN", "")
parsed = urlparse(dsn)
if parsed.scheme not in {"postgres", "postgresql"}:
    print("SQL_DSN must be a postgresql:// URL", file=sys.stderr)
    raise SystemExit(2)
if not parsed.hostname or not parsed.username or parsed.password is None or not parsed.path.strip("/"):
    print("SQL_DSN must contain host, user, password, and database", file=sys.stderr)
    raise SystemExit(2)
query = parse_qs(parsed.query)
values = [
    parsed.hostname,
    str(parsed.port or 5432),
    unquote(parsed.username),
    unquote(parsed.password),
    unquote(parsed.path.lstrip("/")),
    query.get("sslmode", [""])[0],
]
for value in values:
    sys.stdout.buffer.write(value.encode("utf-8") + b"\0")
PY
  )
  (( ${#parts[@]} == 6 )) || die "failed to parse SQL_DSN"
  DB_HOST="${parts[0]}"
  DB_PORT="${parts[1]}"
  DB_USER="${parts[2]}"
  DB_PASSWORD="${parts[3]}"
  DB_NAME="${parts[4]}"
  DB_SSLMODE="${parts[5]}"
}

pgpass_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//:/\\:}"
  printf '%s' "$value"
}

parse_database_url
mkdir -p -- "$OUTPUT_DIR"
OUTPUT_DIR="$(cd -- "$OUTPUT_DIR" && pwd)"
WORK_DIR="$(mktemp -d "$OUTPUT_DIR/.synthapi-migration.XXXXXXXX")"

PGPASSFILE="$WORK_DIR/.pgpass"
export PGPASSFILE
printf '%s:%s:%s:%s:%s\n' \
  "$(pgpass_escape "$DB_HOST")" \
  "$(pgpass_escape "$DB_PORT")" \
  "$(pgpass_escape "$DB_NAME")" \
  "$(pgpass_escape "$DB_USER")" \
  "$(pgpass_escape "$DB_PASSWORD")" > "$PGPASSFILE"
chmod 600 "$PGPASSFILE"
if [[ -n "$DB_SSLMODE" ]]; then
  export PGSSLMODE="$DB_SSLMODE"
fi
PG_ARGS=(-h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME")

parse_mpay_env() {
  local -a parts=()
  export MPAY_ENV_FILE="$MPAY_ROOT/.env"
  mapfile -d '' -t parts < <(
    python3 <<'PY'
import os
import sys
from pathlib import Path

values = {}
for raw in Path(os.environ["MPAY_ENV_FILE"]).read_text().splitlines():
    raw = raw.strip()
    if not raw or raw.startswith("#") or "=" not in raw:
        continue
    key, value = raw.split("=", 1)
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    values[key.strip()] = value
required = ["DB_TYPE", "DB_HOST", "DB_NAME", "DB_USER", "DB_PASS", "DB_PORT", "DB_PREFIX"]
if any(key not in values for key in required):
    print("MPay .env is missing required DB_* values", file=sys.stderr)
    raise SystemExit(2)
for key in required:
    sys.stdout.buffer.write(values[key].encode("utf-8") + b"\0")
PY
  )
  (( ${#parts[@]} == 7 )) || die "failed to parse MPay .env"
  MPAY_DB_TYPE="${parts[0]}"
  MPAY_DB_HOST="${parts[1]}"
  MPAY_DB_NAME="${parts[2]}"
  MPAY_DB_USER="${parts[3]}"
  MPAY_DB_PASSWORD="${parts[4]}"
  MPAY_DB_PORT="${parts[5]}"
  MPAY_DB_PREFIX="${parts[6]}"
  [[ "$MPAY_DB_TYPE" == "mysql" ]] || die "unsupported MPay database type: $MPAY_DB_TYPE"
}

mysql_option_escape() {
  local value="$1"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "MPay database option contains a newline"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

if (( INCLUDE_MPAY == 1 )); then
  parse_mpay_env
  MPAY_MY_CNF="$WORK_DIR/.mpay-my.cnf"
  {
    printf '[client]\n'
    printf 'host="%s"\n' "$(mysql_option_escape "$MPAY_DB_HOST")"
    printf 'port="%s"\n' "$(mysql_option_escape "$MPAY_DB_PORT")"
    printf 'user="%s"\n' "$(mysql_option_escape "$MPAY_DB_USER")"
    printf 'password="%s"\n' "$(mysql_option_escape "$MPAY_DB_PASSWORD")"
    printf 'default-character-set=utf8mb4\n'
  } > "$MPAY_MY_CNF"
  chmod 600 "$MPAY_MY_CNF"
  MPAY_DB_INFO="$("$MYSQL_CLIENT_BIN" --defaults-extra-file="$MPAY_MY_CNF" \
    --database="$MPAY_DB_NAME" --batch --skip-column-names --execute \
    "SELECT CONCAT(VERSION(),'|',DATABASE(),'|',COALESCE((SELECT SUM(data_length+index_length) FROM information_schema.tables WHERE table_schema=DATABASE()),0),'|',COALESCE((SELECT GROUP_CONCAT(DISTINCT ENGINE ORDER BY ENGINE) FROM information_schema.tables WHERE table_schema=DATABASE()),''));")" \
    || die "cannot connect to the MPay MariaDB database"
  IFS='|' read -r MPAY_DB_VERSION MPAY_VERIFIED_DB_NAME MPAY_DB_SIZE_BYTES MPAY_DB_ENGINES <<< "$MPAY_DB_INFO"
  [[ "$MPAY_VERIFIED_DB_NAME" == "$MPAY_DB_NAME" ]] || die "connected MPay database does not match MPay .env"
fi

DB_INFO="$(psql "${PG_ARGS[@]}" -X -v ON_ERROR_STOP=1 -Atc \
  "SELECT current_setting('server_version'), current_database(), pg_database_size(current_database());")" \
  || die "cannot connect to PostgreSQL using .env SQL_DSN"
IFS='|' read -r DB_VERSION DB_VERIFIED_NAME DB_SIZE_BYTES <<< "$DB_INFO"
[[ "$DB_VERIFIED_NAME" == "$DB_NAME" ]] || die "connected database does not match SQL_DSN"

SOURCE_ARCH="$(uname -m)"
SOURCE_SERVICE_USER="$(systemctl show "$SERVICE_NAME" -p User --value 2>/dev/null || true)"
SOURCE_SERVICE_USER="${SOURCE_SERVICE_USER:-$(id -un)}"
SOURCE_SERVICE_GROUP="$(id -gn "$SOURCE_SERVICE_USER" 2>/dev/null || printf '%s' "$SOURCE_SERVICE_USER")"
if (( INCLUDE_MPAY == 1 )); then
  MPAY_SERVICE_USER="$(systemctl show "$MPAY_SERVICE_NAME" -p User --value 2>/dev/null || true)"
  MPAY_SERVICE_USER="${MPAY_SERVICE_USER:-$SOURCE_SERVICE_USER}"
  MPAY_SERVICE_GROUP="$(id -gn "$MPAY_SERVICE_USER" 2>/dev/null || printf '%s' "$MPAY_SERVICE_USER")"
  MPAY_GIT_COMMIT="$(git -C "$MPAY_ROOT" rev-parse HEAD 2>/dev/null || printf unknown)"
  MPAY_GIT_BRANCH="$(git -C "$MPAY_ROOT" branch --show-current 2>/dev/null || true)"
  [[ -n "$MPAY_GIT_BRANCH" ]] || MPAY_GIT_BRANCH="detached"
  if [[ -n "$(git -C "$MPAY_ROOT" status --porcelain 2>/dev/null)" ]]; then
    MPAY_GIT_DIRTY=true
  else
    MPAY_GIT_DIRTY=false
  fi
  MPAY_SIZE_BYTES="$(du -sb "$MPAY_ROOT" | awk '{print $1}')"
fi
GIT_COMMIT="$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || printf unknown)"
GIT_BRANCH="$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || true)"
[[ -n "$GIT_BRANCH" ]] || GIT_BRANCH="detached"
if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null)" ]]; then
  GIT_DIRTY=true
else
  GIT_DIRTY=false
fi

log "Project: $PROJECT_ROOT"
log "Database: $DB_NAME on $DB_HOST:$DB_PORT (PostgreSQL $DB_VERSION, $DB_SIZE_BYTES bytes)"
log "Git: $GIT_BRANCH $GIT_COMMIT (dirty=$GIT_DIRTY)"
log "Source service: $SERVICE_NAME (user=$SOURCE_SERVICE_USER)"
if (( INCLUDE_MPAY == 1 )); then
  log "MPay: $MPAY_ROOT, database=$MPAY_DB_NAME (MariaDB $MPAY_DB_VERSION, $MPAY_DB_SIZE_BYTES bytes, engines=$MPAY_DB_ENGINES)"
  log "MPay Git: $MPAY_GIT_BRANCH $MPAY_GIT_COMMIT (dirty=$MPAY_GIT_DIRTY)"
fi

if (( CHECK_ONLY == 1 )); then
  log "Read-only preflight passed. No service was stopped and no bundle was created."
  exit 0
fi

if [[ "$MODE" == "offline" ]]; then
  require_command sudo
  sudo -v
  if (( ASSUME_YES == 0 )); then
    if [[ ! -t 0 ]]; then
      die "offline export requires an interactive terminal or --yes"
    fi
    printf '\nOffline export will briefly stop Nginx, MPay, and %s.\n' "$SERVICE_NAME"
    if (( LEAVE_STOPPED == 1 )); then
      printf 'The source services will remain stopped after a successful export.\n'
    fi
    read -r -p 'Type MIGRATE to continue: ' answer
    [[ "$answer" == "MIGRATE" ]] || die "cancelled"
  fi
else
  warn "online mode is a rehearsal snapshot; in-memory batch billing may not be represented"
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BUNDLE_NAME="synthapi-migration-$TIMESTAMP"
BUNDLE_ROOT="$WORK_DIR/$BUNDLE_NAME"
mkdir -p "$BUNDLE_ROOT/payload/project" "$BUNDLE_ROOT/payload/config" "$BUNDLE_ROOT/reports"

RSYNC_EXCLUDES=(
  --exclude '/.env'
  --exclude '/data/'
  --exclude '/web/node_modules/'
  --exclude '/web/default/node_modules/'
  --exclude '/web/classic/node_modules/'
  --exclude '/web/default/dist/'
  --exclude '/web/classic/dist/'
  --exclude '/.gocache/'
  --exclude '/.gomodcache/'
  --exclude '/.cache/'
  --exclude '/.playwright-mcp/'
  --exclude '/scripts/__pycache__/'
  --exclude '/synthapi'
  --exclude '/synthapi-server-new.*'
  --exclude '/new-api.db'
  --exclude '/new-api.db-*'
)
if (( INCLUDE_LOGS == 0 )); then
  RSYNC_EXCLUDES+=(--exclude '/logs/')
fi

log "Staging source tree and current executable"
rsync -a --safe-links "${RSYNC_EXCLUDES[@]}" "$PROJECT_ROOT/" "$BUNDLE_ROOT/payload/project/"
install -m 600 "$PROJECT_ROOT/.env" "$BUNDLE_ROOT/payload/config/app.env"
install -m 700 "$SCRIPT_DIR/restore-synthapi.sh" "$BUNDLE_ROOT/restore-synthapi.sh"
install -m 600 "$SCRIPT_DIR/README.md" "$BUNDLE_ROOT/MIGRATION_README.md"

if (( INCLUDE_MPAY == 1 )); then
  log "Staging MPay source tree"
  mkdir -p "$BUNDLE_ROOT/payload/mpay/project"
  rsync -a --safe-links \
    --exclude '/.env' \
    --exclude '/runtime/cache/' \
    --exclude '/runtime/log/' \
    --exclude '/runtime/session/' \
    --exclude '/runtime/auth/' \
    --exclude '/runtime/*.log' \
    "$MPAY_ROOT/" "$BUNDLE_ROOT/payload/mpay/project/"
  install -m 600 "$MPAY_ROOT/.env" "$BUNDLE_ROOT/payload/config/mpay.env"
fi

if (( INCLUDE_SYSTEM_CONFIG == 1 )); then
  require_command sudo
  sudo -v
  mkdir -p "$BUNDLE_ROOT/payload/systemd" "$BUNDLE_ROOT/payload/nginx"

  UNIT_PATH="$(systemctl show "$SERVICE_NAME" -p FragmentPath --value 2>/dev/null || true)"
  if [[ -n "$UNIT_PATH" && -f "$UNIT_PATH" ]]; then
    sudo install -m 600 "$UNIT_PATH" "$BUNDLE_ROOT/payload/systemd/source.service"
  fi
  if (( INCLUDE_MPAY == 1 )); then
    MPAY_UNIT_PATH="$(systemctl show "$MPAY_SERVICE_NAME" -p FragmentPath --value 2>/dev/null || true)"
    if [[ -n "$MPAY_UNIT_PATH" && -f "$MPAY_UNIT_PATH" ]]; then
      sudo install -m 600 "$MPAY_UNIT_PATH" "$BUNDLE_ROOT/payload/systemd/mpay-source.service"
    fi
  fi

  NGINX_CONFIG="$(readlink -f /etc/nginx/sites-enabled/synthapi.conf 2>/dev/null || true)"
  if [[ -n "$NGINX_CONFIG" && -f "$NGINX_CONFIG" ]]; then
    sudo install -m 600 "$NGINX_CONFIG" "$BUNDLE_ROOT/payload/nginx/synthapi.conf"
  fi
  if sudo test -d /etc/nginx/ssl; then
    sudo rsync -a /etc/nginx/ssl/ "$BUNDLE_ROOT/payload/nginx/ssl/"
  fi
  if sudo test -d /etc/letsencrypt; then
    sudo rsync -a /etc/letsencrypt/ "$BUNDLE_ROOT/payload/nginx/letsencrypt/"
  fi

  SERVICE_HOME="$(getent passwd "$SOURCE_SERVICE_USER" | cut -d: -f6)"
  if [[ -n "$SERVICE_HOME" && -d "$SERVICE_HOME/.config/synthapi/keys" ]]; then
    rsync -a "$SERVICE_HOME/.config/synthapi/keys/" "$BUNDLE_ROOT/payload/config/synthapi-keys/"
  fi
  sudo chown -R "$(id -u):$(id -g)" "$BUNDLE_ROOT/payload/systemd" "$BUNDLE_ROOT/payload/nginx"
  chmod -R u+rwX,go-rwx "$BUNDLE_ROOT/payload/nginx" "$BUNDLE_ROOT/payload/systemd"
fi

manifest_entry() {
  printf '%s=%q\n' "$1" "$2"
}

{
  manifest_entry created_at_utc "$TIMESTAMP"
  manifest_entry source_host "$(hostname -f 2>/dev/null || hostname)"
  manifest_entry source_arch "$SOURCE_ARCH"
  manifest_entry source_project_root "$PROJECT_ROOT"
  manifest_entry source_service_name "$SERVICE_NAME"
  manifest_entry source_service_user "$SOURCE_SERVICE_USER"
  manifest_entry source_service_group "$SOURCE_SERVICE_GROUP"
  manifest_entry source_db_name "$DB_NAME"
  manifest_entry source_db_version "$DB_VERSION"
  manifest_entry source_db_size_bytes "$DB_SIZE_BYTES"
  manifest_entry source_git_branch "$GIT_BRANCH"
  manifest_entry source_git_commit "$GIT_COMMIT"
  manifest_entry source_git_dirty "$GIT_DIRTY"
  manifest_entry source_binary_sha256 "$(sha256sum "$PROJECT_ROOT/synthapi-server-new" | awk '{print $1}')"
  manifest_entry export_mode "$MODE"
  manifest_entry includes_logs "$INCLUDE_LOGS"
  manifest_entry includes_system_config "$INCLUDE_SYSTEM_CONFIG"
  manifest_entry includes_mpay "$INCLUDE_MPAY"
  if (( INCLUDE_MPAY == 1 )); then
    manifest_entry source_mpay_root "$MPAY_ROOT"
    manifest_entry source_mpay_service_name "$MPAY_SERVICE_NAME"
    manifest_entry source_mpay_service_user "$MPAY_SERVICE_USER"
    manifest_entry source_mpay_service_group "$MPAY_SERVICE_GROUP"
    manifest_entry source_mpay_size_bytes "$MPAY_SIZE_BYTES"
    manifest_entry source_mpay_db_name "$MPAY_DB_NAME"
    manifest_entry source_mpay_db_version "$MPAY_DB_VERSION"
    manifest_entry source_mpay_db_size_bytes "$MPAY_DB_SIZE_BYTES"
    manifest_entry source_mpay_git_branch "$MPAY_GIT_BRANCH"
    manifest_entry source_mpay_git_commit "$MPAY_GIT_COMMIT"
    manifest_entry source_mpay_git_dirty "$MPAY_GIT_DIRTY"
    manifest_entry source_mpay_port "18088"
  fi
} > "$BUNDLE_ROOT/manifest.env"
chmod 600 "$BUNDLE_ROOT/manifest.env"

{
  printf 'git_status:\n'
  git -C "$PROJECT_ROOT" status --short || true
  printf '\nversions:\n'
  pg_dump --version
  psql --version
  zstd --version | head -n 1
  printf 'kernel: %s\n' "$(uname -srmo)"
  printf '\nsource_service:\n'
  systemctl show "$SERVICE_NAME" -p ActiveState -p SubState -p MainPID --no-pager || true
  if (( INCLUDE_MPAY == 1 )); then
    printf '\nmpay_git_status:\n'
    git -C "$MPAY_ROOT" status --short || true
    printf '\nmpay_service:\n'
    systemctl show "$MPAY_SERVICE_NAME" -p ActiveState -p SubState -p MainPID --no-pager || true
    printf 'mpay_php: %s\n' "$(php -r 'echo PHP_VERSION;' 2>/dev/null || printf unknown)"
  fi
  printf '\ndisk:\n'
  df -h "$PROJECT_ROOT" || true
} > "$BUNDLE_ROOT/reports/inventory.txt"

if [[ "$MODE" == "offline" ]]; then
  if systemd_is_active "$SERVICE_NAME"; then
    APP_WAS_ACTIVE=1
  fi
  if (( INCLUDE_MPAY == 1 )) && systemd_is_active "$MPAY_SERVICE_NAME"; then
    MPAY_WAS_ACTIVE=1
  fi
  if systemd_is_active "$NGINX_SERVICE_NAME"; then
    NGINX_WAS_ACTIVE=1
    log "Stopping $NGINX_SERVICE_NAME to block new traffic"
    sudo systemctl stop "$NGINX_SERVICE_NAME"
    NGINX_STOPPED_BY_SCRIPT=1
  fi

  if (( MPAY_WAS_ACTIVE == 1 )); then
    log "Stopping $MPAY_SERVICE_NAME"
    sudo systemctl stop "$MPAY_SERVICE_NAME"
    MPAY_STOPPED_BY_SCRIPT=1
  fi

  if (( APP_WAS_ACTIVE == 1 )); then
    BATCH_WAIT="${BATCH_UPDATE_INTERVAL:-5}"
    [[ "$BATCH_WAIT" =~ ^[0-9]+$ ]] || BATCH_WAIT=5
    (( BATCH_WAIT < 1 )) && BATCH_WAIT=1
    (( BATCH_WAIT > 60 )) && BATCH_WAIT=60
    BATCH_WAIT=$((BATCH_WAIT + 2))
    log "Waiting ${BATCH_WAIT}s for pending batch billing to flush"
    sleep "$BATCH_WAIT"
    log "Stopping $SERVICE_NAME"
    sudo systemctl stop "$SERVICE_NAME"
    APP_STOPPED_BY_SCRIPT=1
  fi
fi

log "Creating consistent PostgreSQL custom-format dump"
pg_dump "${PG_ARGS[@]}" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-acl \
  --file "$BUNDLE_ROOT/payload/database.dump"
pg_restore --list "$BUNDLE_ROOT/payload/database.dump" > "$BUNDLE_ROOT/reports/database.list"

if (( INCLUDE_MPAY == 1 )); then
  log "Creating consistent MPay MariaDB dump"
  "$MYSQL_DUMP_BIN" --defaults-extra-file="$MPAY_MY_CNF" \
    --single-transaction \
    --quick \
    --routines \
    --events \
    --triggers \
    --hex-blob \
    --default-character-set=utf8mb4 \
    "$MPAY_DB_NAME" \
    | zstd -q -T0 -6 -o "$BUNDLE_ROOT/payload/mpay-database.sql.zst"
  zstd -q -t "$BUNDLE_ROOT/payload/mpay-database.sql.zst"
fi

if [[ "$MODE" == "offline" && "$LEAVE_STOPPED" == "0" ]]; then
  restore_source_services || die "database dump succeeded but source services failed to restart"
fi

(
  cd "$BUNDLE_ROOT"
  find . -type f ! -name checksums.sha256 -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum > checksums.sha256
)
chmod 600 "$BUNDLE_ROOT/checksums.sha256"

ARCHIVE_PATH="$OUTPUT_DIR/$BUNDLE_NAME.tar.zst"
ARCHIVE_TMP="$ARCHIVE_PATH.partial"
log "Compressing migration bundle with zstd level $ZSTD_LEVEL"
tar -I "zstd -T0 -${ZSTD_LEVEL}" -cf "$ARCHIVE_TMP" -C "$WORK_DIR" "$BUNDLE_NAME"
zstd -q -t "$ARCHIVE_TMP"
mv -- "$ARCHIVE_TMP" "$ARCHIVE_PATH"
chmod 600 "$ARCHIVE_PATH"

FINAL_PATH="$ARCHIVE_PATH"
if (( ENCRYPT_ARCHIVE == 1 )); then
  ENCRYPTED_PATH="$ARCHIVE_PATH.gpg"
  log "Encrypting archive. Enter a strong passphrase in the GnuPG prompt."
  gpg --symmetric --cipher-algo AES256 --output "$ENCRYPTED_PATH.partial" "$ARCHIVE_PATH"
  mv -- "$ENCRYPTED_PATH.partial" "$ENCRYPTED_PATH"
  chmod 600 "$ENCRYPTED_PATH"
  rm -f -- "$ARCHIVE_PATH"
  FINAL_PATH="$ENCRYPTED_PATH"
fi

if [[ "$MODE" == "offline" && "$LEAVE_STOPPED" == "1" ]]; then
  KEEP_SOURCE_STOPPED=1
  warn "source Nginx, SynthAPI, and MPay remain stopped for final cutover"
fi

log "Bundle created: $FINAL_PATH"
log "Bundle size: $(du -h "$FINAL_PATH" | awk '{print $1}')"
log "SHA256: $(sha256sum "$FINAL_PATH" | awk '{print $1}')"
warn "This bundle contains database records, API credentials, TLS keys, and payment keys. Protect it as a secret."
