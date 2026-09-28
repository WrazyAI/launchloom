import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const INHERITED_BUILD_ENV_KEYS = Object.freeze([
  "PATH",
  "CI",
  "NODE_ENV",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SystemRoot",
  "COMSPEC",
  "PATHEXT",
  "PUBLIC_REVIEW_MODE",
  "PUBLIC_SITE_URL",
  "PUBLIC_LAUNCHLOOM_API_URL",
  "PUBLIC_LAUNCHLOOM_URL",
  "PUBLIC_CREATIVE_DIAGNOSTIC",
  "PLAYWRIGHT_BROWSERS_PATH",
]);

const SAFE_BUILD_OVERRIDE_KEYS = new Set([...INHERITED_BUILD_ENV_KEYS, "HOME"]);

/**
 * Build a minimal environment for running client-controlled package scripts.
 * Secret-bearing and credential-helper variables are never inherited. HOME
 * must be explicitly overridden with a fresh, isolated temporary directory.
 * @param {NodeJS.ProcessEnv} [source]
 * @param {NodeJS.ProcessEnv} [overrides]
 * @returns {NodeJS.ProcessEnv}
 */
export function clientBuildEnvironment(source = process.env, overrides = {}) {
  const environment = {};
  for (const key of INHERITED_BUILD_ENV_KEYS) {
    const value = source[key];
    if (typeof value === "string") environment[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!SAFE_BUILD_OVERRIDE_KEYS.has(key)) continue;
    if (typeof value === "string") environment[key] = value;
  }
  return environment;
}

const CLIENT_BUILD_EXCLUDED_ENTRIES = new Set([
  ".git",
  ".launchloom",
  ".wrangler",
  "dist",
  "node_modules",
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".pypirc",
  "credentials",
  "secrets",
  ".secrets",
]);

function sensitiveBuildInputName(name) {
  return (
    name.startsWith(".env") ||
    /(?:^|[._-])(?:secret|credential|private[-_]?key|token)(?:[._-]|$)/iu.test(
      name,
    ) ||
    /\.(?:pem|key|p12|pfx)$/iu.test(name)
  );
}

export async function copyClientBuildInput(sourceRoot, targetRoot) {
  await fs.cp(sourceRoot, targetRoot, {
    recursive: true,
    filter: async (sourcePath) => {
      const relative = path.relative(sourceRoot, sourcePath);
      if (
        relative
          .split(path.sep)
          .some(
            (segment) =>
              CLIENT_BUILD_EXCLUDED_ENTRIES.has(segment) ||
              sensitiveBuildInputName(segment),
          )
      )
        return false;
      const stat = await fs.lstat(sourcePath);
      return !stat.isSymbolicLink();
    },
  });
}

export function clientProcessIsolationRequired({
  ci = process.env.CI,
  mode = process.env.LAUNCHLOOM_CLIENT_PROCESS_ISOLATION,
  sourceEnvironment = process.env,
} = {}) {
  if (ci === "true") return true;
  if (mode === "trusted-local") return false;
  const secretPresent = Object.keys(sourceEnvironment).some((key) =>
    /(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH)/iu.test(key),
  );
  return mode === "required" || ci === "true" || secretPresent;
}

function execTrusted(command, args, { env, encoding = "utf8" } = {}) {
  try {
    return execFileSync(command, args, {
      env,
      encoding,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    const detail = String(cause?.stderr || cause?.message || cause)
      .trim()
      .slice(-1200);
    const error = new Error(
      `Client process isolation is unavailable: ${detail || "trusted helper command failed"}`,
      { cause },
    );
    error.code = "CLIENT_PROCESS_ISOLATION_UNAVAILABLE";
    throw error;
  }
}

function processResult(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const previousUmask = process.umask(0o077);
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } finally {
      process.umask(previousUmask);
    }
    let stdout = "";
    let stderr = "";
    const collect = (key, chunk) => {
      const text = chunk.toString();
      if (key === "stdout") stdout = `${stdout}${text}`.slice(-24_000);
      else stderr = `${stderr}${text}`.slice(-12_000);
    };
    child.stdout?.on("data", (chunk) => collect("stdout", chunk));
    child.stderr?.on("data", (chunk) => collect("stderr", chunk));
    child.on("error", (cause) => reject(cause));
    child.on("close", (code) => {
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(new Error(`${command} exited with ${code ?? 1}`));
    });
  });
}

function normalizeWritableRoots(writablePaths = []) {
  if (!Array.isArray(writablePaths))
    throw new Error("Client process writablePaths must be an array.");
  const roots = [...new Set(writablePaths.map((item) => path.resolve(item)))];
  for (const root of roots) {
    if (root === path.parse(root).root)
      throw new Error(
        "Client process isolation cannot change ownership of a filesystem root.",
      );
  }
  return roots;
}

async function assertOutsideGitWorktree(root) {
  let current = path.resolve(root);
  while (true) {
    try {
      await fs.lstat(path.join(current, ".git"));
      throw new Error(
        `Client process isolation refuses a writable path inside Git metadata: ${root}`,
      );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function chownTree(sudoPath, root, owner, env) {
  // Never make the checkout's Git metadata writable by client build code.
  execTrusted(
    sudoPath,
    [
      "-n",
      "find",
      "-P",
      root,
      "-type",
      "d",
      "-name",
      ".git",
      "-prune",
      "-o",
      "-exec",
      "chown",
      "-h",
      owner,
      "--",
      "{}",
      "+",
    ],
    { env },
  );
}

async function prepareSandboxPermissions(root) {
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    await fs.chmod(root, 0o755);
    for (const entry of await fs.readdir(root))
      await prepareSandboxPermissions(path.join(root, entry));
    return;
  }
  if (stat.isFile()) await fs.chmod(root, stat.mode & 0o111 ? 0o700 : 0o600);
}

/**
 * Execute client-controlled build or browser code with a minimal environment.
 * CI runs it as a different UID so the process cannot inspect secret-bearing
 * ancestors through /proc. Only the supplied writable roots are reassigned;
 * any .git directory inside a root remains owned by the runner.
 * @param {{command: string, args?: string[], cwd: string, writablePaths?: string[], envOverrides?: NodeJS.ProcessEnv, isolationMode?: string, sandboxUser?: string, sandboxGroup?: string, sudoPath?: string, sourceEnvironment?: NodeJS.ProcessEnv}} options
 */
export async function runClientProcess({
  command,
  args = [],
  cwd,
  writablePaths = [],
  envOverrides = {},
  isolationMode = process.env.LAUNCHLOOM_CLIENT_PROCESS_ISOLATION,
  sandboxUser = "nobody",
  sandboxGroup = "nogroup",
  sudoPath = "sudo",
  sourceEnvironment = process.env,
} = {}) {
  if (!command || !cwd)
    throw new Error(
      "Client process command and working directory are required.",
    );
  const isolated = clientProcessIsolationRequired({
    ci: sourceEnvironment.CI,
    mode: isolationMode,
    sourceEnvironment,
  });
  if (isolated && (process.platform !== "linux" || process.getuid == null))
    throw new Error(
      "Client process isolation is unavailable: required different-UID isolation needs Linux.",
    );

  const isolatedHome = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-client-process-home-"),
  );
  const environment = clientBuildEnvironment(sourceEnvironment, {
    HOME: isolatedHome,
    TMPDIR: isolatedHome,
    TEMP: isolatedHome,
    TMP: isolatedHome,
    ...envOverrides,
  });
  if (isolated) {
    const runtimeDirectory = path.dirname(process.execPath);
    const pathEntries = new Set([
      runtimeDirectory,
      ...(environment.PATH || "").split(path.delimiter).filter(Boolean),
    ]);
    environment.PATH = [...pathEntries].join(path.delimiter);
  }
  const writableRoots = normalizeWritableRoots([
    ...writablePaths,
    isolatedHome,
  ]);
  if (isolated)
    for (const root of writableRoots) await assertOutsideGitWorktree(root);

  try {
    if (!isolated)
      return await processResult(command, args, {
        cwd: path.resolve(cwd),
        env: environment,
      });

    const currentUid = process.getuid();
    const currentGid = process.getgid();
    const envPath = "/usr/bin/env";
    await fs.access(envPath);
    const envArguments = Object.entries(environment).map(
      ([key, value]) => `${key}=${value}`,
    );
    const useSudo = sourceEnvironment.CI === "true";

    if (useSudo) {
      const probe = execTrusted(
        sudoPath,
        [
          "-n",
          "-u",
          sandboxUser,
          "--",
          process.execPath,
          "-e",
          "process.stdout.write(String(process.getuid()))",
        ],
        { env: environment },
      ).trim();
      if (!/^\d+$/u.test(probe) || Number(probe) === currentUid)
        throw new Error(
          "Client process isolation is unavailable: the sandbox UID is missing or matches the secret-bearing runner UID.",
        );

      const rootsToRestore = [];
      let executionError;
      try {
        for (const root of writableRoots) {
          await fs.access(root);
          rootsToRestore.push(root);
          await prepareSandboxPermissions(root);
          chownTree(
            sudoPath,
            root,
            `${sandboxUser}:${sandboxGroup}`,
            environment,
          );
        }
        try {
          return await processResult(
            sudoPath,
            [
              "-n",
              "-u",
              sandboxUser,
              "--",
              envPath,
              "-i",
              ...envArguments,
              command,
              ...args,
            ],
            {
              cwd: path.resolve(cwd),
              env: environment,
            },
          );
        } catch (error) {
          throw new Error(
            `Client command "${path.basename(command)}" failed: ${error.message}`,
            { cause: error },
          );
        }
      } catch (error) {
        executionError = error;
        throw error;
      } finally {
        const owner = `${currentUid}:${currentGid}`;
        const restoreErrors = [];
        for (const root of rootsToRestore.reverse()) {
          try {
            chownTree(sudoPath, root, owner, environment);
          } catch (error) {
            restoreErrors.push(`${root}: ${error.message}`);
          }
        }
        if (restoreErrors.length) {
          const executionDetail = executionError
            ? `; prior client command failure: ${String(executionError.message || executionError).slice(0, 1200)}`
            : "";
          throw new Error(
            `Client process ownership restoration failed: ${restoreErrors.join("; ")}${executionDetail}`,
            { cause: executionError },
          );
        }
      }
    }

    if (sourceEnvironment.CI === "true")
      throw new Error(
        "Client process isolation is unavailable: CI requires a different host UID; user-namespace fallback is local-only.",
      );

    // Give the local fallback a PID-scoped procfs as well as a user namespace.
    // A user namespace alone maps root back to this host UID, so it does not
    // prevent a client process from inspecting same-UID ancestors via /proc.
    // CI still requires a genuinely different host UID.
    const localNamespaceArgs = [
      "--user",
      "--map-root-user",
      "--pid",
      "--fork",
      "--mount-proc",
    ];
    execTrusted(
      "unshare",
      [
        ...localNamespaceArgs,
        "--",
        process.execPath,
        "-e",
        "if (process.pid !== 1 || process.getuid() !== 0) process.exit(31)",
      ],
      { env: environment },
    );
    return await processResult(
      "unshare",
      [
        ...localNamespaceArgs,
        "--",
        envPath,
        "-i",
        ...envArguments,
        command,
        ...args,
      ],
      { cwd: path.resolve(cwd), env: environment },
    );
  } finally {
    await fs.rm(isolatedHome, { recursive: true, force: true }).catch(() => {});
  }
}
