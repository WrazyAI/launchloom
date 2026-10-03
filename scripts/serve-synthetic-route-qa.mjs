import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
/** TestSprite-only retargeting of owned fictional artifacts. Never forwards delivery. */
export async function startSyntheticRouteServer({ dist, port = 0 }) {
  const root = path.resolve(dist),
    config = JSON.parse(
      await fs.readFile(path.join(root, "../src/site.config.json"), "utf8"),
    );
  if (
    config.business?.name !== "Fixture Studio" ||
    !config.demoNotice?.toLowerCase().includes("fictional") ||
    config.lead?.apiUrl !== "https://stage4-provider.invalid" ||
    config.lead?.token !== "synthetic-stage4-token"
  )
    throw new Error(
      "Only the owned fictional Stage 4 fixture may use the synthetic QA server.",
    );
  const attempts = new Map(),
    observations = [];
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (req.method !== "POST" || url.pathname !== "/_qa/api/lead") {
          res.statusCode = 405;
          res.end("Synthetic fixture only");
          return;
        }
        let bytes = "";
        for await (const chunk of req) {
          bytes += chunk;
          if (Buffer.byteLength(bytes) > 8192)
            throw new Error("Oversized synthetic request");
        }
        const payload = JSON.parse(bytes);
        if (
          payload.token !== config.lead.token ||
          payload.name !== "Stage 4 Synthetic" ||
          payload.phone !== "555-0101" ||
          payload.email !== "stage4@example.test" ||
          !["Stage 4 synthetic request.", "Stage 4 synthetic request"].includes(
            payload.message,
          )
        )
          throw new Error("Synthetic values required");
        const route = new URL(payload.pageUrl).pathname,
          count = (attempts.get(route) || 0) + 1;
        attempts.set(route, count);
        const status = count % 2 ? 503 : 200;
        observations.push({ route, status });
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify(
            status === 200
              ? { ok: true }
              : { error: "Synthetic delivery failed. No lead was sent." },
          ),
        );
        return;
      }
      const pathname = decodeURIComponent(url.pathname);
      const file = path.resolve(
        root,
        "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
      );
      if (!file.startsWith(root + path.sep)) throw new Error("Unsafe route");
      let bytes = await fs.readFile(file);
      const ext = path.extname(file);
      if ([".html", ".js"].includes(ext))
        bytes = Buffer.from(
          bytes
            .toString()
            .replaceAll("https://stage4-provider.invalid", "/_qa"),
        );
      if (ext === ".html") {
        // TestSprite serializes default/value attributes after filling. Reflect
        // already-empty live fields; never clear a filled field or fake success.
        const observer = `<script>window.addEventListener('launchloom:lead-submitted',()=>{const reflect=()=>{for(const field of document.querySelectorAll('main form input[name="name"],main form input[name="phone"],main form input[name="email"],main form textarea[name="message"]'))if(field.value===''&&field.hasAttribute('value'))field.removeAttribute('value');};setTimeout(reflect,0);requestAnimationFrame(reflect);});</script>`;
        const html = bytes.toString();
        bytes = Buffer.from(
          html.includes("</body>")
            ? html.replace("</body>", observer + "</body>")
            : html + observer,
        );
      }
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".webp": "image/webp",
          ".woff2": "font/woff2",
        }[ext] || "application/octet-stream",
      );
      res.end(bytes);
    } catch {
      res.statusCode = req.method === "POST" ? 400 : 404;
      res.end("Not available in this synthetic fixture.");
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    observations,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = await startSyntheticRouteServer({
    dist: process.argv[2],
    port: Number(process.argv[3] || 4194),
  });
  console.log(
    JSON.stringify({
      origin: server.origin,
      scope: "retargeted fictional artifact; local synthetic provider only",
      externalDelivery: "not_verified",
    }),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await server.close();
      console.log(
        JSON.stringify({
          syntheticRequests: server.observations,
          realDeliveries: 0,
        }),
      );
      process.exit(0);
    });
}
