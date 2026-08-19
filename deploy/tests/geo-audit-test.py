#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "geo-audit.py"
SPEC = importlib.util.spec_from_file_location("geo_audit", SCRIPT_PATH)
assert SPEC and SPEC.loader
GEO_AUDIT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = GEO_AUDIT
SPEC.loader.exec_module(GEO_AUDIT)

ORIGIN = "https://synthapi.ecobim.club"


def html_page(title: str, canonical: str, robots: str, schema_type: str, answer: str) -> bytes:
    schema = json.dumps({"@context": "https://schema.org", "@type": schema_type}, ensure_ascii=False)
    return f"""<!doctype html><html><head>
<title>{title}</title><meta name="robots" content="{robots}">
<link rel="canonical" href="{canonical}">
<script type="application/ld+json">{schema}</script></head>
<body><main>{answer}</main></body></html>""".encode()


class AuditHandler(BaseHTTPRequestHandler):
    broken_about = False

    def do_GET(self) -> None:
        pages = {
            "/home": html_page("SynthAPI - 多模型 AI API 网关", ORIGIN + "/home", "index,follow", "SoftwareApplication", "统一 API Key"),
            "/about": html_page("SynthAPI 是什么", ORIGIN + ("/wrong" if self.broken_about else "/about"), "index,follow", "AboutPage", "基于 Sub2API 开源项目构建"),
            "/guide/troubleshooting": html_page("SynthAPI 503 排查", ORIGIN + "/guide/troubleshooting", "index,follow", "TechArticle", "503 通常表示没有可用上游"),
            "/dashboard": html_page("SynthAPI", ORIGIN + "/home", "noindex,nofollow,noarchive", "WebPage", "不作为公开搜索内容"),
        }
        assets = {
            "/robots.txt": ("text/plain; charset=utf-8", f"User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /v1/\nSitemap: {ORIGIN}/sitemap.xml\n"),
            "/sitemap.xml": ("application/xml", f"<urlset><url><loc>{ORIGIN}/about</loc></url></urlset>"),
            "/llms.txt": ("text/plain; charset=utf-8", "# SynthAPI\n"),
            "/ai/brand-facts.md": ("text/plain; charset=utf-8", "# SynthAPI 产品事实与表述边界\n"),
        }
        if self.path in pages:
            body = pages[self.path]
            content_type = "text/html; charset=utf-8"
        elif self.path in assets:
            content_type, text = assets[self.path]
            body = text.encode()
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


class GEOAuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), AuditHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def test_valid_site_passes(self) -> None:
        AuditHandler.broken_about = False
        results = GEO_AUDIT.GEOAudit(self.base_url, ORIGIN, 2).run()
        self.assertTrue(results)
        self.assertTrue(all(result.ok for result in results))

    def test_wrong_canonical_fails(self) -> None:
        AuditHandler.broken_about = True
        results = GEO_AUDIT.GEOAudit(self.base_url, ORIGIN, 2).run()
        failed_names = {result.name for result in results if not result.ok}
        self.assertIn("GET /about canonical", failed_names)
        AuditHandler.broken_about = False


if __name__ == "__main__":
    unittest.main()
