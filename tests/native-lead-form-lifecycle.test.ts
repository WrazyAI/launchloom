import { it, expect } from "vitest";
import fs from "node:fs/promises";
import http from "node:http";
import { chromium } from "playwright";
it.each([false, true])(
  "clears contact fields on success while preserving failed input, preset defaults=%s",
  async (defaults) => {
    const source = await fs.readFile(
      "templates/client-site/src/components/LeadForm.astro",
      "utf8",
    );
    const handler = source.match(
      /<script is:inline[\s\S]*?>([\s\S]*?)<\/script>/u,
    )![1];
    const html = `<main><form class="lead-form" data-guided="false" data-qualification="[]"><input type="hidden" name="lead-token" value="synthetic"><div class="lead-contact-fields"><label>Name<input name="name" required></label><label>Phone<input name="phone" required></label><label>Email<input name="email" type="email" required></label><label>Message<textarea name="message" required></textarea></label></div><button type="submit">Send</button><small class="lead-status" role="status"></small></form></main><script>const apiUrl='https://stage4-provider.invalid';const unconfiguredMessage='Not configured';${handler}</script>`;
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(html);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      let requests = 0;
      await page.route("https://stage4-provider.invalid/api/lead", (route) =>
        route.fulfill({
          status: ++requests === 1 ? 503 : 200,
          contentType: "application/json",
          body:
            requests === 1 ? '{"error":"Synthetic failure"}' : '{"ok":true}',
        }),
      );
      await page.goto("http://127.0.0.1:" + (server.address() as any).port);
      const values = {
        name: "Stage 4 Synthetic",
        phone: "555-0101",
        email: "stage4@example.test",
        message: "Synthetic request",
      };
      for (const [name, value] of Object.entries(values)) {
        const field = page.locator(`form [name="${name}"]`);
        if (defaults)
          await field.evaluate(
            (node, value) => node.setAttribute("value", value),
            value,
          );
        await field.fill(value);
      }
      await page.locator("button[type=submit]").click();
      await page.getByText("Synthetic failure", { exact: true }).waitFor();
      for (const [name, value] of Object.entries(values))
        expect(await page.locator(`form [name="${name}"]`).inputValue()).toBe(
          value,
        );
      await page.locator("button[type=submit]").click();
      await page
        .getByText("Thank you. We will be in touch shortly.", { exact: true })
        .waitFor();
      for (const name of Object.keys(values))
        expect(await page.locator(`form [name="${name}"]`).inputValue()).toBe(
          "",
        );
      expect(await page.locator("[name=lead-token]").inputValue()).toBe(
        "synthetic",
      );
      expect(requests).toBe(2);
    } finally {
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  30000,
);
