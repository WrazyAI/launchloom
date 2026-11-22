import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_BUCKET = "launchloom-reference-library";
export const DEFAULT_KEY_PREFIX = "v1/sha256";
export const DEFAULT_MANIFEST_RELATIVE =
  "data/reference-library/r2-asset-manifest.json";
export const DEFAULT_CACHE_DIR = path.join(
  os.homedir(),
  ".cache",
  "launchloom-reference-pngs",
);
const CONTACT_SHEET_RELATIVE =
  "data/reference-library/core-collection-hero-contact-sheet.png";
const DOSSIERS_RELATIVE = "data/reference-library/dossiers";
const MANIFEST_VERSION = 1;
const RETRY_DELAYS_MS = [500, 1500, 4000];

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function parseDotEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = {};
    for (const line of raw.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/gu, "");
      if (key) parsed[key] = value;
    }
    return parsed;
  } catch {
    return {};
  }
}

function findSharedRepoEnvPath(root) {
  const direct = path.join(root, ".env");
  if (fs.existsSync(direct)) return direct;
  // In a git worktree, .git is a file pointing to <main-repo>/.git/worktrees/<name>.
  try {
    const dotGit = path.join(root, ".git");
    if (fs.statSync(dotGit).isFile()) {
      const content = fs.readFileSync(dotGit, "utf8");
      const match = content.match(/^gitdir:\s*(.+)$/mu);
      if (match) {
        const gitDir = path.resolve(root, match[1].trim());
        const mainGitDir = path.resolve(gitDir, "..", "..");
        const mainRepoRoot = path.dirname(mainGitDir);
        const sharedEnv = path.join(mainRepoRoot, ".env");
        if (fs.existsSync(sharedEnv)) return sharedEnv;
      }
    }
  } catch {
    // Ignore gitdir lookup errors and fall back to process.env only.
  }
  return null;
}

export function resolveCloudflareConfig({
  env = process.env,
  root = process.cwd(),
  allowDotEnv = true,
} = {}) {
  let accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  let apiToken = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  const baseUrl = String(env.REFERENCE_ASSETS_BASE_URL || "")
    .trim()
    .replace(/\/+$/u, "");
  if (allowDotEnv && (!accountId || !apiToken)) {
    const envPath = findSharedRepoEnvPath(root);
    if (envPath) {
      const fileEnv = parseDotEnvFile(envPath);
      if (!accountId && fileEnv.CLOUDFLARE_ACCOUNT_ID)
        accountId = fileEnv.CLOUDFLARE_ACCOUNT_ID;
      if (!apiToken && fileEnv.CLOUDFLARE_API_TOKEN)
        apiToken = fileEnv.CLOUDFLARE_API_TOKEN;
    }
  }
  return { accountId, apiToken, baseUrl };
}

export async function discoverReferencePngs(root = process.cwd()) {
  const found = [];
  const dossiersDir = path.join(root, DOSSIERS_RELATIVE);
  const entries = await fsp
    .readdir(dossiersDir, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const screenshotsDir = path.join(dossiersDir, entry.name, "screenshots");
    const files = await fsp
      .readdir(screenshotsDir, { withFileTypes: true })
      .catch(() => []);
    for (const file of files) {
      if (!file.isFile() || !file.name.toLowerCase().endsWith(".png")) continue;
      found.push(
        toPosix(
          path.join(DOSSIERS_RELATIVE, entry.name, "screenshots", file.name),
        ),
      );
    }
  }
  const contactSheetAbs = path.join(root, CONTACT_SHEET_RELATIVE);
  if (
    await fsp
      .stat(contactSheetAbs)
      .then((stat) => stat.isFile())
      .catch(() => false)
  ) {
    found.push(CONTACT_SHEET_RELATIVE);
  }
  return found.sort();
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object")
    throw new Error("Invalid R2 reference asset manifest.");
  if (manifest.version !== MANIFEST_VERSION)
    throw new Error(
      `Unsupported R2 reference asset manifest version: ${manifest.version}`,
    );
  if (typeof manifest.bucket !== "string" || !manifest.bucket.trim())
    throw new Error("R2 reference asset manifest is missing bucket.");
  if (!Array.isArray(manifest.assets))
    throw new Error("R2 reference asset manifest is missing assets array.");
  for (const asset of manifest.assets) {
    if (
      typeof asset?.path !== "string" ||
      !asset.path.startsWith("data/reference-library/") ||
      asset.path.includes("..")
    )
      throw new Error(`Unsafe manifest asset path: ${asset?.path}`);
    if (!/^[a-f0-9]{64}$/u.test(String(asset.sha256 || "")))
      throw new Error(`Invalid sha256 for manifest asset ${asset.path}`);
    if (!Number.isInteger(asset.bytes) || asset.bytes <= 0)
      throw new Error(`Invalid byte length for manifest asset ${asset.path}`);
    if (typeof asset.key !== "string" || !asset.key.trim())
      throw new Error(`Missing R2 key for manifest asset ${asset.path}`);
  }
  return manifest;
}

async function fileMatchesEntry(filePath, entry) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size !== entry.bytes) return false;
    const bytes = await fsp.readFile(filePath);
    return bytes.byteLength === entry.bytes && sha256Buffer(bytes) === entry.sha256;
  } catch {
    return false;
  }
}

async function atomicWriteFile(filePath, bytes) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
  try {
    await fsp.writeFile(tmpPath, bytes);
    await fsp.rename(tmpPath, filePath);
  } catch (error) {
    await fsp.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}

function isTransientStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

async function withRetries(fn, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt >= RETRY_DELAYS_MS.length) throw error;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function runPool(items, concurrency, worker) {
  const limit = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  const results = new Array(items.length);
  let nextIndex = 0;
  let fatalError = null;
  const runWorker = async () => {
    while (!fatalError) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        if (!fatalError) fatalError = error;
        return;
      }
    }
  };
  if (items.length)
    await Promise.all(Array.from({ length: limit }, () => runWorker()));
  if (fatalError) throw fatalError;
  return results;
}

function r2ObjectUrl({ accountId, bucket, key }) {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`;
}

export async function listExistingR2Keys({
  accountId,
  apiToken,
  bucket = DEFAULT_BUCKET,
  prefix = DEFAULT_KEY_PREFIX,
  fetchImpl = fetch,
}) {
  const keys = new Set();
  let cursor = "";
  while (true) {
    const params = new URLSearchParams({
      prefix: prefix ? `${prefix.replace(/\/+$/u, "")}/` : "",
      per_page: "1000",
    });
    if (cursor) params.set("cursor", cursor);
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects?${params.toString()}`;
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to list R2 bucket ${bucket} (HTTP ${response.status}).`,
      );
    }
    const payload = await response.json();
    const list = Array.isArray(payload?.result) ? payload.result : [];
    for (const item of list) {
      if (typeof item?.key === "string") keys.add(item.key);
    }
    const nextCursor = payload?.result_info?.cursor;
    const truncated = payload?.result_info?.is_truncated === true;
    if (!truncated || !nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  return keys;
}

/**
 * @param {{
 *   root?: string,
 *   manifestPath?: string,
 *   bucket?: string,
 *   keyPrefix?: string,
 *   concurrency?: number,
 *   env?: Record<string, string | undefined>,
 *   allowDotEnv?: boolean,
 *   fetchImpl?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>,
 * }} [options]
 */
export async function uploadReferenceAssets({
  root = process.cwd(),
  manifestPath = path.join(root, DEFAULT_MANIFEST_RELATIVE),
  bucket = DEFAULT_BUCKET,
  keyPrefix = DEFAULT_KEY_PREFIX,
  concurrency = 8,
  env = process.env,
  allowDotEnv = true,
  fetchImpl = fetch,
  sleep = undefined,
} = {}) {
  const { accountId, apiToken } = resolveCloudflareConfig({
    env,
    root,
    allowDotEnv,
  });
  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required to upload reference assets to R2.",
    );
  }
  const relativePaths = await discoverReferencePngs(root);
  if (!relativePaths.length) {
    throw new Error(
      "No reference library PNGs found on disk to upload to R2.",
    );
  }
  const assets = [];
  const uniqueByKey = new Map();
  for (const relPath of relativePaths) {
    const absPath = path.join(root, relPath);
    const bytes = await fsp.readFile(absPath);
    const sha256 = sha256Buffer(bytes);
    const key = `${keyPrefix.replace(/\/+$/u, "")}/${sha256}.png`;
    const entry = {
      path: relPath,
      sha256,
      bytes: bytes.byteLength,
      key,
      contentType: "image/png",
    };
    assets.push(entry);
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, { entry, absPath });
  }
  const existingKeys = await listExistingR2Keys({
    accountId,
    apiToken,
    bucket,
    prefix: keyPrefix,
    fetchImpl,
  });
  const pending = [...uniqueByKey.values()].filter(
    ({ entry }) => !existingKeys.has(entry.key),
  );
  let uploaded = 0;
  await runPool(pending, concurrency, async ({ entry, absPath }) => {
    const body = await fsp.readFile(absPath);
    const url = r2ObjectUrl({ accountId, bucket, key: entry.key });
    await withRetries(
      async () => {
        let response;
        try {
          response = await fetchImpl(url, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": entry.contentType,
            },
            body,
          });
        } catch (networkError) {
          const err = new Error(
            `Network error uploading ${entry.key}: ${networkError?.message || networkError}`,
          );
          err.retryable = true;
          throw err;
        }
        if (!response.ok) {
          const err = new Error(
            `R2 upload failed for ${entry.key} (HTTP ${response.status}).`,
          );
          err.retryable = isTransientStatus(response.status);
          throw err;
        }
      },
      { sleep },
    );
    uploaded += 1;
  });
  const manifest = {
    version: MANIFEST_VERSION,
    bucket,
    keyPrefix,
    assets,
  };
  await atomicWriteFile(
    manifestPath,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  );
  return {
    total: assets.length,
    uniqueKeys: uniqueByKey.size,
    uploaded,
    skipped: uniqueByKey.size - uploaded,
    manifestPath,
  };
}

/**
 * @param {{
 *   root?: string,
 *   manifestPath?: string,
 *   cacheDir?: string,
 *   concurrency?: number,
 *   filter?: string,
 *   env?: Record<string, string | undefined>,
 *   allowDotEnv?: boolean,
 *   fetchImpl?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>,
 * }} [options]
 */
export async function hydrateReferenceAssets({
  root = process.cwd(),
  manifestPath = path.join(root, DEFAULT_MANIFEST_RELATIVE),
  cacheDir = DEFAULT_CACHE_DIR,
  concurrency = 16,
  filter = "",
  env = process.env,
  allowDotEnv = true,
  fetchImpl = fetch,
  sleep = undefined,
} = {}) {
  const manifest = validateManifest(
    JSON.parse(await fsp.readFile(manifestPath, "utf8")),
  );
  const filterNorm = String(filter || "").trim();
  const entries = filterNorm
    ? manifest.assets.filter((entry) => entry.path.includes(filterNorm))
    : manifest.assets;
  const resolvedCacheDir = cacheDir ? path.resolve(cacheDir) : "";
  const { accountId, apiToken, baseUrl } = resolveCloudflareConfig({
    env,
    root,
    allowDotEnv,
  });

  // Deduplicate concurrent downloads of identical sha256 keys.
  const inflightDownloads = new Map();
  const fetchBytesForEntry = (entry) => {
    if (inflightDownloads.has(entry.key)) return inflightDownloads.get(entry.key);
    const promise = (async () => {
      if (!baseUrl && (!accountId || !apiToken)) {
        throw new Error(
          `Missing reference asset ${entry.path} and no local cache hit. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (or REFERENCE_ASSETS_BASE_URL) to hydrate from R2 bucket ${manifest.bucket}.`,
        );
      }
      const url = baseUrl
        ? `${baseUrl}/${entry.key}`
        : r2ObjectUrl({
            accountId,
            bucket: manifest.bucket,
            key: entry.key,
          });
      const headers = baseUrl ? {} : { Authorization: `Bearer ${apiToken}` };
      const bytes = await withRetries(
        async () => {
          let response;
          try {
            response = await fetchImpl(url, { method: "GET", headers });
          } catch (networkError) {
            const err = new Error(
              `Network error downloading ${entry.key}: ${networkError?.message || networkError}`,
            );
            err.retryable = true;
            throw err;
          }
          if (!response.ok) {
            const err = new Error(
              `R2 download failed for ${entry.path} (${entry.key}, HTTP ${response.status}).`,
            );
            err.retryable = isTransientStatus(response.status);
            throw err;
          }
          return Buffer.from(await response.arrayBuffer());
        },
        { sleep },
      );
      if (bytes.byteLength !== entry.bytes || sha256Buffer(bytes) !== entry.sha256) {
        throw new Error(
          `Integrity check failed for ${entry.path}: expected ${entry.bytes} bytes (${entry.sha256.slice(0, 12)}), received ${bytes.byteLength} bytes (${sha256Buffer(bytes).slice(0, 12)}).`,
        );
      }
      if (resolvedCacheDir) {
        const cacheFile = path.join(resolvedCacheDir, `${entry.sha256}.png`);
        if (!(await fileMatchesEntry(cacheFile, entry))) {
          await atomicWriteFile(cacheFile, bytes);
        }
      }
      return bytes;
    })();
    inflightDownloads.set(entry.key, promise);
    return promise;
  };

  let present = 0;
  let cached = 0;
  let downloaded = 0;

  await runPool(entries, concurrency, async (entry) => {
    const destPath = path.join(root, entry.path);
    if (await fileMatchesEntry(destPath, entry)) {
      present += 1;
      return;
    }
    if (resolvedCacheDir) {
      const cacheFile = path.join(resolvedCacheDir, `${entry.sha256}.png`);
      if (await fileMatchesEntry(cacheFile, entry)) {
        const bytes = await fsp.readFile(cacheFile);
        await atomicWriteFile(destPath, bytes);
        cached += 1;
        return;
      }
    }
    const bytes = await fetchBytesForEntry(entry);
    await atomicWriteFile(destPath, bytes);
    downloaded += 1;
  });

  return {
    total: entries.length,
    present,
    cached,
    downloaded,
    bucket: manifest.bucket,
  };
}

export async function verifyReferenceAssets({
  root = process.cwd(),
  manifestPath = path.join(root, DEFAULT_MANIFEST_RELATIVE),
  filter = "",
} = {}) {
  const manifest = validateManifest(
    JSON.parse(await fsp.readFile(manifestPath, "utf8")),
  );
  const filterNorm = String(filter || "").trim();
  const entries = filterNorm
    ? manifest.assets.filter((entry) => entry.path.includes(filterNorm))
    : manifest.assets;
  const failures = [];
  await runPool(entries, 16, async (entry) => {
    const destPath = path.join(root, entry.path);
    if (!(await fileMatchesEntry(destPath, entry))) {
      failures.push(entry.path);
    }
  });
  if (failures.length) {
    throw new Error(
      `Reference asset verification failed for ${failures.length} file(s): ${failures.slice(0, 5).join(", ")}${failures.length > 5 ? " ..." : ""}`,
    );
  }
  return { total: entries.length, verified: entries.length };
}

function parseCliArgs(argv) {
  const command = argv[2] || "pull";
  const opts = {};
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i += 1;
    }
  }
  return { command, opts };
}

async function main() {
  const { command, opts } = parseCliArgs(process.argv);
  const root = opts.root ? path.resolve(String(opts.root)) : process.cwd();
  const manifestPath = opts.manifest
    ? path.resolve(String(opts.manifest))
    : path.join(root, DEFAULT_MANIFEST_RELATIVE);
  const concurrency = opts.concurrency ? Number(opts.concurrency) : undefined;
  const cacheDir =
    opts["no-cache"] === true
      ? ""
      : opts["cache-dir"]
        ? path.resolve(String(opts["cache-dir"]))
        : DEFAULT_CACHE_DIR;

  if (command === "push") {
    const result = await uploadReferenceAssets({
      root,
      manifestPath,
      bucket: opts.bucket ? String(opts.bucket) : DEFAULT_BUCKET,
      concurrency: concurrency || 8,
    });
    console.log(JSON.stringify({ command: "push", ...result }));
    return;
  }
  if (command === "pull") {
    const result = await hydrateReferenceAssets({
      root,
      manifestPath,
      cacheDir,
      concurrency: concurrency || 16,
      filter: opts.filter ? String(opts.filter) : "",
    });
    console.log(JSON.stringify({ command: "pull", ...result }));
    return;
  }
  if (command === "verify") {
    const result = await verifyReferenceAssets({
      root,
      manifestPath,
      filter: opts.filter ? String(opts.filter) : "",
    });
    console.log(JSON.stringify({ command: "verify", ...result }));
    return;
  }
  throw new Error(
    `Unknown command '${command}'. Use 'pull', 'push', or 'verify'.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
