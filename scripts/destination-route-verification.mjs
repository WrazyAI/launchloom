import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export const contentDigest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function approvedDestination(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".pages.dev") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    url.port
  )
    throw new Error(
      "Destination origin must be a credential-free approved HTTPS Pages origin.",
    );
  return url.origin;
}
export async function createReleaseManifest({
  dist,
  sourceCommit,
  configDigest,
}) {
  if (
    !/^[a-f0-9]{40}$/u.test(sourceCommit) ||
    !/^[a-f0-9]{64}$/u.test(configDigest)
  )
    throw new Error("Release identity requires full commit and config digest.");
  const files = {};
  async function visit(relative = "") {
    for (const entry of await fs.readdir(path.join(dist, relative), {
      withFileTypes: true,
    })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile() && name !== ".launchloom-release.json") {
        files["/" + name.split(path.sep).join("/")] = contentDigest(
          await fs.readFile(path.join(dist, name)),
        );
      }
    }
  }
  await visit();
  if (!files["/index.html"])
    throw new Error("Release artifact has no homepage.");
  return { version: 1, sourceCommit, configDigest, files };
}
/** GET-only destination readback. Never submits forms or delivers notifications. */
export async function verifyDestinationArtifact({
  origin,
  manifest,
  fetchImpl = fetch,
  timeout = 15000,
}) {
  origin = approvedDestination(origin);
  const failures = [];
  const checks = [];
  async function read(route) {
    return fetchImpl(new URL(route, origin), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
      headers: { "Cache-Control": "no-cache" },
    });
  }
  let actual;
  try {
    const response = await read("/.launchloom-release.json");
    if (response.status !== 200)
      throw new Error("Release manifest HTTP " + response.status);
    actual = await response.json();
    if (
      actual.version !== 1 ||
      actual.sourceCommit !== manifest.sourceCommit ||
      actual.configDigest !== manifest.configDigest ||
      JSON.stringify(Object.entries(actual.files || {}).sort()) !==
        JSON.stringify(Object.entries(manifest.files).sort())
    )
      throw new Error(
        "Destination manifest differs from the approved artifact.",
      );
    checks.push({ name: "release-identity", status: "pass" });
  } catch (error) {
    failures.push(String(error.message));
  }
  if (!failures.length) {
    const entries = Object.entries(manifest.files);
    for (let i = 0; i < entries.length; i += 6)
      await Promise.all(
        entries.slice(i, i + 6).map(async ([route, digest]) => {
          try {
            if (
              !route.startsWith("/") ||
              route.includes("..") ||
              route.includes("?") ||
              route.includes("#")
            )
              throw new Error("Unsafe manifest artifact path.");
            const response = await read(route);
            if (
              response.status !== 200 ||
              contentDigest(Buffer.from(await response.arrayBuffer())) !==
                digest
            )
              throw new Error("Approved artifact bytes not observed.");
            checks.push({ path: route, status: "pass" });
          } catch {
            checks.push({ path: route, status: "fail" });
            failures.push(`${route}: destination artifact readback failed.`);
          }
        }),
      );
  }
  for (const route of [
    "/launchloom-nonexistent/",
    "/services/launchloom-nonexistent/",
    "/locations/launchloom-nonexistent/",
    "/services/__invalid_slug__/",
  ]) {
    try {
      const response = await read(route);
      checks.push({
        path: route,
        http: response.status,
        status: response.status === 404 ? "pass" : "fail",
      });
      if (response.status !== 404)
        failures.push(`${route}: destination must return real HTTP 404.`);
    } catch {
      failures.push(`${route}: destination HTTP 404 not verified.`);
    }
  }
  return {
    version: 1,
    scope: "destination-get-only-artifact-and-http",
    origin,
    status: failures.length ? "fail" : "pass",
    sourceCommit: actual?.sourceCommit || null,
    configDigest: actual?.configDigest || null,
    checks,
    failures,
    conversion: "not_verified",
    mutatingRequests: 0,
  };
}
