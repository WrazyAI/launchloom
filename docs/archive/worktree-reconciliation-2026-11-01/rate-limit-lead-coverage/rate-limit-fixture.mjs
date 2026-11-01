import http from "node:http";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LaunchLoom Rate Limiting Demo</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --primary: #0284c7;
      --primary-hover: #0369a1;
      --danger: #dc2626;
      --success: #16a34a;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      max-width: 680px;
      margin: 40px auto;
      padding: 0 20px 60px;
      line-height: 1.5;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .intro {
      color: var(--text-muted);
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      margin-bottom: 2rem;
    }
    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 1rem;
    }
    label {
      display: block;
      margin-bottom: 1rem;
      font-weight: 500;
      font-size: 0.9rem;
    }
    input, textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      margin-top: 4px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 1rem;
      font-family: inherit;
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 1.5rem;
      align-items: center;
    }
    button {
      padding: 10px 18px;
      font-size: 0.95rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      border: none;
      transition: background 0.15s;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-secondary {
      background: #e2e8f0;
      color: #334155;
    }
    .btn-secondary:hover {
      background: #cbd5e1;
    }
    .lead-status, .coverage-status {
      display: block;
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 500;
      min-height: 20px;
    }
    .status-empty {
      display: none;
    }
    .status-success {
      background: #dcfce7;
      color: var(--success);
      border: 1px solid #bbf7d0;
    }
    .status-error {
      background: #fee2e2;
      color: var(--danger);
      border: 1px solid #fecaca;
    }
  </style>
</head>
<body>
  <h1>LaunchLoom Client Site Lead Form</h1>
  <p class="intro">Live interactive demonstration of the sliding-window rate limit protection.</p>

  <section class="card">
    <h2 class="card-title">Send Us an Inquiry</h2>
    <form id="lead-form" class="lead-form">
      <input type="hidden" name="lead-token" value="synthetic-demo-token">
      <label>
        Your name
        <input id="name" name="name" required autocomplete="name" placeholder="Jane Smith">
      </label>
      <label>
        Phone number
        <input id="phone" name="phone" required type="tel" autocomplete="tel" placeholder="555-0123">
      </label>
      <label>
        Email address
        <input id="email" name="email" required type="email" autocomplete="email" placeholder="jane@example.test">
      </label>
      <label>
        How can we help?
        <textarea id="message" name="message" required placeholder="Tell us what you need."></textarea>
      </label>

      <div class="actions">
        <button id="submit-lead" class="lead-submit btn-primary" type="submit">Send request</button>
        <button id="exhaust-quota" class="btn-secondary" type="button">Trigger Rate Limit</button>
      </div>

      <small id="lead-status" class="lead-status status-empty" role="status"></small>
    </form>
  </section>

  <script>
    const form = document.getElementById("lead-form");
    const status = document.getElementById("lead-status");
    const exhaustBtn = document.getElementById("exhaust-quota");

    exhaustBtn.addEventListener("click", async () => {
      await fetch("/api/lead/exhaust", { method: "POST" });
      status.className = "lead-status status-error";
      status.textContent = "Rate limit triggered (quota set to maximum). Submit the form to verify.";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "lead-status";
      status.textContent = "Sending your request...";

      const data = new FormData(form);
      try {
        const response = await fetch("/api/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: data.get("lead-token"),
            name: data.get("name"),
            phone: data.get("phone"),
            email: data.get("email"),
            message: data.get("message"),
            pageUrl: window.location.href,
          })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "We could not send your request.");
        }

        form.reset();
        status.className = "lead-status status-success";
        status.textContent = "Thank you. We will be in touch shortly.";
      } catch (error) {
        status.className = "lead-status status-error";
        status.textContent = error instanceof Error ? error.message : "We could not send your request.";
      }
    });
  </script>
</body>
</html>`;

export function createFixtureServer(port = 4195) {
  let leadCount = 0;
  let forceRateLimit = false;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1:" + port);

    if (req.method === "POST" && url.pathname === "/api/lead/exhaust") {
      forceRateLimit = true;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, forced: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/lead/reset") {
      leadCount = 0;
      forceRateLimit = false;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, reset: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/lead") {
      let body = "";
      for await (const chunk of req) body += chunk;
      leadCount++;

      // When quota is exhausted, respond with exact Cloudflare Worker 429 response
      if (forceRateLimit || leadCount > 2) {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "3600",
        });
        res.end(
          JSON.stringify({
            error:
              "Too many requests from your connection. Please try again later or call the business directly.",
          }),
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  return {
    server,
    listen: () => new Promise((resolve) => server.listen(port, "127.0.0.1", resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const port = Number(process.env.PORT || 4195);
  const fixture = createFixtureServer(port);
  await fixture.listen();
  console.log(`Server listening on http://127.0.0.1:${port}`);
}
