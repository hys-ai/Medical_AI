# -*- coding: utf-8 -*-
"""书页 · 本地服务：静态页面 + 接口。只用标准库，不需要 gradio。

启动：python server.py [端口]
接口：
  GET  /api/overview  首页数据（教材、最近提问、薄弱点、状态）
  GET  /api/stats     最近提问统计
  POST /api/ask       {"question": "...", "pubmed": true}
  POST /api/pubmed    {"question": "...", "retmax": 5}
"""
import json
import mimetypes
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shuye import pipeline, pubmed, store  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
MAX_BODY = 64 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "Shuye/0.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/stats":
            try:
                self._json(200, store.stats())
            except Exception as e:
                self._json(500, {"error": str(e)})
            return
        if path == "/api/overview":
            try:
                self._json(200, pipeline.overview())
            except Exception as e:
                self._json(500, {"error": str(e)})
            return
        if path in ("/", "/index.html"):
            path = "/index.html"
        safe = os.path.normpath(path.lstrip("/")).replace("\\", "/")
        if safe.startswith(".."):
            self._send(403, "forbidden", "text/plain; charset=utf-8")
            return
        full = os.path.join(WEB, safe)
        if not os.path.isfile(full):
            self._send(404, "not found", "text/plain; charset=utf-8")
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml"):
            ctype += "; charset=utf-8"
        with open(full, "rb") as f:
            self._send(200, f.read(), ctype)

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/api/ask", "/api/pubmed"):
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                self._json(400, {"error": "请求体为空或过大"})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._json(400, {"error": "JSON 解析失败"})
            return

        question = (payload.get("question") or "").strip()
        if not question:
            self._json(400, {"error": "问题不能为空"})
            return
        if len(question) > 300:
            question = question[:300]

        t0 = time.time()
        try:
            if path == "/api/pubmed":
                papers, note = pubmed.search(question, retmax=int(payload.get("retmax", 5)))
                self._json(200, {"papers": papers, "note": note,
                                 "_ms": int((time.time() - t0) * 1000)})
                return
            r = pipeline.ask(question, with_pubmed=bool(payload.get("pubmed", True)),
                             offline=bool(payload.get("offline", False)))
        except Exception as e:
            self._json(500, {"error": "处理失败：%s" % e})
            return
        r["_ms"] = int((time.time() - t0) * 1000)
        self._json(200, r)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7860
    pipeline.boot()
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("书页已启动：http://127.0.0.1:%d" % port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
