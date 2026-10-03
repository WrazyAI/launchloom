import { it, expect } from "vitest";
import { verifyDestinationArtifact } from "../scripts/destination-route-verification.mjs";
import { createHash } from "node:crypto";
const html = "<main>Approved synthetic HTML</main>";
const digest = createHash("sha256").update(html).digest("hex");
const manifest = {
  version: 1,
  sourceCommit: "a".repeat(40),
  configDigest: "b".repeat(64),
  files: { "/index.html": digest },
};
const fetcher =
  (changed = false, soft404 = false) =>
  async (url: any) => {
    const p = new URL(url).pathname;
    if (p === "/.launchloom-release.json")
      return new Response(JSON.stringify(manifest));
    if (p === "/index.html")
      return new Response(changed ? "Old content" : html);
    return new Response("Not found", { status: soft404 ? 200 : 404 });
  };
it("reads back source commit and built bytes from the intended HTTPS Pages destination", async () => {
  const result = await verifyDestinationArtifact({
    origin: "https://fixture.pages.dev",
    manifest,
    fetchImpl: fetcher(),
  });
  expect(result.status).toBe("pass");
  expect(result.sourceCommit).toBe(manifest.sourceCommit);
});
it("blocks a stale destination even if its manifest names the approved commit", async () => {
  expect(
    (
      await verifyDestinationArtifact({
        origin: "https://fixture.pages.dev",
        manifest,
        fetchImpl: fetcher(true),
      })
    ).status,
  ).toBe("fail");
});
it("blocks soft 404s separately from successful artifact readback", async () => {
  expect(
    (
      await verifyDestinationArtifact({
        origin: "https://fixture.pages.dev",
        manifest,
        fetchImpl: fetcher(false, true),
      })
    ).failures.join(" "),
  ).toContain("404");
});
it("rejects credential-bearing or unapproved origins", async () => {
  await expect(
    verifyDestinationArtifact({
      origin: "https://user:secret@fixture.pages.dev",
      manifest,
      fetchImpl: fetcher(),
    }),
  ).rejects.toThrow("origin");
});
