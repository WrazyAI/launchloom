import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const roots: string[] = [];

async function runWrapper(operationId: string) {
  const root = await mkdtemp(path.join(tmpdir(), "launchloom-failure-"));
  roots.push(root);
  const script = path.join(root, "step.sh");
  await writeFile(
    script,
    'echo "Compiling pages"\necho "Error: preview upload failed with HTTP 502 token=super-secret" >&2\nexit 3\n',
  );
  try {
    await exec("bash", [path.resolve("scripts/private-run.sh"), script], {
      env: {
        ...process.env,
        OPERATION_ID: operationId,
        RUNNER_TEMP: root,
        PATH: `${process.env.PATH ?? ""}`,
      },
    });
  } catch (error) {
    // Expected nonzero status; the evidence file is the assertion target.
  }
  const evidence = path.join(root, "launchloom-step-failure.json");
  return { root, evidence };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("private step wrapper", () => {
  it("captures a bounded scrubbed reason for a failed legacy step", async () => {
    const { evidence } = await runWrapper("");
    const parsed = JSON.parse(await readFile(evidence, "utf8"));
    expect(parsed.code).toBe("HTTP_502");
    expect(parsed.detail).toContain("HTTP 502");
    expect(parsed.detail).not.toContain("super-secret");
  });

  it("does not create evidence for an operations step", async () => {
    const { evidence } = await runWrapper("operations-attempt");
    await expect(readFile(evidence, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
