const ALIASES = new Set(["review-initial", "review-diagnostic", "main", "production"]);

/**
 * Read the immutable deployment URL from wrangler Pages output.
 * Branch aliases are intentionally not accepted as deployment identity.
 */
export function pagesDeploymentUrl(output) {
  const matches = [
    ...String(output).matchAll(
      /Deployment complete![^\r\n]*?(https:\/\/[a-z0-9.-]+\.pages\.dev)/giu,
    ),
  ];
  if (matches.length !== 1)
    throw new Error("Immutable Pages deployment URL was not returned.");
  return new URL(matches[0][1]).href.replace(/\/$/u, "");
}

/** The immutable deployment label is the first hostname label. */
export function pagesDeploymentId(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid Pages deployment URL.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".pages.dev"))
    throw new Error("Pages deployment URL must use https and a pages.dev host.");
  const id = parsed.hostname.slice(0, -".pages.dev".length).split(".")[0];
  if (ALIASES.has(id))
    throw new Error("Pages branch alias is not an immutable deployment.");
  if (!/^[a-z0-9]{6,32}$/u.test(id))
    throw new Error("Invalid Pages deployment id.");
  return id;
}
