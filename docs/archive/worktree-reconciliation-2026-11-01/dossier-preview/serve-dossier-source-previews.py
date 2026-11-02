"""Local-only source review; prevent retained forms from sending submissions."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "artifacts/dossier-source-previews"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Content-Security-Policy", "form-action 'none'; connect-src 'none'; frame-ancestors 'none'")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        super().end_headers()


if __name__ == "__main__":
    print("Source dossier review: http://127.0.0.1:4327", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 4327), Handler).serve_forever()
