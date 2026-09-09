import fs from "node:fs/promises";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
const path = args.file;
if (!path) throw new Error("--file is required.");
const config = JSON.parse(await fs.readFile(path, "utf8"));
const assets = args.assets ? JSON.parse(args.assets) : undefined;
if (assets && typeof assets === "object") {
  config.assets = assets;
  if (typeof assets.photoOne === "string") config.images.hero = assets.photoOne;
  if (typeof assets.photoTwo === "string")
    config.images.secondary = assets.photoTwo;
  else if (typeof assets.photoThree === "string")
    config.images.secondary = assets.photoThree;
  else if (typeof assets.teamPhoto === "string")
    config.images.secondary = assets.teamPhoto;
}
if (args.api && args.leadToken)
  config.lead = { apiUrl: args.api.replace(/\/$/, ""), token: args.leadToken };
if (args.api && args.chatToken && config.conversion?.aiChat?.enabled) {
  config.conversion.aiChat = {
    ...config.conversion.aiChat,
    apiUrl: args.api.replace(/\/$/, ""),
    token: args.chatToken,
  };
}
if (
  args.api &&
  args.reviewsToken &&
  config.business?.placeId &&
  config.socialProof?.source === "google_reviews"
) {
  config.socialProof = {
    source: "google_reviews",
    heading: "What families say on Google Maps",
    intro: "Read recent feedback directly from Google Maps.",
    points: [],
    fallback: {
      source: "verified_differentiators",
      heading: `Why people choose ${config.business.name}`,
      intro:
        "A clear, personal path forward starts with the details that matter most.",
      points: (config.differentiators || []).slice(0, 4),
    },
    google: { apiUrl: args.api.replace(/\/$/, ""), token: args.reviewsToken },
  };
}
await fs.writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
