#!/usr/bin/env python3
"""Audit SynthAPI public GEO assets without calling model APIs."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


DEFAULT_ORIGIN = "https://synthapi.ecobim.club"
INDEX_ROBOTS = "index,follow"
PRIVATE_ROBOTS = "noindex,nofollow,noarchive"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title_parts: list[str] = []
        self.in_title = False
        self.meta: dict[tuple[str, str], str] = {}
        self.canonical = ""
        self.json_ld: list[str] = []
        self._in_json_ld = False
        self._json_ld_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if tag.lower() == "title":
            self.in_title = True
        elif tag.lower() == "meta":
            if values.get("name"):
                self.meta[("name", values["name"].lower())] = values.get("content", "")
            if values.get("property"):
                self.meta[("property", values["property"].lower())] = values.get("content", "")
        elif tag.lower() == "link" and values.get("rel", "").lower() == "canonical":
            self.canonical = values.get("href", "")
        elif tag.lower() == "script" and values.get("type", "").lower() == "application/ld+json":
            self._in_json_ld = True
            self._json_ld_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False
        elif tag.lower() == "script" and self._in_json_ld:
            self.json_ld.append("".join(self._json_ld_parts).strip())
            self._in_json_ld = False
            self._json_ld_parts = []

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        if self._in_json_ld:
            self._json_ld_parts.append(data)

    @property
    def title(self) -> str:
        return "".join(self.title_parts).strip()


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str


class GEOAudit:
    def __init__(self, base_url: str, expected_origin: str, timeout: float) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.expected_origin = expected_origin.rstrip("/")
        self.timeout = timeout
        self.results: list[CheckResult] = []

    def check(self, name: str, condition: bool, detail: str) -> None:
        self.results.append(CheckResult(name=name, ok=bool(condition), detail=detail))

    def fetch(self, path: str) -> tuple[int, str, str]:
        url = urljoin(self.base_url, path.lstrip("/"))
        request = Request(url, headers={"User-Agent": "SynthAPI-GEO-Audit/1.0"})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                body = response.read().decode("utf-8", errors="replace")
                return response.status, response.headers.get("Content-Type", ""), body
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            return error.code, error.headers.get("Content-Type", ""), body
        except (URLError, TimeoutError, OSError) as error:
            self.check(f"GET {path}", False, str(error))
            return 0, "", ""

    def audit_html(
        self,
        path: str,
        canonical_path: str,
        robots_fragment: str,
        schema_type: str,
        required_text: str,
        title_fragment: str,
    ) -> None:
        status, content_type, body = self.fetch(path)
        if status == 0:
            return
        prefix = f"GET {path}"
        self.check(prefix + " status", status == 200, f"status={status}")
        self.check(prefix + " content type", "text/html" in content_type.lower(), content_type)

        parser = PageParser()
        parser.feed(body)
        expected_canonical = self.expected_origin + canonical_path
        robots = parser.meta.get(("name", "robots"), "")
        schema_types: set[str] = set()
        for raw_schema in parser.json_ld:
            try:
                schema = json.loads(raw_schema)
            except json.JSONDecodeError:
                continue
            if isinstance(schema, dict) and isinstance(schema.get("@type"), str):
                schema_types.add(schema["@type"])

        self.check(prefix + " title", title_fragment in parser.title, parser.title)
        self.check(prefix + " canonical", parser.canonical == expected_canonical, parser.canonical)
        self.check(prefix + " robots", robots_fragment in robots, robots)
        self.check(prefix + " JSON-LD", schema_type in schema_types, ",".join(sorted(schema_types)) or "missing")
        self.check(prefix + " direct answer", required_text in body, required_text)

    def audit_asset(self, path: str, content_type_fragment: str, required_text: str) -> str:
        status, content_type, body = self.fetch(path)
        if status == 0:
            return body
        prefix = f"GET {path}"
        self.check(prefix + " status", status == 200, f"status={status}")
        self.check(prefix + " content type", content_type_fragment in content_type.lower(), content_type)
        self.check(prefix + " content", required_text in body, required_text)
        return body

    def run(self) -> list[CheckResult]:
        self.audit_html(
            "/home", "/home", INDEX_ROBOTS, "SoftwareApplication",
            "统一 API Key", "SynthAPI",
        )
        self.audit_html(
            "/about", "/about", INDEX_ROBOTS, "AboutPage",
            "基于 Sub2API 开源项目构建", "SynthAPI 是什么",
        )
        self.audit_html(
            "/guide/troubleshooting", "/guide/troubleshooting", INDEX_ROBOTS, "TechArticle",
            "503 通常表示", "503",
        )
        self.audit_html(
            "/dashboard", "/home", PRIVATE_ROBOTS, "WebPage",
            "不作为公开搜索内容", "SynthAPI",
        )

        robots = self.audit_asset(
            "/robots.txt", "text/plain", f"Sitemap: {self.expected_origin}/sitemap.xml",
        )
        self.check("robots allows public paths", "Allow: /" in robots, "Allow: /")
        for disallowed in ("Disallow: /admin/", "Disallow: /api/", "Disallow: /v1/"):
            self.check("robots protects private paths", disallowed in robots, disallowed)

        sitemap = self.audit_asset("/sitemap.xml", "xml", self.expected_origin + "/about")
        for forbidden in ("/dashboard", "/admin/", "/api/", "/v1/"):
            self.check("sitemap excludes private paths", forbidden not in sitemap, forbidden)

        self.audit_asset("/llms.txt", "text/plain", "# SynthAPI")
        self.audit_asset("/ai/brand-facts.md", "text/plain", "SynthAPI 产品事实与表述边界")
        return self.results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_ORIGIN, help="URL to request, for example http://127.0.0.1:8080")
    parser.add_argument("--expected-origin", default=DEFAULT_ORIGIN, help="Expected public canonical origin")
    parser.add_argument("--timeout", type=float, default=15.0, help="Per-request timeout in seconds")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of a text report")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    results = GEOAudit(args.base_url, args.expected_origin, args.timeout).run()
    failed = [result for result in results if not result.ok]
    if args.json:
        print(json.dumps({
            "ok": not failed,
            "base_url": args.base_url,
            "expected_origin": args.expected_origin,
            "checks": [asdict(result) for result in results],
        }, ensure_ascii=False, indent=2))
    else:
        for result in results:
            marker = "PASS" if result.ok else "FAIL"
            print(f"[{marker}] {result.name}: {result.detail}")
        print(f"GEO audit: {len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
