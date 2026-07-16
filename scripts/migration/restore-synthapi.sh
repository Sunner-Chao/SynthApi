#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.env"

TARGET_DIR=""
MPAY_TARGET_DIR=""
SERVICE_USER=""
SERVICE_GROUP=""
SERVICE_NAME=""
MPAY_SERVICE_NAME=""
RESTORE_MPAY=0
INSTALL_NGINX=0
FORCE=0
NO_START=0
SKIP_DB_PROVISION=0
SKIP_MPAY_DB_PROVISION=0
JOBS=""

log() {
  printf '[migration-restore] %s\n' "$*"
}

warn() {
  printf '[migration-restore] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[migration-restore] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Restore a SynthAPI migration bundle on the target server.

Usage:
  sudo ./restore-synthapi.sh [options]

Options:
  --target DIR             Project destination (default: source path from manifest)
  --mpay-target DIR        MPay destination (default: source MPay path from manifest)
  --service-user USER      Runtime user (default: source user from manifest)
  --service NAME           systemd unit name (default: source unit from manifest)
  --mpay-service NAME      MPay systemd unit name (default: mpay.service)
  --no-mpay                Skip MPay project and MariaDB restoration
  --jobs N                 Parallel pg_restore jobs (default: min(CPU count, 4))
  --install-nginx          Install bundled Nginx config and TLS material
  --skip-db-provision      Require the database/user in .env to already exist
  --skip-mpay-db-provision Require the MPay database/user to already exist
  --no-start               Restore files and database but do not start SynthAPI
  --force                  Replace a non-empty target/database after creating backups
  -h, --help               Show this help

The bundle must be extracted before running this script. PostgreSQL, MariaDB,
PHP, Redis, Nginx (when requested), zstd, rsync, curl, and Python 3 must already
be installed.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
  esac
done

if (( EUID != 0 )); then
  exec sudo -- "$0" "$@"
fi

[[ -f "$MANIFEST" ]] || die "manifest.env not found next to restore script"
# shellcheck disable=SC1090
source "$MANIFEST"

TARGET_DIR="${source_project_root:-/home/ubuntu/demo/SynthApi}"
MPAY_TARGET_DIR="${source_mpay_root:-/home/ubuntu/demo/mpay}"
SERVICE_USER="${source_service_user:-ubuntu}"
SERVICE_GROUP="${source_service_group:-$SERVICE_USER}"
SERVICE_NAME="${source_service_name:-synthapi.service}"
MPAY_SERVICE_NAME="${source_mpay_service_name:-mpay.service}"
RESTORE_MPAY="${includes_mpay:-0}"

while (( $# > 0 )); do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || die "--target requires a value"
      TARGET_DIR="$2"
      shift 2
      ;;
    --mpay-target)
      [[ $# -ge 2 ]] || die "--mpay-target requires a value"
      MPAY_TARGET_DIR="$2"
      shift 2
      ;;
    --service-user)
      [[ $# -ge 2 ]] || die "--service-user requires a value"
      SERVICE_USER="$2"
      SERVICE_GROUP="$2"
      shift 2
      ;;
    --service)
      [[ $# -ge 2 ]] || die "--service requires a value"
      SERVICE_NAME="$2"
      shift 2
      ;;
    --mpay-service)
      [[ $# -ge 2 ]] || die "--mpay-service requires a value"
      MPAY_SERVICE_NAME="$2"
      shift 2
      ;;
    --no-mpay)
      RESTORE_MPAY=0
      shift
      ;;
    --jobs)
      [[ $# -ge 2 ]] || die "--jobs requires a value"
      JOBS="$2"
      shift 2
      ;;
    --install-nginx)
      INSTALL_NGINX=1
      shift
      ;;
    --skip-db-provision)
      SKIP_DB_PROVISION=1
      shift
      ;;
    --skip-mpay-db-provision)
      SKIP_MPAY_DB_PROVISION=1
      shift
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    --force)
      FORCE=1
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

for cmd in bash python3 rsync sha256sum pg_dump pg_restore psql curl systemctl sudo; do
  require_command "$cmd"
done
if (( RESTORE_MPAY == 1 )); then
  for cmd in php zstd; do
    require_command "$cmd"
  done
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
if (( INSTALL_NGINX == 1 )); then
  require_command nginx
fi

[[ -d "$SCRIPT_DIR/payload/project" ]] || die "payload/project is missing"
[[ -f "$SCRIPT_DIR/payload/database.dump" ]] || die "payload/database.dump is missing"
[[ -f "$SCRIPT_DIR/payload/config/app.env" ]] || die "payload/config/app.env is missing"
if (( RESTORE_MPAY == 1 )); then
  [[ -d "$SCRIPT_DIR/payload/mpay/project" ]] || die "payload/mpay/project is missing"
  [[ -f "$SCRIPT_DIR/payload/mpay-database.sql.zst" ]] || die "payload/mpay-database.sql.zst is missing"
  [[ -f "$SCRIPT_DIR/payload/config/mpay.env" ]] || die "payload/config/mpay.env is missing"
fi
[[ "$(uname -m)" == "$source_arch" ]] || die "architecture mismatch: bundle=$source_arch target=$(uname -m)"

mkdir -p "$(dirname "$TARGET_DIR")"
AVAILABLE_BYTES="$(df -PB1 "$(dirname "$TARGET_DIR")" | awk 'NR == 2 {print $4}')"
REQUIRED_BYTES=$((source_db_size_bytes * 2 + 536870912))
if (( RESTORE_MPAY == 1 )); then
  REQUIRED_BYTES=$((REQUIRED_BYTES + source_mpay_size_bytes + source_mpay_db_size_bytes * 2))
fi
(( AVAILABLE_BYTES >= REQUIRED_BYTES )) \
  || die "insufficient free disk space: need at least $REQUIRED_BYTES bytes, have $AVAILABLE_BYTES"
if [[ -e "$TARGET_DIR" && -n "$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" && "$FORCE" == "0" ]]; then
  die "target directory is not empty: $TARGET_DIR (use --force after verifying the target)"
fi
if (( RESTORE_MPAY == 1 )); then
  mkdir -p "$(dirname "$MPAY_TARGET_DIR")"
  if [[ -e "$MPAY_TARGET_DIR" && -n "$(find "$MPAY_TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" && "$FORCE" == "0" ]]; then
    die "MPay target directory is not empty: $MPAY_TARGET_DIR (use --force after verifying the target)"
  fi
fi

if [[ -z "$JOBS" ]]; then
  JOBS="$(nproc)"
  (( JOBS > 4 )) && JOBS=4
  (( JOBS < 1 )) && JOBS=1
fi
[[ "$JOBS" =~ ^[0-9]+$ ]] || die "--jobs must be an integer"
(( JOBS >= 1 && JOBS <= 32 )) || die "--jobs must be between 1 and 32"

log "Verifying bundle checksums"
(
  cd "$SCRIPT_DIR"
  sha256sum --check --strict checksums.sha256
)

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating service user $SERVICE_USER"
  useradd --create-home --shell /bin/bash "$SERVICE_USER"
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"

set -a
# shellcheck disable=SC1091
source "$SCRIPT_DIR/payload/config/app.env"
set +a
: "${SQL_DSN:?SQL_DSN is not set in bundled app.env}"

parse_database_url() {
  local -a parts=()
  mapfile -d '' -t parts < <(
    python3 <<'PY'
import os
import sys
from urllib.parse import parse_qs, unquote, urlparse

parsed = urlparse(os.environ.get("SQL_DSN", ""))
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
TMP_DIR="$(mktemp -d /tmp/synthapi-restore.XXXXXXXX)"
trap 'rm -rf -- "$TMP_DIR"' EXIT
PGPASSFILE="$TMP_DIR/.pgpass"
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
  export MPAY_ENV_FILE="$SCRIPT_DIR/payload/config/mpay.env"
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

if (( RESTORE_MPAY == 1 )); then
  parse_mpay_env
  MPAY_MY_CNF="$TMP_DIR/.mpay-my.cnf"
  {
    printf '[client]\n'
    printf 'host="%s"\n' "$(mysql_option_escape "$MPAY_DB_HOST")"
    printf 'port="%s"\n' "$(mysql_option_escape "$MPAY_DB_PORT")"
    printf 'user="%s"\n' "$(mysql_option_escape "$MPAY_DB_USER")"
    printf 'password="%s"\n' "$(mysql_option_escape "$MPAY_DB_PASSWORD")"
    printf 'default-character-set=utf8mb4\n'
  } > "$MPAY_MY_CNF"
  chmod 600 "$MPAY_MY_CNF"
fi

is_local_database() {
  case "$DB_HOST" in
    localhost|127.0.0.1|::1) return 0 ;;
    *) return 1 ;;
  esac
}

is_local_mpay_database() {
  case "$MPAY_DB_HOST" in
    localhost|127.0.0.1|::1) return 0 ;;
    *) return 1 ;;
  esac
}

mysql_quote_literal() {
  MIGRATION_VALUE="$1" python3 <<'PY'
import os
value = os.environ["MIGRATION_VALUE"]
value = value.replace("\\", "\\\\").replace("'", "\\'")
print("'" + value + "'")
PY
}

mysql_quote_identifier() {
  MIGRATION_VALUE="$1" python3 <<'PY'
import os
value = os.environ["MIGRATION_VALUE"]
print("`" + value.replace("`", "``") + "`")
PY
}

run_mariadb_root_sql() {
  "$MYSQL_CLIENT_BIN" --protocol=socket --batch --skip-column-names
}

provision_local_mpay_database() {
  local db_ident user_literal password_literal localhost_literal loopback_literal sql
  systemctl start mariadb.service
  db_ident="$(mysql_quote_identifier "$MPAY_DB_NAME")"
  user_literal="$(mysql_quote_literal "$MPAY_DB_USER")"
  password_literal="$(mysql_quote_literal "$MPAY_DB_PASSWORD")"
  localhost_literal="$(mysql_quote_literal localhost)"
  loopback_literal="$(mysql_quote_literal 127.0.0.1)"
  sql="CREATE DATABASE IF NOT EXISTS $db_ident CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS $user_literal@$localhost_literal IDENTIFIED BY $password_literal;
ALTER USER $user_literal@$localhost_literal IDENTIFIED BY $password_literal;
CREATE USER IF NOT EXISTS $user_literal@$loopback_literal IDENTIFIED BY $password_literal;
ALTER USER $user_literal@$loopback_literal IDENTIFIED BY $password_literal;
GRANT ALL PRIVILEGES ON $db_ident.* TO $user_literal@$localhost_literal;
GRANT ALL PRIVILEGES ON $db_ident.* TO $user_literal@$loopback_literal;
FLUSH PRIVILEGES;"
  printf '%s\n' "$sql" | run_mariadb_root_sql >/dev/null
}

reset_local_mpay_database() {
  local db_ident
  db_ident="$(mysql_quote_identifier "$MPAY_DB_NAME")"
  printf 'DROP DATABASE IF EXISTS %s;\n' "$db_ident" | run_mariadb_root_sql >/dev/null
  provision_local_mpay_database
}

mpay_catalog_exists() {
  local catalog="$1" value_literal query
  value_literal="$(mysql_quote_literal "$2")"
  case "$catalog" in
    database) query="SELECT 1 FROM information_schema.schemata WHERE schema_name=$value_literal;" ;;
    user) query="SELECT 1 FROM mysql.user WHERE User=$value_literal LIMIT 1;" ;;
    *) die "invalid MariaDB catalog lookup: $catalog" ;;
  esac
  printf '%s\n' "$query" | run_mariadb_root_sql
}

sql_quote_literal() {
  MIGRATION_VALUE="$1" python3 <<'PY'
import os
value = os.environ["MIGRATION_VALUE"]
print("'" + value.replace("'", "''") + "'")
PY
}

provision_local_database() {
  local role_ident role_literal password_literal db_literal role_sql db_query db_exists

  systemctl start postgresql.service 2>/dev/null || true
  id postgres >/dev/null 2>&1 || die "local PostgreSQL OS user not found"
  role_ident="$(MIGRATION_VALUE="$DB_USER" python3 <<'PY'
import os
value = os.environ["MIGRATION_VALUE"]
print('"' + value.replace('"', '""') + '"')
PY
)"
  role_literal="$(sql_quote_literal "$DB_USER")"
  password_literal="$(sql_quote_literal "$DB_PASSWORD")"
  db_literal="$(sql_quote_literal "$DB_NAME")"
  role_sql="DO \$migration\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $role_literal) THEN ALTER ROLE $role_ident LOGIN PASSWORD $password_literal; ELSE CREATE ROLE $role_ident LOGIN PASSWORD $password_literal; END IF; END \$migration\$;"
  printf '%s\n' "$role_sql" | sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres >/dev/null

  db_query="SELECT 1 FROM pg_database WHERE datname = $db_literal;"
  db_exists="$(printf '%s\n' "$db_query" | sudo -u postgres psql -X -At -v ON_ERROR_STOP=1 -d postgres)"
  if [[ "$db_exists" != "1" ]]; then
    log "Creating PostgreSQL database $DB_NAME"
    sudo -u postgres createdb --owner="$DB_USER" "$DB_NAME"
  fi
}

local_catalog_exists() {
  local catalog="$1" value="$2" value_literal query
  value_literal="$(sql_quote_literal "$value")"
  case "$catalog" in
    role) query="SELECT 1 FROM pg_roles WHERE rolname = $value_literal;" ;;
    database) query="SELECT 1 FROM pg_database WHERE datname = $value_literal;" ;;
    *) die "invalid PostgreSQL catalog lookup: $catalog" ;;
  esac
  printf '%s\n' "$query" | sudo -u postgres psql -X -At -v ON_ERROR_STOP=1 -d postgres
}

if (( SKIP_DB_PROVISION == 0 )) && is_local_database; then
  systemctl start postgresql.service 2>/dev/null || true
  if ! psql "${PG_ARGS[@]}" -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null 2>&1; then
    ROLE_EXISTS="$(local_catalog_exists role "$DB_USER")"
    DATABASE_EXISTS="$(local_catalog_exists database "$DB_NAME")"
    if [[ "$ROLE_EXISTS" == "1" && "$DATABASE_EXISTS" == "1" && "$FORCE" == "0" ]]; then
      die "existing local database and role reject bundled credentials; use --force only for the intended target"
    fi
    provision_local_database
  fi
elif (( SKIP_DB_PROVISION == 0 )); then
  warn "remote PostgreSQL detected; database provisioning is skipped"
fi

psql "${PG_ARGS[@]}" -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null \
  || die "cannot connect to target PostgreSQL database"

EXISTING_TABLES="$(psql "${PG_ARGS[@]}" -X -v ON_ERROR_STOP=1 -Atc \
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
if (( EXISTING_TABLES > 0 && FORCE == 0 )); then
  die "target database already has $EXISTING_TABLES public tables; use --force after verifying the target"
fi

MPAY_EXISTING_TABLES=0
if (( RESTORE_MPAY == 1 )); then
  if (( SKIP_MPAY_DB_PROVISION == 0 )) && is_local_mpay_database; then
    systemctl start mariadb.service
    if ! "$MYSQL_CLIENT_BIN" --defaults-extra-file="$MPAY_MY_CNF" \
      --database="$MPAY_DB_NAME" --batch --skip-column-names \
      --execute 'SELECT 1' >/dev/null 2>&1; then
      MPAY_DATABASE_EXISTS="$(mpay_catalog_exists database "$MPAY_DB_NAME")"
      MPAY_USER_EXISTS="$(mpay_catalog_exists user "$MPAY_DB_USER")"
      if [[ "$MPAY_DATABASE_EXISTS" == "1" && "$MPAY_USER_EXISTS" == "1" && "$FORCE" == "0" ]]; then
        die "existing MPay database and user reject bundled credentials; use --force only for the intended target"
      fi
      provision_local_mpay_database
    fi
  elif (( SKIP_MPAY_DB_PROVISION == 0 )); then
    warn "remote MPay MariaDB detected; database provisioning is skipped"
  fi

  "$MYSQL_CLIENT_BIN" --defaults-extra-file="$MPAY_MY_CNF" \
    --database="$MPAY_DB_NAME" --batch --skip-column-names \
    --execute 'SELECT 1' >/dev/null \
    || die "cannot connect to target MPay MariaDB database"
  MPAY_EXISTING_TABLES="$("$MYSQL_CLIENT_BIN" --defaults-extra-file="$MPAY_MY_CNF" \
    --database="$MPAY_DB_NAME" --batch --skip-column-names --execute \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();")"
  if (( MPAY_EXISTING_TABLES > 0 && FORCE == 0 )); then
    die "target MPay database already has $MPAY_EXISTING_TABLES tables; use --force after verifying the target"
  fi
fi

BACKUP_ROOT="/var/backups/synthapi/$(date -u +%Y%m%dT%H%M%SZ)"
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  log "Stopping existing $SERVICE_NAME"
  systemctl stop "$SERVICE_NAME"
fi
if (( RESTORE_MPAY == 1 )) && systemctl is-active --quiet "$MPAY_SERVICE_NAME" 2>/dev/null; then
  log "Stopping existing $MPAY_SERVICE_NAME"
  systemctl stop "$MPAY_SERVICE_NAME"
fi

if (( FORCE == 1 )); then
  mkdir -p "$BACKUP_ROOT"
  if (( EXISTING_TABLES > 0 )); then
    log "Backing up existing target database to $BACKUP_ROOT/database-before-restore.dump"
    pg_dump "${PG_ARGS[@]}" --format=custom --compress=6 --no-owner --no-acl \
      --file "$BACKUP_ROOT/database-before-restore.dump"
  fi
  if (( RESTORE_MPAY == 1 && MPAY_EXISTING_TABLES > 0 )); then
    log "Backing up existing MPay database to $BACKUP_ROOT/mpay-database-before-restore.sql.zst"
    "$MYSQL_DUMP_BIN" --defaults-extra-file="$MPAY_MY_CNF" \
      --single-transaction --quick --routines --events --triggers --hex-blob \
      --default-character-set=utf8mb4 "$MPAY_DB_NAME" \
      | zstd -q -T0 -6 -o "$BACKUP_ROOT/mpay-database-before-restore.sql.zst"
  fi
  if [[ -d "$TARGET_DIR" && -n "$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    log "Moving existing project to $BACKUP_ROOT/project-before-restore"
    mkdir -p "$(dirname "$TARGET_DIR")"
    mv -- "$TARGET_DIR" "$BACKUP_ROOT/project-before-restore"
  fi
  if (( RESTORE_MPAY == 1 )) && [[ -d "$MPAY_TARGET_DIR" && -n "$(find "$MPAY_TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    log "Moving existing MPay project to $BACKUP_ROOT/mpay-project-before-restore"
    mv -- "$MPAY_TARGET_DIR" "$BACKUP_ROOT/mpay-project-before-restore"
  fi
fi

log "Restoring project files to $TARGET_DIR"
mkdir -p "$TARGET_DIR"
rsync -a "$SCRIPT_DIR/payload/project/" "$TARGET_DIR/"
install -m 600 -o "$SERVICE_USER" -g "$SERVICE_GROUP" \
  "$SCRIPT_DIR/payload/config/app.env" "$TARGET_DIR/.env"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$TARGET_DIR"
chmod 750 "$TARGET_DIR/synthapi-server-new"
RESTORED_BINARY_SHA256="$(sha256sum "$TARGET_DIR/synthapi-server-new" | awk '{print $1}')"
[[ "$RESTORED_BINARY_SHA256" == "$source_binary_sha256" ]] \
  || die "restored SynthAPI executable does not match the source checksum"

SERVICE_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
if [[ -d "$SCRIPT_DIR/payload/config/synthapi-keys" && -n "$SERVICE_HOME" ]]; then
  install -d -m 700 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SERVICE_HOME/.config/synthapi/keys"
  rsync -a "$SCRIPT_DIR/payload/config/synthapi-keys/" "$SERVICE_HOME/.config/synthapi/keys/"
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$SERVICE_HOME/.config/synthapi/keys"
  chmod -R u+rwX,go-rwx "$SERVICE_HOME/.config/synthapi/keys"
fi

if (( RESTORE_MPAY == 1 )); then
  log "Restoring MPay project files to $MPAY_TARGET_DIR"
  mkdir -p "$MPAY_TARGET_DIR"
  rsync -a "$SCRIPT_DIR/payload/mpay/project/" "$MPAY_TARGET_DIR/"
  install -m 600 -o "$SERVICE_USER" -g "$SERVICE_GROUP" \
    "$SCRIPT_DIR/payload/config/mpay.env" "$MPAY_TARGET_DIR/.env"
  for runtime_dir in cache log session auth; do
    install -d -m 770 -o "$SERVICE_USER" -g "$SERVICE_GROUP" \
      "$MPAY_TARGET_DIR/runtime/$runtime_dir"
  done
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$MPAY_TARGET_DIR"
fi

log "Restoring PostgreSQL with $JOBS parallel jobs"
pg_restore "${PG_ARGS[@]}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --jobs="$JOBS" \
  "$SCRIPT_DIR/payload/database.dump"
psql "${PG_ARGS[@]}" -X -v ON_ERROR_STOP=1 -c 'ANALYZE;' >/dev/null

MPAY_RESTORED_TABLES=0
if (( RESTORE_MPAY == 1 )); then
  if (( FORCE == 1 && SKIP_MPAY_DB_PROVISION == 0 )) && is_local_mpay_database; then
    log "Resetting the target MPay database before restore"
    reset_local_mpay_database
  fi
  log "Restoring MPay MariaDB database"
  zstd -q -dc "$SCRIPT_DIR/payload/mpay-database.sql.zst" \
    | "$MYSQL_CLIENT_BIN" --defaults-extra-file="$MPAY_MY_CNF" \
      --database="$MPAY_DB_NAME" --default-character-set=utf8mb4
  MPAY_RESTORED_TABLES="$("$MYSQL_CLIENT_BIN" --defaults-extra-file="$MPAY_MY_CNF" \
    --database="$MPAY_DB_NAME" --batch --skip-column-names --execute \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();")"
  (( MPAY_RESTORED_TABLES > 0 )) || die "MPay database restore produced no tables"
fi

RESTORED_TABLES="$(psql "${PG_ARGS[@]}" -X -v ON_ERROR_STOP=1 -Atc \
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
(( RESTORED_TABLES > 0 )) || die "database restore produced no public tables"

UNIT_PATH="/etc/systemd/system/$SERVICE_NAME"
log "Installing systemd unit $UNIT_PATH"
cat > "$UNIT_PATH" <<EOF
[Unit]
Description=SynthApi Service
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$TARGET_DIR
EnvironmentFile=$TARGET_DIR/.env
ExecStart=$TARGET_DIR/synthapi-server-new
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
chmod 644 "$UNIT_PATH"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null

if (( RESTORE_MPAY == 1 )); then
  MPAY_UNIT_PATH="/etc/systemd/system/$MPAY_SERVICE_NAME"
  PHP_BIN="$(command -v php)"
  log "Installing MPay systemd unit $MPAY_UNIT_PATH"
  cat > "$MPAY_UNIT_PATH" <<EOF
[Unit]
Description=MPay personal payment gateway
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$MPAY_TARGET_DIR
ExecStart=$PHP_BIN think run -H 0.0.0.0 -p ${source_mpay_port:-18088}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  chmod 644 "$MPAY_UNIT_PATH"
  systemctl daemon-reload
  systemctl enable "$MPAY_SERVICE_NAME" >/dev/null
fi

if (( INSTALL_NGINX == 1 )); then
  [[ -f "$SCRIPT_DIR/payload/nginx/synthapi.conf" ]] || die "bundled Nginx config is missing"
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  if [[ -d "$SCRIPT_DIR/payload/nginx/ssl" ]]; then
    mkdir -p /etc/nginx/ssl
    rsync -a "$SCRIPT_DIR/payload/nginx/ssl/" /etc/nginx/ssl/
  fi
  if [[ -d "$SCRIPT_DIR/payload/nginx/letsencrypt" ]]; then
    mkdir -p /etc/letsencrypt
    rsync -a "$SCRIPT_DIR/payload/nginx/letsencrypt/" /etc/letsencrypt/
  fi
  install -m 644 "$SCRIPT_DIR/payload/nginx/synthapi.conf" /etc/nginx/sites-available/synthapi.conf
  ln -sfn /etc/nginx/sites-available/synthapi.conf /etc/nginx/sites-enabled/synthapi.conf
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
fi

if (( NO_START == 0 )); then
  systemctl start redis-server.service 2>/dev/null || true
  if (( RESTORE_MPAY == 1 )); then
    systemctl start mariadb.service
    log "Starting $MPAY_SERVICE_NAME"
    systemctl restart "$MPAY_SERVICE_NAME"
  fi
  log "Starting $SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"

  ADMIN_PORT="${ADMIN_PORT:-3000}"
  healthy=0
  for _ in $(seq 1 30); do
    if curl --silent --fail --max-time 2 "http://127.0.0.1:${ADMIN_PORT}/api/status" >/dev/null; then
      healthy=1
      break
    fi
    sleep 1
  done
  (( healthy == 1 )) || die "$SERVICE_NAME did not become healthy on admin port $ADMIN_PORT"

  if (( RESTORE_MPAY == 1 )); then
    MPAY_PORT="${source_mpay_port:-18088}"
    mpay_healthy=0
    for _ in $(seq 1 30); do
      if curl --silent --max-time 2 "http://127.0.0.1:${MPAY_PORT}/" >/dev/null; then
        mpay_healthy=1
        break
      fi
      sleep 1
    done
    (( mpay_healthy == 1 )) || die "$MPAY_SERVICE_NAME did not become healthy on port $MPAY_PORT"
  fi

  if (( INSTALL_NGINX == 1 )); then
    systemctl enable nginx.service >/dev/null
    systemctl restart nginx.service
  fi
else
  warn "--no-start selected; SynthAPI was restored but not started"
fi

log "Restore completed: project=$TARGET_DIR database=$DB_NAME tables=$RESTORED_TABLES"
if (( RESTORE_MPAY == 1 )); then
  log "MPay restored: project=$MPAY_TARGET_DIR database=$MPAY_DB_NAME tables=$MPAY_RESTORED_TABLES"
fi
log "Review DNS/Cloudflare, firewall rules, and payment callbacks before directing production traffic here."
if [[ -d "$BACKUP_ROOT" ]]; then
  log "Pre-restore backup: $BACKUP_ROOT"
fi
