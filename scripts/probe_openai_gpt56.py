#!/usr/bin/env python3
"""Probe configured OpenAI-compatible upstream channels for gpt-5.6.

Default mode is a safe configuration check and does not call upstreams.
Use --live to send a tiny real chat-completions request for each configured
gpt-5.6 model. The report is intentionally written for operators, not only
developers: it hides keys/base URLs and explains which channels can truly serve
requests.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Iterable


DEFAULT_MODELS = ("gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna")


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


@dataclass
class Channel:
    id: int
    name: str
    group: str
    base_url: str
    key: str
    models: str
    model_mapping: str
    test_model: str


def psql_json(dsn: str, sql: str) -> list[dict]:
    raw = subprocess.check_output(
        ["psql", dsn, "-t", "-A", "-c", sql],
        text=True,
    ).strip()
    if not raw:
        return []
    parsed = json.loads(raw)
    return parsed or []


def load_channels(dsn: str, channel_ids: list[int] | None) -> list[Channel]:
    id_filter = ""
    if channel_ids:
        ids = ",".join(str(int(item)) for item in channel_ids)
        id_filter = f" AND id IN ({ids})"
    sql = f"""
SELECT COALESCE(json_agg(json_build_object(
  'id', id,
  'name', name,
  'group', "group",
  'base_url', base_url,
  'key', "key",
  'models', models,
  'model_mapping', model_mapping,
  'test_model', test_model
) ORDER BY id), '[]'::json)
FROM channels
WHERE type = 1
  AND status = 1
  {id_filter};
"""
    rows = psql_json(dsn, sql)
    return [
        Channel(
            id=int(row["id"]),
            name=row.get("name") or "",
            group=row.get("group") or "",
            base_url=(row.get("base_url") or "").rstrip("/"),
            key=((row.get("key") or "").split(",")[0]).strip(),
            models=row.get("models") or "",
            model_mapping=row.get("model_mapping") or "",
            test_model=row.get("test_model") or "",
        )
        for row in rows
    ]


def model_list_urls(base_url: str) -> list[str]:
    base_url = (base_url or "").rstrip("/") or "https://api.openai.com/v1"
    urls = []
    if base_url.endswith("/v1"):
        urls.append(base_url + "/models")
    else:
        urls.append(base_url + "/v1/models")
        urls.append(base_url + "/models")
    return urls


def request_json(
    url: str,
    key: str,
    payload: dict | None = None,
    timeout: int = 30,
    gzip_body: bool = False,
) -> tuple[int, str, object]:
    data = None
    method = "GET"
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "User-Agent": "Go-http-client/1.1",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        method = "POST"
        headers["Content-Type"] = "application/json"
        if gzip_body:
            data = gzip.compress(data, compresslevel=1, mtime=0)
            headers["Content-Encoding"] = "gzip"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(3_000_000)
            content_type = resp.headers.get("content-type") or ""
            if "json" not in content_type.lower():
                return resp.status, content_type, body.decode("utf-8", "replace")[:500]
            return resp.status, content_type, json.loads(body.decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        body = exc.read(1200)
        text = body.decode("utf-8", "replace")
        try:
            parsed: object = json.loads(text)
        except json.JSONDecodeError:
            parsed = text[:500]
        return exc.code, exc.headers.get("content-type") or "", parsed
    except Exception as exc:
        return 0, "", {"error": str(exc)}


def parse_model_ids(data: object) -> list[str]:
    if not isinstance(data, dict):
        return []
    ids: list[str] = []
    for item in data.get("data") or []:
        if isinstance(item, dict) and item.get("id"):
            ids.append(str(item["id"]))
    return ids


def probe_models(channel: Channel, target_models: Iterable[str]) -> dict:
    target_set = set(target_models)
    attempts = []
    for url in model_list_urls(channel.base_url):
        status, content_type, data = request_json(url, channel.key, timeout=20)
        ids = parse_model_ids(data)
        matches = sorted(target_set.intersection(ids))
        attempts.append(
            {
                "url_suffix": "/v1/models" if url.endswith("/v1/models") else "/models",
                "status": status,
                "content_type": content_type,
                "model_count": len(ids),
                "matches": matches,
                "non_json_preview": data if isinstance(data, str) else None,
            }
        )
        if ids:
            return {
                "channel_id": channel.id,
                "channel_name": channel.name,
                "group": channel.group,
                "configured_models": sorted([m for m in target_set if m in split_models(channel.models)]),
                "ok": bool(matches),
                "matches": matches,
                "attempts": attempts,
            }
    return {
        "channel_id": channel.id,
        "channel_name": channel.name,
        "group": channel.group,
        "configured_models": sorted([m for m in target_set if m in split_models(channel.models)]),
        "ok": False,
        "matches": [],
        "attempts": attempts,
    }


def split_models(models: str) -> set[str]:
    return {item.strip() for item in models.split(",") if item.strip()}


def configured_target_models(channel: Channel, target_models: Iterable[str]) -> list[str]:
    haystack = "\n".join([channel.models, channel.model_mapping, channel.test_model]).lower()
    configured = [model for model in target_models if model.lower() in haystack]
    return sorted(set(configured))


def live_probe(channel: Channel, model_name: str, timeout: int, gzip_body: bool) -> dict:
    base_url = channel.base_url or "https://api.openai.com/v1"
    url = base_url.rstrip("/")
    if not url.endswith("/v1"):
        url += "/v1"
    url += "/chat/completions"
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
        "stream": False,
    }
    start = time.time()
    status, content_type, data = request_json(
        url,
        channel.key,
        payload=payload,
        timeout=timeout,
        gzip_body=gzip_body,
    )
    result = {
        "channel_id": channel.id,
        "channel_name": channel.name,
        "group": channel.group,
        "model": model_name,
        "status": status,
        "content_type": content_type,
        "elapsed_ms": int((time.time() - start) * 1000),
        "request_encoding": "gzip" if gzip_body else "identity",
        "ok": 200 <= status < 300,
        "summary": summarize_response(data),
    }
    if should_retry_with_max_completion_tokens(status, data):
        retry_payload = dict(payload)
        retry_payload.pop("max_tokens", None)
        retry_payload["max_completion_tokens"] = 1
        retry_start = time.time()
        retry_status, retry_content_type, retry_data = request_json(
            url,
            channel.key,
            payload=retry_payload,
            timeout=timeout,
            gzip_body=gzip_body,
        )
        result.update(
            {
                "status": retry_status,
                "content_type": retry_content_type,
                "elapsed_ms": result["elapsed_ms"] + int((time.time() - retry_start) * 1000),
                "ok": 200 <= retry_status < 300,
                "summary": summarize_response(retry_data),
                "retried_with": "max_completion_tokens",
            }
        )
    return result


def should_retry_with_max_completion_tokens(status: int, data: object) -> bool:
    if status != 400:
        return False
    text = json.dumps(data, ensure_ascii=False) if isinstance(data, (dict, list)) else str(data)
    text = text.lower()
    return "max_tokens" in text and "max_completion_tokens" in text


def summarize_response(data: object) -> dict:
    if not isinstance(data, dict):
        return {"message": safe_preview(str(data))}
    error = data.get("error")
    if error:
        if isinstance(error, dict):
            return {
                "error_type": error.get("type") or error.get("code") or "error",
                "message": safe_preview(error.get("message") or json.dumps(error, ensure_ascii=False)),
            }
        return {"message": safe_preview(str(error))}
    return {
        "id": data.get("id"),
        "model": data.get("model"),
        "usage": data.get("usage"),
        "choices_count": len(data.get("choices") or []),
    }


def safe_preview(text: str, limit: int = 180) -> str:
    text = text.replace("\n", " ").strip()
    text = " ".join(text.split())
    for marker in ("sk-", "cfut_", "cfk_"):
        if marker in text:
            text = text.split(marker)[0] + marker + "***"
    text = text.replace("Bearer ", "Bearer ***")
    text = re.sub(r"https?://[^\s,;]+", "[upstream-url-redacted]", text, flags=re.IGNORECASE)
    text = re.sub(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])", "[ip-redacted]", text)
    text = re.sub(r"(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])", "[ip-redacted]", text, flags=re.IGNORECASE)
    if len(text) > limit:
        return text[: limit - 3] + "..."
    return text


def format_ms(ms: int) -> str:
    if ms < 1000:
        return f"{ms} ms"
    return f"{ms / 1000:.1f} 秒"


def failure_text(result: dict) -> str:
    summary = result.get("summary") or {}
    message = summary.get("message") or summary.get("error_type") or "上游没有返回明确原因"
    status = result.get("status")
    if status:
        return f"HTTP {status}，{message}"
    return message


def print_config_report(channels: list[Channel], target_models: tuple[str, ...]) -> None:
    candidates = [
        (channel, configured_target_models(channel, target_models))
        for channel in channels
    ]
    candidates = [(channel, models) for channel, models in candidates if models]
    print("GPT-5.6 配置检查")
    print("=" * 72)
    print("说明：这里只检查本地配置，不会请求上游，也不能代表真实可用。")
    print(f"目标模型：{', '.join(target_models)}")
    print(f"配置了这些模型的启用渠道：{len(candidates)} 个")
    print()
    if not candidates:
        print("未发现已启用渠道配置 gpt-5.6。")
        return
    for channel, models in candidates:
        print(f"- 渠道 #{channel.id} {channel.name}｜分组：{channel.group or '未填写'}")
        print(f"  配置模型：{', '.join(models)}")
    print()
    print("要确认真实可请求，请执行：")
    print("  python3 scripts/probe_openai_gpt56.py --live")
    print("如需先测单个渠道：")
    print("  python3 scripts/probe_openai_gpt56.py --live --channel-id 121")


def print_live_report(results: list[dict], target_models: tuple[str, ...], gzip_body: bool) -> None:
    successes = [item for item in results if item.get("ok")]
    failures = [item for item in results if not item.get("ok")]
    by_model: dict[str, list[dict]] = {model: [] for model in target_models}
    for item in successes:
        by_model.setdefault(item["model"], []).append(item)

    print("GPT-5.6 真实请求检测报告")
    print("=" * 72)
    encoding = "gzip" if gzip_body else "未压缩"
    print(f"检测方式：对每个已配置模型发送 1 次最小 chat-completions 请求（{encoding}请求体）。")
    print("输出中已隐藏 API Key 和上游地址。")
    print(f"总请求数：{len(results)}；成功：{len(successes)}；失败：{len(failures)}")
    print()

    print("一、结论：哪些模型已经能真实请求")
    print("-" * 72)
    any_model_success = False
    for model in target_models:
        items = by_model.get(model) or []
        if not items:
            print(f"[失败] {model}：暂未发现可真实请求的渠道")
            continue
        any_model_success = True
        fastest = min(items, key=lambda item: item.get("elapsed_ms") or 10**12)
        print(
            f"[可用] {model}：{len(items)} 个渠道可用；最快 #{fastest['channel_id']} "
            f"{fastest['channel_name']}（{format_ms(fastest['elapsed_ms'])}）"
        )
    if not any_model_success:
        print("本次没有发现可真实请求的 gpt-5.6 模型。")
    print()

    print("二、可用渠道明细")
    print("-" * 72)
    if not successes:
        print("无")
    else:
        for item in sorted(successes, key=lambda x: (x["model"], x["elapsed_ms"], x["channel_id"])):
            returned_model = (item.get("summary") or {}).get("model") or "未返回"
            suffix = f"，返回模型：{returned_model}" if returned_model else ""
            retry = f"，已自动改用 {item['retried_with']}" if item.get("retried_with") else ""
            print(
                f"[可用] #{item['channel_id']} {item['channel_name']}｜{item['model']}｜"
                f"{format_ms(item['elapsed_ms'])}{suffix}{retry}"
            )
    print()

    print("三、失败渠道摘要")
    print("-" * 72)
    if not failures:
        print("无")
    else:
        for item in sorted(failures, key=lambda x: (x["model"], x["channel_id"])):
            print(
                f"[失败] #{item['channel_id']} {item['channel_name']}｜{item['model']}｜"
                f"{failure_text(item)}｜耗时 {format_ms(item['elapsed_ms'])}"
            )
    print()
    print("判定口径：只有收到 2xx 响应才算“可真实请求”；仅出现在本地配置里不算可用。")


def print_json_report(mode: str, target_models: tuple[str, ...], channels: list[Channel], results: list[dict] | None = None) -> None:
    payload = {
        "mode": mode,
        "target_models": list(target_models),
        "configured_channels": [
            {
                "channel_id": channel.id,
                "channel_name": channel.name,
                "group": channel.group,
                "configured_models": configured_target_models(channel, target_models),
            }
            for channel in channels
            if configured_target_models(channel, target_models)
        ],
    }
    if results is not None:
        payload["live_results"] = results
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="检查 gpt-5.6 上游配置，并可用 --live 做真实最小请求检测。")
    parser.add_argument("--dsn", default=local_dsn())
    parser.add_argument("--model", action="append", dest="models", default=[])
    parser.add_argument("--channel-id", action="append", type=int, default=[])
    parser.add_argument("--live", action="store_true", help="发送最小真实请求；会产生极少量上游消耗")
    parser.add_argument("--gzip", action="store_true", help="与 --live 一起使用，发送 Content-Encoding: gzip 请求体")
    parser.add_argument("--timeout", type=int, default=60, help="单次上游请求超时时间，默认 60 秒")
    parser.add_argument("--json", action="store_true", help="输出 JSON，便于机器处理")
    parser.add_argument("--summary", action="store_true", help="仅输出脱敏后的渠道编号、状态和耗时")
    args = parser.parse_args()

    target_models = tuple(args.models or DEFAULT_MODELS)
    channels = load_channels(args.dsn, args.channel_id or None)
    channels = [channel for channel in channels if configured_target_models(channel, target_models)]

    if not args.live:
        if args.json:
            print_json_report("config", target_models, channels)
        else:
            print_config_report(channels, target_models)
        return 0

    results: list[dict] = []
    for channel in channels:
        for model_name in configured_target_models(channel, target_models):
            results.append(live_probe(channel, model_name, args.timeout, args.gzip))

    if args.summary:
        summary = [
            {
                "channel_id": item["channel_id"],
                "model": item["model"],
                "status": item["status"],
                "elapsed_ms": item["elapsed_ms"],
                "request_encoding": item["request_encoding"],
                "ok": item["ok"],
                "error": (item.get("summary") or {}).get("message"),
            }
            for item in results
        ]
        print(json.dumps({"results": summary}, ensure_ascii=False, indent=2))
    elif args.json:
        print_json_report("live", target_models, channels, results)
    else:
        print_live_report(results, target_models, args.gzip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
