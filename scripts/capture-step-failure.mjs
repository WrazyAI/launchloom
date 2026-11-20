import fs from "node:fs/promises";
import { redactTrackingText } from "./generation-tracking-contract.mjs";

const ERROR_SHAPE =
  /\b(?:error|failed|failure|fatal|timed?\s*out|timeout|invalid|cannot|unable|refused|denied|forbidden|unauthorized|not found|missing|required|ENOENT|EACCES|EPERM|exit(?:ed)? (?:code|status))\b|HTTP\s*[45]\d\d|status\s*[45]\d\d|::error/iu;
const NOISE =
  /^(?:\+|##\[|::debug|shell:|env:|command:|post job cleanup|cleaning up orphan|- |at\s|locator resolved|waiting for|strict mode violation)/iu;
const MARKUP = /<\/?[a-z][^>]*>/iu;
const SOURCE_LIKE =
  /^(?:--|\\|echo|printf|node\s|npm\s|npx\s|gh\s|git\s|bash\s|cat\s|cd\s|mkdir\s|rm\s|cp\s|mv\s|if\s|elif\s|then$|else$|fi$|for\s|while\s|local\s|export\s|set\s|trap\s|const\s|let\s|var\s|import\s|require\s|test\s|\[\[|#|\$|\}|\{)|^[A-Z][A-Z0-9_]+=/u;

/** GitHub CLI prefixes each line with job, step and an ISO timestamp. */
function stripLogPrefix(line) {
  return line
    .replace(/^[^\t]*\t[^\t]*\t\d{4}-\d{2}-\d{2}T\S+\s/u, "")
    .replace(/\^\[\[[0-9;]*[A-Za-z]/gu, "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/gu, "")
    .trim();
}
const GENERIC_EXIT = /^##\[error\]Process completed with exit code \d+\.?$/iu;

export function failureCodeFor(text, status) {
  const value = String(text ?? "");
  const http = value.match(/HTTP\s*([45]\d\d)/iu);
  if (http) return `HTTP_${http[1]}`;
  if (/timed?\s*out|timeout/iu.test(value)) return "TIMEOUT";
  if (/permission|denied|forbidden|unauthorized|EACCES|EPERM/iu.test(value))
    return "DENIED";
  if (/not found|ENOENT/iu.test(value)) return "NOT_FOUND";
  if (/missing|required (?:value|input|secret)|not set/iu.test(value))
    return "MISSING_INPUT";
  const numeric = Number.isSafeInteger(status) && status > 0 ? status : 1;
  return `EXIT_${numeric}`;
}

function scrub(line) {
  return String(redactTrackingText(line, 300) ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[email]")
    .replace(/(?:\/home\/[^\s/]+|\/tmp|[A-Za-z]:\\)[^\s]*/gu, "[path]")
    .replace(/\b[A-Fa-f0-9]{24,}\b/gu, "[id]")
    .trim();
}

/** Only error-shaped lines, scrubbed, bounded and deduplicated. */
export function extractFailureEvidence(log, status = 1) {
  const text = String(log ?? "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/gu, "")
    .replace(/\r/gu, "")
    .slice(-400_000);
  const seen = new Set();
  const candidates = [];
  for (const raw of text.split("\n")) {
    const line = stripLogPrefix(raw.trim());
    if (
      line.length < 8 ||
      NOISE.test(line) ||
      SOURCE_LIKE.test(line) ||
      MARKUP.test(line) ||
      GENERIC_EXIT.test(line) ||
      !ERROR_SHAPE.test(line)
    )
      continue;
    const clean = scrub(line);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    const score =
      /HTTP\s*[45]\d\d|timed?\s*out|timeout|denied|forbidden|EACCES|EPERM/iu.test(
        clean,
      )
        ? 3
        : /error|fail|invalid|refused|not found|ENOENT/iu.test(clean)
          ? 2
          : 1;
    candidates.push({ clean, score, index: candidates.length });
  }
  const lines = candidates
    .slice()
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.clean);
  let detail = lines.join("\n").slice(0, 600).trim();
  if (!detail)
    detail = `Step exited with status ${status} without a recognized error line.`;
  return {
    code: failureCodeFor(
      candidates.map((item) => item.clean).join("\n"),
      status,
    ),
    detail,
    status,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? "" : args[index + 1] || "";
  };
  const log = option("log");
  const out = option("out");
  const status = Number(option("status") || 1);
  if (!log || !out) {
    console.error(
      "Usage: capture-step-failure.mjs --log <file> --status <n> --out <file>",
    );
    process.exit(2);
  }
  const evidence = extractFailureEvidence(
    await fs.readFile(log, "utf8"),
    status,
  );
  await fs.writeFile(out, `${JSON.stringify(evidence)}\n`, { mode: 0o600 });
  console.log(
    `failure_evidence=${evidence.code} lines=${evidence.detail.split("\n").length}`,
  );
}
