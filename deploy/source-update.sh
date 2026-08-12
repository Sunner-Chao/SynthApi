#!/usr/bin/env bash
set -Eeuo pipefail

umask 027

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=source-update-git.sh
source "$SCRIPT_DIR/source-update-git.sh"

readonly OFFICIAL_REPOSITORY="Wei-Shaw/sub2api"
readonly OFFICIAL_URL="https://github.com/${OFFICIAL_REPOSITORY}.git"

REPO_DIR="${SYNTHAPI_REPO_DIR:-/home/ubuntu/demo/sub2api}"
DEPLOY_DIR="${SYNTHAPI_DEPLOY_DIR:-${REPO_DIR}/deploy}"
REQUEST_FILE="${SYNTHAPI_UPDATE_REQUEST_FILE:-${DEPLOY_DIR}/data/system-update/request.json}"
STATUS_FILE="${SYNTHAPI_UPDATE_STATUS_FILE:-${DEPLOY_DIR}/data/system-update/status.json}"
GUARD_FILE="${SYNTHAPI_UPDATE_GUARD_FILE:-${REPO_DIR}/deploy/source-update-guards.txt}"
COMPOSE_PROJECT="${SYNTHAPI_COMPOSE_PROJECT:-synthapi-prod}"
COMPOSE_LOCAL_FILE="${SYNTHAPI_COMPOSE_LOCAL_FILE:-${DEPLOY_DIR}/docker-compose.local.yml}"
COMPOSE_OVERRIDE_FILE="${SYNTHAPI_COMPOSE_OVERRIDE_FILE:-${DEPLOY_DIR}/docker-compose.override.yml}"
IMAGE_NAME="${SYNTHAPI_IMAGE_NAME:-synthapi:local}"
HEALTH_TIMEOUT_SECONDS="${SYNTHAPI_HEALTH_TIMEOUT_SECONDS:-240}"
DIRTY_WORKTREE_POLICY="${SYNTHAPI_DIRTY_WORKTREE_POLICY:-fail}"

OPERATION_ID=""
CURRENT_VERSION=""
TARGET_VERSION=""
REQUESTED_AT=""
STARTED_AT=""
CURRENT_PHASE="initializing"
STATUS_CURRENT_VERSION=""
STATUS_FINALIZED=false
WORKTREE_PARENT=""
WORKTREE_DIR=""
CANDIDATE_BRANCH=""
SNAPSHOT_COMMIT=""
MERGE_BASE=""

verify_customization_guards() {
  local root=$1
  local manifest=$2
  local relative_path=""
  local required_literal=""

  if [[ ! -f "$manifest" ]]; then
    printf '%s\n' "Customization guard manifest is missing"
    return 1
  fi
  while IFS='|' read -r relative_path required_literal; do
    [[ -z "$relative_path" || "$relative_path" == \#* ]] && continue
    if [[ "$relative_path" = /* || "$relative_path" == *".."* || -z "$required_literal" ]]; then
      printf '%s\n' "Customization guard manifest contains an invalid entry"
      return 1
    fi
    if [[ ! -f "$root/$relative_path" ]] || ! grep -Fq -- "$required_literal" "$root/$relative_path"; then
      printf '%s\n' "Protected customization check failed: $relative_path"
      return 1
    fi
  done < "$manifest"
}

if [[ "${1:-}" == "--check-guards" ]]; then
  verify_customization_guards "$REPO_DIR" "$GUARD_FILE"
  exit
fi

mkdir -p "$(dirname "$STATUS_FILE")"
exec 9>"$(dirname "$STATUS_FILE")/source-update.lock"
if ! flock -n 9; then
  exit 0
fi

write_status() {
  local state=$1
  local phase=$2
  local message=$3
  local backup_status=${4:-pending}
  local started_at=${5:-}
  local finished_at=${6:-}

  python3 - "$STATUS_FILE" "$state" "$phase" "$message" "$OPERATION_ID" \
    "$STATUS_CURRENT_VERSION" "$TARGET_VERSION" "$REQUESTED_AT" "$started_at" \
    "$finished_at" "$backup_status" <<'PY'
import json
import os
import sys
import tempfile

(
    path,
    state,
    phase,
    message,
    operation_id,
    current_version,
    target_version,
    requested_at,
    started_at,
    finished_at,
    backup_status,
) = sys.argv[1:]

payload = {
    "schema_version": 1,
    "state": state,
    "phase": phase,
    "message": message,
    "operation_id": operation_id,
    "current_version": current_version,
    "target_version": target_version,
    "requested_at": requested_at,
    "started_at": started_at,
    "finished_at": finished_at,
    "backup_status": backup_status,
}

directory = os.path.dirname(path)
os.makedirs(directory, mode=0o750, exist_ok=True)
fd, temp_path = tempfile.mkstemp(prefix=".status-", suffix=".json", dir=directory)
try:
    os.chmod(temp_path, 0o640)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_path, path)
except BaseException:
    try:
        os.unlink(temp_path)
    except FileNotFoundError:
        pass
    raise
PY
}

finish_failed() {
  local state=$1
  local message=$2
  local backup_status=${3:-not_started}
  STATUS_FINALIZED=true
  write_status "$state" "$CURRENT_PHASE" "$message" "$backup_status" "$STARTED_AT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 1
}

cleanup() {
  if [[ -n "$WORKTREE_DIR" ]] && git -C "$REPO_DIR" worktree list --porcelain | grep -Fq "worktree $WORKTREE_DIR"; then
    git -C "$REPO_DIR" worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || true
  fi
  if [[ -n "$CANDIDATE_BRANCH" ]] && git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$CANDIDATE_BRANCH"; then
    git -C "$REPO_DIR" branch -D "$CANDIDATE_BRANCH" >/dev/null 2>&1 || true
  fi
  if [[ -n "$WORKTREE_PARENT" && -d "$WORKTREE_PARENT" ]]; then
    rmdir "$WORKTREE_PARENT" >/dev/null 2>&1 || true
  fi
}

handle_unexpected_error() {
  local exit_code=$1
  local line=$2
  trap - ERR
  if [[ "$STATUS_FINALIZED" != true ]]; then
    write_status "failed" "$CURRENT_PHASE" "Unexpected updater failure at line $line" "not_completed" "${STARTED_AT:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || true
  fi
  exit "$exit_code"
}

resolve_known_merge_conflicts() {
  local conflict_path=""
  local unresolved=()
  mapfile -t conflict_paths < <(git -C "$WORKTREE_DIR" diff --name-only --diff-filter=U)

  for conflict_path in "${conflict_paths[@]}"; do
    case "$conflict_path" in
      README.md)
        # README is a deployment customization; official runtime code is unaffected.
        git -C "$WORKTREE_DIR" checkout-index --force --stage=2 -- "$conflict_path"
        git -C "$WORKTREE_DIR" add -- "$conflict_path"
        ;;
      backend/internal/repository/gateway_cache.go | \
      backend/internal/handler/grok_media.go | \
      frontend/src/views/auth/EmailVerifyView.vue | \
      frontend/src/views/auth/RegisterView.vue)
        # These paths are deterministically replayed after the merge.
        git -C "$WORKTREE_DIR" checkout-index --force --stage=2 -- "$conflict_path"
        git -C "$WORKTREE_DIR" add -- "$conflict_path"
        ;;
      *)
        unresolved+=("$conflict_path")
        ;;
    esac
  done

  if (( ${#unresolved[@]} > 0 )); then
    printf '%s\n' "Unresolved official merge conflicts: $(IFS=,; echo "${unresolved[*]}")"
    return 1
  fi
  if [[ -n "$(git -C "$WORKTREE_DIR" ls-files --unmerged)" ]]; then
    printf '%s\n' "Official merge still contains unresolved index entries"
    return 1
  fi

  git -C "$WORKTREE_DIR" \
    -c user.name="SynthAPI Source Updater" \
    -c user.email="source-update@synthapi.local" \
    -c commit.gpgsign=false \
    -c core.hooksPath=/dev/null \
    commit --no-edit -m "chore(update): merge official source with customizations" >/dev/null
}

replay_official_first_customizations() {
  local relative_path=""
  local base_file=""
  local local_file=""
  local official_file=""
  local official_only_paths=(
    "backend/internal/repository/gateway_cache.go"
  )
  local official_first_paths=(
    "backend/internal/handler/grok_media.go"
    "frontend/src/views/auth/EmailVerifyView.vue"
    "frontend/src/views/auth/RegisterView.vue"
  )

  for relative_path in "${official_only_paths[@]}"; do
    git -C "$REPO_DIR" show "$UPSTREAM_REF:$relative_path" > "$WORKTREE_DIR/$relative_path"
    git -C "$WORKTREE_DIR" add -- "$relative_path"
  done

  for relative_path in "${official_first_paths[@]}"; do
    base_file="$WORKTREE_PARENT/$(basename "$relative_path").base"
    local_file="$WORKTREE_PARENT/$(basename "$relative_path").local"
    official_file="$WORKTREE_PARENT/$(basename "$relative_path").official"
    git -C "$REPO_DIR" show "$MERGE_BASE:$relative_path" > "$base_file"
    git -C "$REPO_DIR" show "$BASE_COMMIT:$relative_path" > "$local_file"
    git -C "$REPO_DIR" show "$UPSTREAM_REF:$relative_path" > "$official_file"
    if ! git merge-file --theirs "$local_file" "$base_file" "$official_file"; then
      printf '%s\n' "Could not three-way merge protected customization: $relative_path"
      return 1
    fi
    install -m 644 "$local_file" "$WORKTREE_DIR/$relative_path"
    git -C "$WORKTREE_DIR" add -- "$relative_path"
  done

  if ! git -C "$WORKTREE_DIR" diff --cached --quiet; then
    git -C "$WORKTREE_DIR" \
      -c user.name="SynthAPI Source Updater" \
      -c user.email="source-update@synthapi.local" \
      -c commit.gpgsign=false \
      -c core.hooksPath=/dev/null \
      commit -m "chore(update): replay official-first protected customizations" >/dev/null
  fi
}

trap cleanup EXIT
trap 'handle_unexpected_error $? $LINENO' ERR

if [[ ! -f "$REQUEST_FILE" ]]; then
  exit 0
fi

mapfile -d '' -t request_fields < <(python3 - "$REQUEST_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    request = json.load(handle)

for key in (
    "operation_id",
    "current_version",
    "target_version",
    "official_repository",
    "requested_at",
):
    value = request.get(key, "")
    if not isinstance(value, str):
        raise SystemExit(f"request field {key} must be a string")
    sys.stdout.write(value)
    sys.stdout.write("\0")
PY
)

if [[ ${#request_fields[@]} -ne 5 ]]; then
  finish_failed "failed" "Invalid source update request" "not_started"
fi

OPERATION_ID=${request_fields[0]}
CURRENT_VERSION=${request_fields[1]#v}
TARGET_VERSION=${request_fields[2]#v}
REQUEST_REPOSITORY=${request_fields[3]}
REQUESTED_AT=${request_fields[4]}
STATUS_CURRENT_VERSION=$CURRENT_VERSION
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [[ ! "$OPERATION_ID" =~ ^[A-Za-z0-9._-]{1,128}$ ]]; then
  finish_failed "failed" "Invalid operation identifier" "not_started"
fi
if [[ ! "$CURRENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  finish_failed "failed" "Invalid current version" "not_started"
fi
if [[ ! "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  finish_failed "failed" "Invalid target version" "not_started"
fi
if [[ "$REQUEST_REPOSITORY" != "$OFFICIAL_REPOSITORY" ]]; then
  finish_failed "failed" "Update repository is not the approved official source" "not_started"
fi

for command in git docker python3 flock grep sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    finish_failed "failed" "Required command is unavailable: $command" "not_started"
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  finish_failed "failed" "Docker Compose plugin is unavailable" "not_started"
fi
if [[ ! -d "$REPO_DIR/.git" || ! -f "$COMPOSE_LOCAL_FILE" || ! -f "$COMPOSE_OVERRIDE_FILE" ]]; then
  finish_failed "failed" "Production repository or Compose configuration is missing" "not_started"
fi
if [[ "$(git -C "$REPO_DIR" branch --show-current)" != "main" ]]; then
  finish_failed "failed" "Production repository must be on main" "not_started"
fi
case "$DIRTY_WORKTREE_POLICY" in
  fail | snapshot) ;;
  *) finish_failed "failed" "Invalid dirty worktree policy" "not_started" ;;
esac
if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
  if [[ "$DIRTY_WORKTREE_POLICY" != "snapshot" ]]; then
    finish_failed "failed" "Production repository has local changes" "not_started"
  fi

  CURRENT_PHASE="snapshotting_customizations"
  write_status "running" "$CURRENT_PHASE" "Saving local customizations before the official merge" "pending" "$STARTED_AT"
  if ! SNAPSHOT_COMMIT=$(snapshot_production_changes "$REPO_DIR" "$TARGET_VERSION" "$OPERATION_ID"); then
    finish_failed "failed" "Could not snapshot local customizations; resolve Git conflicts and retry" "not_started"
  fi
  if [[ -z "$SNAPSHOT_COMMIT" || -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
    finish_failed "failed" "Local customization snapshot did not produce a clean repository" "not_started"
  fi
  write_status "running" "$CURRENT_PHASE" "Saved local customizations at ${SNAPSHOT_COMMIT:0:12}" "pending" "$STARTED_AT"
fi

CURRENT_PHASE="fetching_official"
write_status "running" "$CURRENT_PHASE" "Fetching official v${TARGET_VERSION}" "pending" "$STARTED_AT"
UPSTREAM_REF="refs/tags/upstream-v${TARGET_VERSION}"
if ! git -C "$REPO_DIR" fetch --force --no-tags "$OFFICIAL_URL" \
  "refs/tags/v${TARGET_VERSION}:${UPSTREAM_REF}"; then
  finish_failed "failed" "Failed to fetch the requested official tag" "not_started"
fi
UPSTREAM_COMMIT=$(git -C "$REPO_DIR" rev-parse "${UPSTREAM_REF}^{commit}")

OPERATION_SUFFIX=$(printf '%s' "$OPERATION_ID" | sha256sum | cut -c1-12)
CANDIDATE_BRANCH="synthapi-update/v${TARGET_VERSION}-${OPERATION_SUFFIX}"
WORKTREE_PARENT=$(mktemp -d "${TMPDIR:-/tmp}/synthapi-source-update.XXXXXX")
WORKTREE_DIR="$WORKTREE_PARENT/worktree"
BASE_COMMIT=$(git -C "$REPO_DIR" rev-parse main)
MERGE_BASE=$(git -C "$REPO_DIR" merge-base "$BASE_COMMIT" "$UPSTREAM_REF")
if [[ -z "$MERGE_BASE" ]]; then
  finish_failed "failed" "Official source has no common history with production" "not_started"
fi

CURRENT_PHASE="merging_customizations"
write_status "running" "$CURRENT_PHASE" "Merging official source with protected customizations" "pending" "$STARTED_AT"
if ! git -C "$REPO_DIR" worktree add -b "$CANDIDATE_BRANCH" "$WORKTREE_DIR" "$BASE_COMMIT"; then
  finish_failed "failed" "Failed to create an isolated update worktree" "not_started"
fi
# Production customizations win only inside overlapping conflict hunks. Official
# changes outside those hunks are still merged, then guards and a full image
# build verify the candidate before it can replace the running deployment.
if ! git -C "$WORKTREE_DIR" merge --no-ff --no-edit -X ours "$UPSTREAM_REF"; then
  if ! resolve_known_merge_conflicts; then
    conflicts=$(git -C "$WORKTREE_DIR" diff --name-only --diff-filter=U | paste -sd, -)
    finish_failed "failed" "Official merge requires manual conflict resolution: ${conflicts:-unknown files}" "not_started"
  fi
fi
if ! replay_official_first_customizations; then
  finish_failed "failed" "Could not combine official updates with protected customizations" "not_started"
fi
CANDIDATE_COMMIT=$(git -C "$WORKTREE_DIR" rev-parse HEAD)
if ! git -C "$WORKTREE_DIR" merge-base --is-ancestor "$UPSTREAM_COMMIT" "$CANDIDATE_COMMIT"; then
  finish_failed "failed" "Candidate does not contain the requested official tag" "not_started"
fi

CURRENT_PHASE="verifying_customizations"
write_status "running" "$CURRENT_PHASE" "Verifying protected customization guards" "pending" "$STARTED_AT"
if ! guard_error=$(verify_customization_guards "$WORKTREE_DIR" "$GUARD_FILE"); then
  finish_failed "failed" "$guard_error" "not_started"
fi

CURRENT_PHASE="building_image"
write_status "running" "$CURRENT_PHASE" "Building candidate image for v${TARGET_VERSION}" "pending" "$STARTED_AT"
CANDIDATE_IMAGE="synthapi:candidate-${TARGET_VERSION}-${OPERATION_SUFFIX}"
if ! BUILDKIT_STEP_LOG_MAX_SIZE=1048576 BUILDKIT_STEP_LOG_MAX_SPEED=1048576 docker build --pull \
  --build-arg "VERSION=${TARGET_VERSION}" \
  --build-arg "COMMIT=${CANDIDATE_COMMIT}" \
  --label "club.ecobim.synthapi.official-version=${TARGET_VERSION}" \
  --label "club.ecobim.synthapi.source-commit=${CANDIDATE_COMMIT}" \
  -t "$CANDIDATE_IMAGE" "$WORKTREE_DIR"; then
  finish_failed "failed" "Candidate image build failed" "not_started"
fi
IMAGE_VERSION_OUTPUT=$(docker run --rm "$CANDIDATE_IMAGE" --version 2>&1 || true)
if ! grep -Fq -- "$TARGET_VERSION" <<<"$IMAGE_VERSION_OUTPUT"; then
  finish_failed "failed" "Candidate image reports an unexpected version" "not_started"
fi

COMPOSE_ARGS=(
  --project-directory "$DEPLOY_DIR"
  -p "$COMPOSE_PROJECT"
  -f "$COMPOSE_LOCAL_FILE"
  -f "$COMPOSE_OVERRIDE_FILE"
)

wait_for_healthy_version() {
  local expected_version=$1
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  local container_id=""
  local health=""
  local reported=""

  while (( SECONDS < deadline )); do
    container_id=$(docker compose "${COMPOSE_ARGS[@]}" ps -q sub2api 2>/dev/null || true)
    if [[ -n "$container_id" ]]; then
      health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)
      if [[ "$health" == "healthy" ]]; then
        reported=$(docker exec "$container_id" /app/sub2api --version 2>&1 || true)
        if grep -Fq -- "$expected_version" <<<"$reported"; then
          return 0
        fi
      fi
    fi
    sleep 2
  done
  return 1
}

CURRENT_PHASE="deploying_candidate"
write_status "running" "$CURRENT_PHASE" "Switching production to v${TARGET_VERSION}" "pending" "$STARTED_AT"
OLD_IMAGE_ID=$(docker image inspect "$IMAGE_NAME" --format '{{.Id}}' 2>/dev/null || true)
if [[ -z "$OLD_IMAGE_ID" ]]; then
  finish_failed "failed" "Current production image is unavailable for rollback" "not_started"
fi
docker tag "$OLD_IMAGE_ID" synthapi:previous
docker tag "$CANDIDATE_IMAGE" "$IMAGE_NAME"
if ! docker compose "${COMPOSE_ARGS[@]}" up -d --no-deps --force-recreate --pull never sub2api; then
  docker tag "$OLD_IMAGE_ID" "$IMAGE_NAME"
  docker compose "${COMPOSE_ARGS[@]}" up -d --no-deps --force-recreate --pull never sub2api || true
  finish_failed "rolled_back" "Candidate deployment failed; previous image restored" "not_started"
fi

CURRENT_PHASE="health_check"
write_status "running" "$CURRENT_PHASE" "Waiting for v${TARGET_VERSION} health verification" "pending" "$STARTED_AT"
if ! wait_for_healthy_version "$TARGET_VERSION"; then
  docker tag "$OLD_IMAGE_ID" "$IMAGE_NAME"
  docker compose "${COMPOSE_ARGS[@]}" up -d --no-deps --force-recreate --pull never sub2api || true
  wait_for_healthy_version "$CURRENT_VERSION" || true
  finish_failed "rolled_back" "Candidate health verification failed; previous image restored" "not_started"
fi

CURRENT_PHASE="recording_deployment"
write_status "running" "$CURRENT_PHASE" "Recording verified source and backup refs" "pending" "$STARTED_AT"
if ! git -C "$REPO_DIR" merge --ff-only "$CANDIDATE_BRANCH"; then
  docker tag "$OLD_IMAGE_ID" "$IMAGE_NAME"
  docker compose "${COMPOSE_ARGS[@]}" up -d --no-deps --force-recreate --pull never sub2api || true
  wait_for_healthy_version "$CURRENT_VERSION" || true
  finish_failed "rolled_back" "Could not advance source main; previous image restored" "not_started"
fi

DEPLOY_TAG="synthapi-deployed-v${TARGET_VERSION}"
if git -C "$REPO_DIR" show-ref --verify --quiet "refs/tags/$DEPLOY_TAG"; then
  if [[ "$(git -C "$REPO_DIR" rev-parse "${DEPLOY_TAG}^{commit}")" != "$CANDIDATE_COMMIT" ]]; then
    DEPLOY_TAG="${DEPLOY_TAG}-${OPERATION_SUFFIX}"
  fi
fi
if ! git -C "$REPO_DIR" show-ref --verify --quiet "refs/tags/$DEPLOY_TAG"; then
  git -C "$REPO_DIR" tag -a "$DEPLOY_TAG" -m "Verified SynthAPI deployment v${TARGET_VERSION}" "$CANDIDATE_COMMIT"
fi

BACKUP_STATUS="succeeded"
push_succeeded=false
for attempt in 1 2 3; do
  if git -C "$REPO_DIR" push origin main \
    "${UPSTREAM_REF}:${UPSTREAM_REF}" \
    "refs/tags/${DEPLOY_TAG}:refs/tags/${DEPLOY_TAG}"; then
    push_succeeded=true
    break
  fi
  sleep 3
done
if [[ "$push_succeeded" != true ]]; then
  BACKUP_STATUS="failed"
fi

STATUS_CURRENT_VERSION=$TARGET_VERSION
STATUS_FINALIZED=true
CURRENT_PHASE="completed"
if [[ "$BACKUP_STATUS" == "succeeded" ]]; then
  write_status "succeeded" "$CURRENT_PHASE" "v${TARGET_VERSION} deployed and backed up" "$BACKUP_STATUS" "$STARTED_AT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
  write_status "succeeded" "$CURRENT_PHASE" "v${TARGET_VERSION} deployed; repository backup push failed" "$BACKUP_STATUS" "$STARTED_AT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
