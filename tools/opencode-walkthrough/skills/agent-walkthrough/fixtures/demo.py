"""Serve a disposable Sites panel, with no persistence or external calls."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer

PAGE = """<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Walkthrough fixture</title>
<style>
body { margin: 3rem; font: 1rem system-ui; color: #17243c; background: #f3f5fa }
aside { margin-top: 1rem; max-width: 24rem; border: 1px solid #62748f;
  padding: 1rem; background: white; border-radius: .5rem }
button { padding: .6rem 1rem; margin-right: .5rem }
</style>
<main>
<h1>Site workspace</h1>
<p>Disposable walkthrough fixture</p>
<button type="button" id="toggle" aria-controls="sites" aria-expanded="false">Sites</button>
<aside id="sites" hidden aria-label="Sites panel">
  <h2>Sites</h2>
  <button type="button" id="active">Show active only</button>
  <p id="summary" role="status">Showing 2 sites</p>
  <ul><li>Harbor (active)</li><li id="draft">Meadow (draft)</li></ul>
</aside>
</main>
<script>
const broken = BROKEN;
const toggle = document.getElementById("toggle");
const panel = document.getElementById("sites");
toggle.addEventListener("click", () => {
  panel.hidden = !panel.hidden;
  toggle.setAttribute("aria-expanded", String(!panel.hidden));
});
document.getElementById("active").addEventListener("click", () => {
  if (broken) return;
  document.getElementById("draft").hidden = true;
  document.getElementById("summary").textContent = "Showing 1 active site";
});
</script>
</html>"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="serve on IPv4 loopback only")
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("--broken", action="store_true", help="make the filter ineffective")
    args = parser.parse_args()
    page = PAGE.replace("BROKEN", "true" if args.broken else "false").encode()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/":
                body, media = page, "text/html; charset=utf-8"
            elif self.path == "/health":
                body, media = b'{"ok": true}', "application/json"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", media)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    with HTTPServer(("127.0.0.1", args.port), Handler) as server:
        print(f"http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
