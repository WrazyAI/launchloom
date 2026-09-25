import {
  access,
  cp,
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const buildRoot = path.join(repoRoot, "dist");
const outputArg = process.argv[2];

if (!outputArg) {
  throw new Error(
    "Provide a clean output directory for the onboarding Pages project.",
  );
}

const outputRoot = path.resolve(outputArg);
if (
  outputRoot === buildRoot ||
  outputRoot.startsWith(`${buildRoot}${path.sep}`)
) {
  throw new Error(
    "The onboarding bundle output must not be inside the main Pages build.",
  );
}

const outputEntries = await readdir(outputRoot).catch((error) => {
  if (error.code === "ENOENT") return [];
  throw error;
});
if (outputEntries.length) {
  throw new Error(
    `The onboarding output directory must be empty: ${outputRoot}`,
  );
}

const onboardingPage = path.join(buildRoot, "onboard", "index.html");
const assetDirectory = path.join(buildRoot, "_astro");
await access(onboardingPage);
await access(assetDirectory);

const html = await readFile(onboardingPage, "utf8");
if (!/<meta\s+name="robots"\s+content="noindex, nofollow"/iu.test(html)) {
  throw new Error("The onboarding page must remain noindex and nofollow.");
}
if (/<a\b[^>]*href="(?:\/|https?:\/\/launchloom\.wrazyos\.com)/iu.test(html)) {
  throw new Error(
    "The onboarding page must not link to the public LaunchLoom site.",
  );
}

await mkdir(path.join(outputRoot, "onboard"), { recursive: true });
await cp(path.join(buildRoot, "onboard"), path.join(outputRoot, "onboard"), {
  recursive: true,
});
await cp(assetDirectory, path.join(outputRoot, "_astro"), { recursive: true });
await copyFile(
  path.join(buildRoot, "favicon.svg"),
  path.join(outputRoot, "favicon.svg"),
);
await writeFile(
  path.join(outputRoot, "_headers"),
  "/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n",
);

const deployedRoot = await readdir(outputRoot);
if (deployedRoot.includes("index.html")) {
  throw new Error("The onboarding Pages root must not contain a homepage.");
}

console.log(
  JSON.stringify({
    outputRoot,
    routes: ["/onboard/"],
    rootHomepage: false,
    robots: "noindex, nofollow",
  }),
);
