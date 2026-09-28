import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  clientBuildEnvironment,
  copyClientBuildInput,
  copyTrustedBuildDependencies,
  clientProcessIsolationRequired,
  runClientProcess,
} from "../scripts/client-build-environment.mjs";

const hasUnprivilegedUserNamespace =
  process.platform === "linux" &&
  spawnSync(
    "unshare",
    [
      "--user",
      "--map-root-user",
      "--pid",
      "--fork",
      "--mount-proc",
      "--",
      process.execPath,
      "-e",
      "if (process.pid !== 1 || process.getuid() !== 0) process.exit(1)",
    ],
    {
      encoding: "utf8",
      stdio: "ignore",
    },
  ).status === 0;

describe("client build environment", () => {
  it("copies only the disposable client build input, excluding credentials and Git state", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-copy-test-"),
    );
    const source = path.join(root, "source");
    const target = path.join(root, "worker");
    const outside = path.join(root, "outside-secret.txt");
    await fs.mkdir(path.join(source, ".git", "objects"), { recursive: true });
    await fs.mkdir(path.join(source, "src"), { recursive: true });
    await fs.mkdir(path.join(source, ".secrets"), { recursive: true });
    await fs.mkdir(path.join(source, "dist"), { recursive: true });
    await fs.mkdir(path.join(source, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(source, ".git", "config"), "git config");
    await fs.writeFile(path.join(source, ".env.local"), "synthetic secret");
    await fs.writeFile(
      path.join(source, ".npmrc"),
      "//registry.invalid/:_authToken=synthetic",
    );
    await fs.writeFile(
      path.join(source, ".secrets", "review-key.pem"),
      "synthetic secret",
    );
    await fs.writeFile(path.join(source, "dist", "index.html"), "stale output");
    await fs.writeFile(path.join(source, "node_modules", "package.json"), "{}");
    await fs.writeFile(path.join(source, "src", "site.config.json"), "{}");
    await fs.writeFile(outside, "synthetic secret");
    await fs.symlink(outside, path.join(source, "credential-link"));

    try {
      await copyClientBuildInput(source, target);

      expect(
        await fs.readFile(path.join(target, "src/site.config.json"), "utf8"),
      ).toBe("{}");
      await expect(fs.access(path.join(target, ".git"))).rejects.toThrow();
      await expect(
        fs.access(path.join(target, ".env.local")),
      ).rejects.toThrow();
      await expect(fs.access(path.join(target, ".npmrc"))).rejects.toThrow();
      await expect(fs.access(path.join(target, ".secrets"))).rejects.toThrow();
      await expect(fs.access(path.join(target, "dist"))).rejects.toThrow();
      await expect(
        fs.access(path.join(target, "node_modules")),
      ).rejects.toThrow();
      await expect(
        fs.access(path.join(target, "credential-link")),
      ).rejects.toThrow();
      expect(await fs.readFile(path.join(source, ".git/config"), "utf8")).toBe(
        "git config",
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("copies trusted dependencies into the isolated build tree and rejects escaping links", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-trusted-dependencies-"),
    );
    const source = path.join(root, "trusted-node-modules");
    const target = path.join(root, "worker", "node_modules");
    const packageCli = path.join(source, "sample-package", "cli.js");
    const executableLink = path.join(source, ".bin", "sample-cli");
    const outside = path.join(root, "outside.js");

    await fs.mkdir(path.dirname(packageCli), { recursive: true });
    await fs.mkdir(path.dirname(executableLink), { recursive: true });
    await fs.writeFile(packageCli, "process.exit(0);", { mode: 0o755 });
    await fs.symlink("../sample-package/cli.js", executableLink);
    await fs.writeFile(outside, "must not escape");
    await fs.symlink(outside, path.join(source, "outside-link"));

    try {
      await expect(
        copyTrustedBuildDependencies(source, target),
      ).rejects.toThrow(/symlink outside the trusted dependency root/u);

      await fs.rm(path.join(source, "outside-link"));
      await copyTrustedBuildDependencies(source, target);

      const copiedLink = path.join(target, ".bin", "sample-cli");
      const copiedStat = await fs.lstat(copiedLink);
      expect(copiedStat.isSymbolicLink()).toBe(true);
      expect(await fs.readlink(copiedLink)).toBe("../sample-package/cli.js");
      expect(await fs.realpath(copiedLink)).toBe(
        await fs.realpath(path.join(target, "sample-package", "cli.js")),
      );
      expect(
        await fs.readFile(
          path.join(target, "sample-package", "cli.js"),
          "utf8",
        ),
      ).toBe("process.exit(0);");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("requires isolated client processes in CI but supports an explicit trusted local mode", () => {
    expect(clientProcessIsolationRequired({ ci: "true" })).toBe(true);
    expect(
      clientProcessIsolationRequired({
        ci: "false",
        sourceEnvironment: { OPENROUTER_API_KEY: "synthetic" },
      }),
    ).toBe(true);
    expect(
      clientProcessIsolationRequired({
        ci: "true",
        mode: "trusted-local",
      }),
    ).toBe(true);
    expect(
      clientProcessIsolationRequired({
        ci: "false",
        mode: "trusted-local",
      }),
    ).toBe(false);
    expect(
      clientProcessIsolationRequired({ ci: "false", sourceEnvironment: {} }),
    ).toBe(false);
  });

  it("fails closed when required UID isolation cannot be started", async () => {
    await expect(
      runClientProcess({
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        cwd: process.cwd(),
        isolationMode: "required",
        sudoPath: "/missing/sudo-for-client-isolation-test",
        sourceEnvironment: { CI: "true", PATH: process.env.PATH },
      }),
    ).rejects.toThrow(/client process isolation.*unavailable/iu);
  });

  it("keeps npm and its Node interpreter reachable inside a minimal CI PATH", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-runtime-path-"),
    );
    const sudoPath = path.join(root, "synthetic-sudo");
    const fakeSudo = `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args.includes("find")) process.exit(0);
if (args.includes("process.stdout.write(String(process.getuid()))")) {
  process.stdout.write(String(process.getuid() + 1));
  process.exit(0);
}
const separator = args.indexOf("--");
const environmentIndex = args.indexOf("-i", separator);
const commandIndex = args.findIndex((value, index) => index > environmentIndex && !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(value));
const command = args[commandIndex];
if (!command || !command.startsWith("/")) process.exit(89);
const result = spawnSync(args[commandIndex], args.slice(commandIndex + 1), { stdio: "inherit" });
process.exit(result.status ?? 1);
`;
    await fs.writeFile(sudoPath, fakeSudo, { mode: 0o700 });

    try {
      const result = await runClientProcess({
        command: "npm",
        args: ["--version"],
        cwd: root,
        writablePaths: [root],
        isolationMode: "required",
        sudoPath,
        sourceEnvironment: { CI: "true", PATH: "/usr/bin" },
      });

      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/u);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("resolves relative PATH entries from the client working directory", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-relative-path-"),
    );
    const binDirectory = path.join(root, "bin");
    await fs.mkdir(binDirectory);
    const executable = path.join(binDirectory, "client-npm");
    await fs.writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdout.write("1.2.3");\n`,
      { mode: 0o700 },
    );
    const sudoPath = path.join(root, "synthetic-sudo");
    const fakeSudo = `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args.includes("find")) process.exit(0);
if (args.includes("process.stdout.write(String(process.getuid()))")) {
  process.stdout.write(String(process.getuid() + 1));
  process.exit(0);
}
const separator = args.indexOf("--");
const environmentIndex = args.indexOf("-i", separator);
const commandIndex = args.findIndex((value, index) => index > environmentIndex && !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(value));
const command = args[commandIndex];
if (!command || !command.startsWith("/")) process.exit(89);
const result = spawnSync(args[commandIndex], args.slice(commandIndex + 1), { stdio: "inherit" });
process.exit(result.status ?? 1);
`;
    await fs.writeFile(sudoPath, fakeSudo, { mode: 0o700 });

    try {
      const result = await runClientProcess({
        command: "client-npm",
        cwd: root,
        writablePaths: [root],
        isolationMode: "required",
        sudoPath,
        sourceEnvironment: { CI: "true", PATH: "bin" },
      });

      expect(result.stdout).toBe("1.2.3");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("removes its temporary home if isolated executable lookup fails", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-missing-executable-"),
    );
    const homePrefix = "launchloom-client-process-home-";
    const before = new Set(
      (await fs.readdir(os.tmpdir())).filter((name) =>
        name.startsWith(homePrefix),
      ),
    );
    let failure: unknown;

    try {
      await runClientProcess({
        command: "missing-launchloom-command",
        cwd: root,
        writablePaths: [root],
        isolationMode: "required",
        sourceEnvironment: { CI: "true", PATH: "/usr/bin:/bin" },
      });
    } catch (error) {
      failure = error;
    }

    const createdHomes = (await fs.readdir(os.tmpdir())).filter(
      (name) => name.startsWith(homePrefix) && !before.has(name),
    );
    await Promise.all(
      createdHomes.map((name) =>
        fs.rm(path.join(os.tmpdir(), name), { recursive: true, force: true }),
      ),
    );
    await fs.rm(root, { recursive: true, force: true });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /unavailable in the isolated build PATH/u,
    );
    expect(createdHomes).toEqual([]);
  });

  it("names the client executable when an isolated CI command exits 127", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-command-error-"),
    );
    const sudoPath = path.join(root, "synthetic-sudo");
    const fakeSudo = `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes("find")) process.exit(0);
if (args.includes("process.stdout.write(String(process.getuid()))")) {
  process.stdout.write(String(process.getuid() + 1));
  process.exit(0);
}
process.exit(127);
`;
    await fs.writeFile(sudoPath, fakeSudo, { mode: 0o700 });

    try {
      await expect(
        runClientProcess({
          command: "npm",
          args: ["run", "build"],
          cwd: root,
          writablePaths: [root],
          isolationMode: "required",
          sudoPath,
          sourceEnvironment: { CI: "true", PATH: process.env.PATH },
        }),
      ).rejects.toThrow(/client command "npm" failed.*exited with 127/iu);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== "linux")(
    "keeps the original client failure visible when ownership restoration also fails",
    async () => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "launchloom-client-restore-error-"),
      );
      const sudoPath = path.join(root, "synthetic-sudo");
      const fakeSudo = `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args.includes("find")) {
  const owner = args[args.indexOf("-h") + 1];
  if (owner === String(process.getuid()) + ":" + String(process.getgid())) {
    process.stderr.write("synthetic ownership restoration failure");
    process.exit(1);
  }
  process.exit(0);
}
if (args.includes("process.stdout.write(String(process.getuid()))")) {
  process.stdout.write(String(process.getuid() + 1));
  process.exit(0);
}
const separator = args.indexOf("--");
const result = spawnSync(args[separator + 1], args.slice(separator + 2), { stdio: "inherit" });
process.exit(result.status ?? 1);
`;
      await fs.writeFile(sudoPath, fakeSudo, { mode: 0o700 });

      try {
        let failure: unknown;
        try {
          await runClientProcess({
            command: process.execPath,
            args: ["-e", "process.exitCode = 9"],
            cwd: root,
            writablePaths: [root],
            isolationMode: "required",
            sudoPath,
            sourceEnvironment: { CI: "true", PATH: process.env.PATH },
          });
        } catch (error) {
          failure = error;
        }

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain(
          "Client process ownership restoration failed",
        );
        expect((failure as Error).message).toContain(
          "synthetic-sudo exited with 9",
        );
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it("does not forward client stdout or stderr into the workflow log", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-output-test-"),
    );
    const stdoutMarker = "synthetic-client-stdout-marker";
    const stderrMarker = "synthetic-client-stderr-marker";
    const stdoutWrite = vi.spyOn(process.stdout, "write");
    const stderrWrite = vi.spyOn(process.stderr, "write");

    try {
      const result = await runClientProcess({
        command: process.execPath,
        args: [
          "-e",
          `process.stdout.write(${JSON.stringify(stdoutMarker)}); process.stderr.write(${JSON.stringify(stderrMarker)});`,
        ],
        cwd: root,
        isolationMode: "trusted-local",
      });
      const forwarded = [stdoutWrite.mock.calls, stderrWrite.mock.calls]
        .flat()
        .map(([chunk]) => String(chunk));

      expect(result.stdout).toContain(stdoutMarker);
      expect(result.stderr).toContain(stderrMarker);
      expect(forwarded.join("\n")).not.toContain(stdoutMarker);
      expect(forwarded.join("\n")).not.toContain(stderrMarker);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not include client stderr in a failed-process error", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-error-test-"),
    );
    const stderrMarker = "synthetic-client-error-detail";

    try {
      let failure: unknown;
      try {
        await runClientProcess({
          command: process.execPath,
          args: [
            "-e",
            `process.stderr.write(${JSON.stringify(stderrMarker)}); process.exit(9);`,
          ],
          cwd: root,
          isolationMode: "trusted-local",
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/exited with 9/u);
      expect((failure as Error).message).not.toContain(stderrMarker);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("preserves bounded redacted failure output as private structured diagnostics", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-diagnostic-test-"),
    );
    const stderrMarker = "synthetic-build-diagnostic-marker";
    const privateCredential = "ghp_0123456789abcdefghijklmnopqrstuvwxyzABCD";

    try {
      let failure: unknown;
      try {
        await runClientProcess({
          command: process.execPath,
          args: [
            "-e",
            `process.stderr.write(${JSON.stringify(`${stderrMarker}\nAuthorization: Bearer ${privateCredential}`)}); process.exit(9);`,
          ],
          cwd: root,
          isolationMode: "trusted-local",
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/exited with 9/u);
      expect((failure as Error).message).not.toContain(stderrMarker);
      expect((failure as Error).message).not.toContain(privateCredential);
      const diagnostic = (
        failure as Error & {
          clientProcessDiagnostic?: {
            command: string;
            exitCode: number | null;
            stderr: string;
          };
        }
      ).clientProcessDiagnostic;
      expect(diagnostic).toMatchObject({
        command: path.basename(process.execPath),
        exitCode: 9,
      });
      expect(diagnostic?.stderr).toContain(stderrMarker);
      expect(diagnostic?.stderr).not.toContain(privateCredential);
      expect(diagnostic?.stderr).toContain("[REDACTED]");
      expect(Object.keys(failure as Error)).not.toContain(
        "clientProcessDiagnostic",
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("writes isolated CLI failures to a private diagnostic receipt without echoing output", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-isolated-command-diagnostic-test-"),
    );
    const receiptPath = path.join(root, "client-command-diagnostic.json");
    const outputMarker = "synthetic-diagnostic-build-failure";
    const privateCredential = "ghp_0123456789abcdefghijklmnopqrstuvwxyzABCD";
    const commandSource = `process.stderr.write(${JSON.stringify(`${outputMarker}\n${privateCredential}`)}); process.exit(9);`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          path.resolve("scripts/run-isolated-client-command.mjs"),
          "--cwd",
          root,
          "--writable",
          root,
          "--diagnostic-output",
          receiptPath,
          "--",
          process.execPath,
          "-e",
          commandSource,
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            CI: "false",
            LAUNCHLOOM_CLIENT_PROCESS_ISOLATION: "trusted-local",
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toContain(outputMarker);
      expect(result.stderr).not.toContain(privateCredential);
      const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
      expect(receipt).toMatchObject({
        version: 1,
        command: {
          command: path.basename(process.execPath),
          exitCode: 9,
          stderr: `${outputMarker}\n[REDACTED]`,
        },
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to make any Git checkout tree writable to client code", async () => {
    await expect(
      runClientProcess({
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        cwd: process.cwd(),
        writablePaths: [process.cwd()],
        isolationMode: "required",
        sourceEnvironment: { CI: "false", PATH: process.env.PATH },
      }),
    ).rejects.toThrow(/writable path inside Git metadata/iu);
  });

  it.skipIf(!hasUnprivilegedUserNamespace)(
    "starts a local client process in a separate PID namespace with an isolated proc view",
    async () => {
      const secretName = "LAUNCHLOOM_TEST_DUMMY_PROC_SECRET";
      const dummySecret = "synthetic-only-process-boundary-sentinel";
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "launchloom-client-proc-probe-"),
      );
      const clientBuildEnvironmentModule = new URL(
        "../scripts/client-build-environment.mjs",
        import.meta.url,
      ).href;
      const childProbe = `const fs=require("node:fs"); const key=${JSON.stringify(`${secretName}=${dummySecret}`)}; let found=false; for (const pid of fs.readdirSync("/proc").filter((entry)=>/^\\d+$/u.test(entry))) { try { if (fs.readFileSync("/proc/"+pid+"/environ").includes(Buffer.from(key))) found=true; } catch {} } process.stdout.write(JSON.stringify({directEnv:Boolean(process.env[${JSON.stringify(secretName)}]),parentProcessSecretFound:found}));`;
      const helper = `import { runClientProcess } from ${JSON.stringify(clientBuildEnvironmentModule)}; const key=${JSON.stringify(secretName)}; const sentinel=${JSON.stringify(dummySecret)}; if (process.env[key] !== sentinel) process.exit(41); const result=await runClientProcess({command:process.execPath,args:["-e",${JSON.stringify(childProbe)}],cwd:${JSON.stringify(root)},writablePaths:[${JSON.stringify(root)}],isolationMode:"required"}); process.stdout.write(JSON.stringify({sourceProcessHasSecret:process.env[key]===sentinel,child:JSON.parse(result.stdout)}));`;

      try {
        const result = spawnSync(
          process.execPath,
          ["--input-type=module", "-e", helper],
          {
            cwd: process.cwd(),
            env: {
              PATH: process.env.PATH || "/usr/bin:/bin",
              CI: "false",
              [secretName]: dummySecret,
            },
            encoding: "utf8",
            timeout: 15_000,
          },
        );
        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
          sourceProcessHasSecret: true,
          child: {
            directEnv: false,
            parentProcessSecretFound: false,
          },
        });
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it("does not pass workflow credentials into client-controlled build scripts", () => {
    const environment = clientBuildEnvironment({
      PATH: "/usr/bin",
      CI: "true",
      NODE_ENV: "production",
      PUBLIC_REVIEW_MODE: "true",
      PUBLIC_LAUNCHLOOM_API_URL: "https://api.example.invalid",
      GH_TOKEN: "github-secret",
      GITHUB_TOKEN: "github-token-secret",
      GITHUB_ORG_TOKEN: "org-token-secret",
      OPENROUTER_API_KEY: "openrouter-secret",
      CLOUDFLARE_API_TOKEN: "cloudflare-secret",
      REVIEW_SIGNING_SECRET: "review-secret",
      RESEND_API_KEY: "email-secret",
      EXTRA_CLIENT_SECRET: "unexpected-secret",
    });

    expect(environment).toEqual({
      PATH: "/usr/bin",
      CI: "true",
      NODE_ENV: "production",
      PUBLIC_REVIEW_MODE: "true",
      PUBLIC_LAUNCHLOOM_API_URL: "https://api.example.invalid",
    });
  });

  it("accepts safe public build overrides without admitting secret overrides", () => {
    const environment = clientBuildEnvironment(
      { PATH: "/usr/bin" },
      {
        PUBLIC_REVIEW_MODE: "true",
        PUBLIC_SITE_URL: "https://preview.example.invalid",
        OPENROUTER_API_KEY: "must-not-pass",
      },
    );

    expect(environment).toEqual({
      PATH: "/usr/bin",
      PUBLIC_REVIEW_MODE: "true",
      PUBLIC_SITE_URL: "https://preview.example.invalid",
    });
  });

  it("allows an isolated temporary home and temp directory to be explicitly supplied", () => {
    const environment = clientBuildEnvironment(
      { PATH: "/usr/bin", HOME: "/runner/home" },
      { HOME: "/tmp/client-build-home", TMPDIR: "/tmp/client-build-home" },
    );

    expect(environment.HOME).toBe("/tmp/client-build-home");
    expect(environment.TMPDIR).toBe("/tmp/client-build-home");
  });
});
