import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const id = /^[a-z][a-z0-9-]{0,39}$/;
const route = /^\/(?:[A-Za-z0-9_.~-]+\/)*[A-Za-z0-9_.~-]*$/;
const roles = ["button", "link", "heading", "status", "region", "listitem", "complementary"];
export const MAX_MANIFEST = 64 * 1024;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function keys(object, expected) {
  return object && Object.getPrototypeOf(object) === Object.prototype &&
    Object.keys(object).length === expected.length && expected.every(key => Object.hasOwn(object, key));
}

export function approve(bytes, digest, scenario) {
  check(Buffer.isBuffer(bytes) && bytes.length <= MAX_MANIFEST, "manifest too large");
  check(createHash("sha256").update(bytes).digest("hex") === digest, "approval digest mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  check(keys(manifest, ["origin", "paths", "scenarios"]), "invalid manifest shape");
  const { origin, paths, scenarios } = manifest;
  check(typeof origin === "string" && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin) &&
    Number(origin.split(":").at(-1)) <= 65535 && new URL(origin).origin === origin, "invalid loopback origin");
  check(Array.isArray(paths) && paths.length > 0 && paths.length <= 64, "invalid path list");
  for (const path of paths) {
    check(typeof path === "string" && path.length <= 256 && route.test(path) &&
      !path.split("/").some(part => part === "." || part === ".."), "invalid path");
  }
  check(scenarios && Object.getPrototypeOf(scenarios) === Object.prototype &&
    Object.keys(scenarios).length > 0 && Object.keys(scenarios).length <= 16 &&
    typeof scenario === "string" && id.test(scenario) &&
    Object.hasOwn(scenarios, scenario), "unapproved scenario");
  for (const [name, steps] of Object.entries(scenarios)) {
    check(id.test(name) && Array.isArray(steps) && steps.length > 0 && steps.length <= 20, "invalid scenario");
    let opened = false;
    for (const step of steps) {
      switch (step?.type) {
        case "open":
          check(keys(step, ["type", "path"]) && paths.includes(step.path), "unapproved open path");
          opened = true;
          break;
        case "click":
        case "visible":
          check(opened && keys(step, step.type === "click" ? ["type", "role", "name"] :
            ["type", "role", "name", "expected"]) && roles.includes(step.role) &&
            typeof step.name === "string" && step.name.length > 0 && step.name.length <= 120 &&
            (step.type === "click" || typeof step.expected === "boolean"), "invalid locator step");
          break;
        case "screenshot":
          check(opened && keys(step, ["type"]), "invalid screenshot step");
          break;
        case "http":
          check((keys(step, ["type", "path", "status"]) || keys(step, ["type", "path", "status", "json"])) &&
            paths.includes(step.path) && Number.isInteger(step.status) && step.status >= 200 &&
            step.status <= 599 && (step.status < 300 || step.status >= 400), "invalid HTTP step");
          break;
        default:
          throw new Error("unsupported action");
      }
    }
  }
  return { origin, paths, steps: scenarios[scenario], scenario, digest };
}

export function verifyApproval(bytes, approval, scenario) {
  check(Buffer.isBuffer(bytes) && bytes.length <= MAX_MANIFEST, "manifest too large");
  check(approval && Object.getPrototypeOf(approval) === Object.prototype &&
    typeof approval.digest === "string" && /^[0-9a-f]{64}$/.test(approval.digest) &&
    approval.manifest && Object.getPrototypeOf(approval.manifest) === Object.prototype &&
    Array.isArray(approval.scenarios), "invalid approval artifact");
  check(createHash("sha256").update(bytes).digest("hex") === approval.digest,
    "approval digest mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  check(isDeepStrictEqual(manifest, approval.manifest), "approval manifest mismatch");
  check([...approval.scenarios].sort().join("\n") === Object.keys(manifest.scenarios ?? {}).sort().join("\n"),
    "approval scenario set mismatch");
  return approve(bytes, approval.digest, scenario);
}

export function allowedRequest(plan, method, url) {
  if (method !== "GET" || typeof url !== "string" || !url.startsWith(`${plan.origin}/`)) return null;
  const path = url.slice(plan.origin.length);
  return plan.paths.includes(path) ? path : null;
}
