const REQUIRED = ["pr", "approved-sha", "session", "reviewed-sha", "candidate"];

export function validateCreativeReleaseOverride(values) {
  const pullRequest = String(values.pr || "");
  const approvedSha = String(values["approved-sha"] || "");
  const sessionId = String(values.session || "");
  const reviewedSha = String(values["reviewed-sha"] || "");
  const candidateId = String(values.candidate || "");

  if (
    !/^\d{1,10}$/u.test(pullRequest) ||
    Number(pullRequest) < 1 ||
    !/^[a-f0-9]{40}$/iu.test(approvedSha) ||
    !/^[a-f0-9]{32}$/iu.test(sessionId) ||
    !/^[a-f0-9]{40}$/iu.test(reviewedSha) ||
    !/^candidate-[a-z0-9]+$/iu.test(candidateId)
  )
    throw new Error("Developer override release metadata is invalid.");
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = String(args[index] || "").replace(/^--/u, "");
    const value = args[index + 1];
    if (!REQUIRED.includes(key) || value === undefined || key in values)
      throw new Error("Developer override release metadata is incomplete.");
    values[key] = value;
  }
  return values;
}

try {
  validateCreativeReleaseOverride(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Developer override release metadata is invalid.",
  );
  process.exitCode = 1;
}
