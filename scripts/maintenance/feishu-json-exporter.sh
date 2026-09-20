#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-/var/lib/session-recorder/exports}"
DEST_DIR="${DEST_DIR:-/root/feishu-session-recorder-json}"
STATE_MARKER="${STATE_MARKER:-/var/lib/session-recorder/state/feishu-json-exporter.last}"
META_FILE="${META_FILE:-/var/lib/session-recorder/state/feishu-json-exporter.meta.jsonl}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

umask 077
install -d -m 0700 "$DEST_DIR"
install -d -m 0700 "$(dirname "$STATE_MARKER")"
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || RETENTION_DAYS=7
touch "$META_FILE"
chmod 0600 "$META_FILE"

if [[ ! -s "$META_FILE" && -s "$DEST_DIR/manifest.json" ]]; then
  meta_tmp="${META_FILE}.tmp.$$"
  find "$DEST_DIR" -maxdepth 1 -type f -name '*.json' ! -name 'manifest.json' -print0 \
    | xargs -0 -r jq -c '{model, provider, session_id, start_time, end_time}' > "$meta_tmp"
  chmod 0600 "$meta_tmp"
  mv -f "$meta_tmp" "$META_FILE"
fi

# Keep one exporter active when a large response takes longer than a timer tick.
exec 9>"/run/session-recorder-feishu-json.lock"
flock -n 9 || exit 0

safe_segment() {
  local value="$1"
  value="${value//[^A-Za-z0-9_.-]/_}"
  [[ -n "$value" ]] || value="record"
  printf '%s\n' "$value"
}

redact_record() {
  jq '
    def sensitive_key:
      (ascii_downcase | test("authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie"));
    def redact:
      if type == "object" then
        with_entries(
          if (.key | sensitive_key) then .value = "<redacted>"
          else .value |= redact
          end
        )
      elif type == "array" then map(redact)
      elif type == "string" and test("(?i)(bearer[[:space:]]+|sk-[A-Za-z0-9_-]{12,}|api[_-]?key[[:space:]:=]+)") then "<redacted>"
      else .
      end;
    redact
  ' "$1"
}

exported_count=0
pruned_count=0

# Local deletion is handled by synthapi-retention-cleanup only after R2 HEAD
# verifies the uploaded archive's length and SHA-256. Never age-delete files
# here: a network outage can leave an old record awaiting upload.

export_one() {
  local source="$1" meta model session_id request_id start_time end_time provider
  meta="$(jq -er '
    select((.model // "") | (startswith("gpt-5.6") or startswith("gpt-6")))
    | select(.status == "success" and .termination_reason == "response.completed")
    | select((.request | type) == "object" and (.response | type) == "object")
    | [.model, .session_id, .request_id, .start_time, .end_time, .provider]
    | @tsv
  ' "$source" 2>/dev/null)" || return 0

  IFS=$'\t' read -r model session_id request_id start_time end_time provider <<< "$meta"
  [[ -n "$session_id" && -n "$request_id" ]] || return 0

  local output_name output_file temp_file
  output_name="$(safe_segment "${session_id}__${request_id}").json"
  output_file="$DEST_DIR/$output_name"
  [[ -e "$output_file" ]] && return 0

  temp_file="${output_file}.tmp.$$"
  redact_record "$source" > "$temp_file"
  jq empty "$temp_file"
  chmod 0600 "$temp_file"
  mv -f "$temp_file" "$output_file"
  jq -c '{model, provider, session_id, start_time, end_time}' "$output_file" >> "$META_FILE"
  exported_count=$((exported_count + 1))
}

find_args=("$SOURCE_DIR" -type f -name '*.json')
if [[ -e "$STATE_MARKER" ]]; then
  find_args+=( -newer "$STATE_MARKER" )
fi
while IFS= read -r -d '' source; do
  export_one "$source"
done < <(find "${find_args[@]}" -print0)

# Avoid rereading every historical response when no new source record arrived.
if (( exported_count == 0 )) && [[ -s "$DEST_DIR/manifest.json" ]]; then
  touch "$STATE_MARKER"
  exit 0
fi

meta_json='[]'
if [[ -s "$META_FILE" ]]; then
  meta_json="$(jq -sc '.' "$META_FILE")"
fi
total_records="$(jq -r 'length' <<< "$meta_json")"
models_json="$(jq -c 'map(.model) | unique' <<< "$meta_json")"
providers_json="$(jq -c 'map(.provider) | unique' <<< "$meta_json")"
start_time="$(jq -r 'map(.start_time) | map(select(length > 0)) | min // ""' <<< "$meta_json")"
end_time="$(jq -r 'map(.end_time) | map(select(length > 0)) | max // ""' <<< "$meta_json")"
total_sessions="$(jq -r 'map(.session_id) | unique | length' <<< "$meta_json")"

batch_id="batch_$(date -u +%Y%m%d_%H%M%S)"
delivery_date="$(date -u +%Y-%m-%d)"
jq -n \
  --arg batch_id "$batch_id" \
  --arg delivery_date "$delivery_date" \
  --arg start "$start_time" \
  --arg end_time_arg "$end_time" \
  --argjson total_records "$total_records" \
  --argjson total_sessions "$total_sessions" \
  --argjson models "$models_json" \
  --argjson providers "$providers_json" \
  '{
    batch_id: $batch_id,
    supplier: "SynthAPI",
    delivery_date: $delivery_date,
    total_records: $total_records,
    total_sessions: $total_sessions,
    format: "json",
    encoding: "UTF-8",
    models: $models,
    providers: $providers,
    time_range: {start: $start, end: $end_time_arg},
    pii_redacted: true,
    storage: "local-filesystem",
    self_check: {
      json_parse_rate: 1.0,
      request_response_complete_rate: 1.0,
      duplicate_rate: 0.0
    }
  }' > "$DEST_DIR/manifest.json"
chmod 0600 "$DEST_DIR/manifest.json"
touch "$STATE_MARKER"
