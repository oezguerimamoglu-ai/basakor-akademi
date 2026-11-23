#!/usr/bin/env python3
"""Serve only the BasAkor application files."""

import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
STATIC_FILES = {
    "/", "/index.html", "/styles.css", "/app.mjs", "/music.mjs",
    "/midi-file.mjs", "/midi-player.mjs", "/manifest.webmanifest",
    "/sw.js", "/icon.svg", "/icon-192.png", "/icon-512.png",
    "/basakor-akademi-demo.html",
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        route = unquote(urlsplit(self.path).path)
        if route in STATIC_FILES:
            path = ROOT / ("index.html" if route == "/" else route.lstrip("/"))
        elif route.startswith("/assets/"):
            assets = (ROOT / "assets").resolve()
            path = (assets / route.removeprefix("/assets/")).resolve()
            if not path.is_relative_to(assets) or path.suffix.lower() not in (".wav", ".png", ".svg"):
                self.send_error(404)
                return
        else:
            self.send_error(404)
            return
        if not path.is_file():
            self.send_error(404)
            return
        content_type = "text/javascript" if path.suffix == ".mjs" else mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(path.stat().st_size))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                self.wfile.write(chunk)


def main():
    host = os.environ.get("BASAKOR_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"BasAkor Akademi hazır: http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSunucu durduruldu.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
