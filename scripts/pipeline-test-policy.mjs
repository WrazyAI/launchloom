/**
 * One execution policy shared by workflow, author and focused runner.
 * @param {{profile?: string, skipCreativeAuthorChecks?: boolean|string, skipSeoAddon?: boolean|string, eventName?: string}} [input]
 */
export function resolvePipelineTestPolicy({ profile, skipCreativeAuthorChecks = false, skipSeoAddon = false, eventName = "workflow_dispatch" } = {}) {
  const enabled = (value) => {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error("Skip flags must be boolean.");
  };
  const skipCreative = enabled(skipCreativeAuthorChecks);
  const skipSeo = enabled(skipSeoAddon);
  if (skipCreative && skipSeo) throw new Error("Conflicting test skip flags.");
  const alias = skipCreative ? "seo-only" : skipSeo ? "creative-only" : null;
  if (profile && alias && profile !== alias) throw new Error("Conflicting test profile and skip flag.");
  const selected = profile || alias || "full";
  if (!["full", "full-preview", "seo-only", "creative-only"].includes(selected)) throw new Error("Unknown pipeline test profile.");
  if (selected !== "full" && eventName !== "workflow_dispatch") throw new Error("Isolated profiles require a manual workflow dispatch.");
  return Object.freeze({
    profile: selected,
    testOnly: selected !== "full",
    candidateCount: selected === "seo-only" ? 1 : 3,
    runSeoResearch: selected !== "creative-only",
    runCreativeChecks: selected !== "seo-only",
    repairCycles: selected === "seo-only" ? 0 : 3,
  });
}

export function parsePipelineTestArgs(argv = []) {
  const args = {};
  const switches = new Set(["skip-creative-author-checks", "skip-seo-addon"]);
  for (let i = 0; i < argv.length; i++) {
    const option = argv[i];
    if (!option.startsWith("--")) throw new Error("Expected a named pipeline test option.");
    const name = option.slice(2);
    if (Object.hasOwn(args, name)) throw new Error(`Duplicate option: ${name}`);
    if (switches.has(name)) {
      args[name] = ["true", "false"].includes(argv[i + 1]) ? argv[++i] : true;
    } else {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Missing value: ${name}`);
      args[name] = argv[++i];
    }
  }
  const policy = resolvePipelineTestPolicy({
    profile: args["test-profile"],
    skipCreativeAuthorChecks: args["skip-creative-author-checks"] ?? false,
    skipSeoAddon: args["skip-seo-addon"] ?? false,
  });
  return { ...args, profile: policy.profile };
}
