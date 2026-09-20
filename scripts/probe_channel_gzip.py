#!/usr/bin/env python3
"""Probe lossless gzip request-body support without exposing upstream details."""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request


SUPPORTED_TYPES = (14, 48)


def local_dsn() -> str:
    configured = os.getenv("SQL_DSN", "").strip()
    if configured:
        return configured
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    try:
        with open(env_path, encoding="utf-8") as env_file:
            for line in env_file:
                key, separator, value = line.partition("=")
                if separator and key.strip() == "SQL_DSN":
                    return value.strip().strip('"').strip("'")
    except OSError:
        pass
    raise RuntimeError("SQL_DSN is not configured")


def psql_json(dsn: str, channel_ids: list[int]) -> list[dict]:
    id_filter = ""
    if channel_ids:
        id_filter = " AND id IN (" + ",".join(str(int(item)) for item in channel_ids) + ")"
    sql = f"""
SELECT COALESCE(json_agg(json_build_object(
  'id', id,
  'type', type,
  'base_url', base_url,
  'key', "key",
  'model', COALESCE(NULLIF(test_model, ''), split_part(models, ',', 1))
) ORDER BY id), '[]'::json)
FROM channels
WHERE status = 1 AND type IN ({','.join(str(item) for item in SUPPORTED_TYPES)}){id_filter};
"""
    raw = subprocess.check_output(["psql", dsn, "-X", "-t", "-A", "-c", sql], text=True).strip()
    return json.loads(raw) if raw else []


def redact(text: str, limit: int = 160) -> str:
    text = " ".join(text.replace("\n", " ").split())
    text = re.sub(r"https?://[^\s,;]+", "[upstream-url-redacted]", text, flags=re.IGNORECASE)
    text = re.sub(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])", "[ip-redacted]", text)
    text = re.sub(
        r"(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])",
        "[ip-redacted]",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\b(?:sk-|cfut_|cfk_)[A-Za-z0-9._-]+", "[key-redacted]", text)
    return text[:limit]


def request_spec(channel: dict) -> tuple[str, dict[str, str], dict]:
    base_url = str(channel.get("base_url") or "").rstrip("/")
    model = str(channel.get("model") or "").strip()
    key = str(channel.get("key") or "").split(",", 1)[0].strip()
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Go-http-client/1.1",
    }
    if int(channel["type"]) == 14:
        headers["x-api-key"] = key
        headers["anthropic-version"] = "2023-06-01"
        return base_url + "/v1/messages", headers, {
            "model": model,
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "ping"}],
        }
    headers["Authorization"] = "Bearer " + key
    return base_url + "/v1/chat/completions", headers, {
        "model": model,
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "ping"}],
    }


def send(channel: dict, use_gzip: bool, timeout: int) -> dict:
    url, headers, payload = request_spec(channel)
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if use_gzip:
        body = gzip.compress(body, compresslevel=1, mtime=0)
        headers["Content-Encoding"] = "gzip"
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read(512)
            return {"status": response.status, "ok": 200 <= response.status < 300}
    except urllib.error.HTTPError as exc:
        preview = redact(exc.read(800).decode("utf-8", "replace"))
        return {"status": exc.code, "ok": False, "preview": preview}
    except Exception as exc:
        return {"status": 0, "ok": False, "preview": redact(str(exc))}


def timed_send(channel: dict, use_gzip: bool, timeout: int) -> dict:
    started = time.monotonic()
    result = send(channel, use_gzip, timeout)
    result["elapsed_ms"] = int((time.monotonic() - started) * 1000)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe gzip support for safe JSON channel types.")
    parser.add_argument("--dsn", default=local_dsn())
    parser.add_argument("--channel-id", action="append", type=int, default=[])
    parser.add_argument("--timeout", type=int, default=45)
    args = parser.parse_args()

    results = []
    for channel in psql_json(args.dsn, args.channel_id):
        compressed = timed_send(channel, True, args.timeout)
        result = {
            "channel_id": int(channel["id"]),
            "channel_type": int(channel["type"]),
            "gzip": compressed,
        }
        if not compressed["ok"]:
            result["identity_control"] = timed_send(channel, False, args.timeout)
        results.append(result)

    print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
    return 0 if all(item["gzip"]["ok"] for item in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
