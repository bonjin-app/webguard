"""Python 3 stdlib WSGI example. Not a production HTTP server."""
import argparse
import html
import json
import os
from pathlib import Path
import re
from urllib.parse import parse_qs
from uuid import uuid4
from wsgiref.simple_server import make_server

ROOT = Path(os.environ.get("WEBGUARD_SSR_OUTPUT", ".demo-dist/ssr-templates")).resolve()
BASE = os.environ.get("WEBGUARD_BASE_PATH", "/")
if not re.fullmatch(r"/(?:[a-zA-Z0-9_-]+/)*", BASE):
    raise ValueError("WEBGUARD_BASE_PATH must be / or /safe-prefix/")
POLICY = json.loads((ROOT / "private/policy.json").read_text())
TEMPLATE = (ROOT / "private/template.html").read_text()


def application(environ, start_response):
    """Explicit routes only: no filesystem fallback or source/template exposure."""
    headers = list(POLICY["headers"].items())
    path = environ.get("PATH_INFO", "")
    method = environ.get("REQUEST_METHOD", "GET")
    status, content_type, body = "404 Not Found", "text/plain; charset=utf-8", b"Not found"
    try:
        query = parse_qs(environ.get("QUERY_STRING", ""), max_num_fields=20)
    except ValueError:
        query = None
    if method not in ("GET", "HEAD"):
        status, body = "405 Method Not Allowed", b"Method not allowed"
        headers.append(("Allow", "GET, HEAD"))
    elif query is None:
        status, body = "400 Bad Request", b"Too many query parameters"
    elif path == BASE:
        name = query.get("name", ["WebGuard"])[0][:200]
        tags = []
        for filename, asset in POLICY["assets"].items():
            url = html.escape(BASE + "assets/" + filename, quote=True)
            integrity = html.escape(asset["integrity"], quote=True)
            if filename.endswith(".css"):
                tags.append(f'<link rel="stylesheet" href="{url}" integrity="{integrity}" crossorigin="anonymous">')
            else:
                tags.append(f'<script src="{url}" defer integrity="{integrity}" crossorigin="anonymous"></script>')
        values = {"runtime": "Python WSGI", "greeting": html.escape(name, quote=True), "requestId": str(uuid4()), "assets": "\n".join(tags), "apiUrl": html.escape(BASE + "api/status", quote=True)}
        rendered = re.sub(r"\{\{(\w+)\}\}", lambda match: values[match.group(1)], TEMPLATE)
        status, content_type, body = "200 OK", "text/html; charset=utf-8", rendered.encode()
    elif path == BASE + "api/status":
        status, content_type = "200 OK", "application/json; charset=utf-8"
        body = json.dumps({"runtime": "Python WSGI", "requestId": str(uuid4())}).encode()
    elif path.startswith(BASE + "assets/"):
        filename = path[len(BASE + "assets/"):]
        if filename in POLICY["assets"]:
            body = (ROOT / "public/assets" / filename).read_bytes()
            status, content_type = "200 OK", POLICY["assets"][filename]["type"]
    headers.extend([("Content-Type", content_type), ("Content-Length", str(len(body)))])
    start_response(status, headers)
    return [b"" if method == "HEAD" else body]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4190)
    args = parser.parse_args()
    with make_server("127.0.0.1", args.port, application) as server:
        server.serve_forever()
