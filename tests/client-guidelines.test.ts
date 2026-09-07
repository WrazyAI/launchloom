import { it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncClientGuidelines } from "../scripts/sync-client-guidelines.mjs";

it("ships design instructions to client repositories and preserves local instructions on revisions", async () => {
  const client = await fs.mkdtemp(
    path.join(os.tmpdir(), "ll-guidelines-test-"),
  );
  try {
    await syncClientGuidelines(client);
    expect(await fs.readFile(path.join(client, "AGENTS.md"), "utf8")).toContain(
      "docs/site-generation-guidelines.md",
    );
    expect(
      await fs.readFile(
        path.join(client, "docs/site-generation-guidelines.md"),
        "utf8",
      ),
    ).toContain("local-trades");
    await fs.writeFile(
      path.join(client, "AGENTS.md"),
      "Client-specific directions",
    );
    await syncClientGuidelines(client);
    expect(await fs.readFile(path.join(client, "AGENTS.md"), "utf8")).toBe(
      "Client-specific directions",
    );
    await expect(fs.stat(path.join(client, "public"))).rejects.toThrow();
  } finally {
    await fs.rm(client, { recursive: true, force: true });
  }
});
