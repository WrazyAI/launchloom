import { execFileSync } from "node:child_process";

const label = "launchloom-delivery-pending";
for (const key of [
  "GITHUB_ORG_TOKEN",
  "REVIEW_SIGNING_SECRET",
  "RESEND_API_KEY",
  "LAUNCHLOOM_FROM_EMAIL",
  "LAUNCHLOOM_DEVELOPER_EMAIL",
])
  if (!process.env[key]) throw new Error(`Missing ${key}`);
async function github(route, method = "GET", body) {
  const response = await fetch(`https://api.github.com${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_ORG_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new Error(`GitHub ${method} failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const pending = await github(
  `/search/issues?q=${encodeURIComponent(`org:WrazyAI is:pr is:open label:${label}`)}&per_page=100`,
);
let failed = false;
for (const item of pending.items) {
  const repo = item.repository_url.replace("https://api.github.com/repos/", "");
  if (!/^WrazyAI\/launchloom-[a-z0-9-]+$/.test(repo)) continue;
  // Give initial workflow its normal readiness window before recovery takes over.
  if (Date.now() - Date.parse(item.created_at) < 15 * 60_000) continue;
  try {
    const pr = await github(`/repos/${repo}/pulls/${item.number}`);
    if (pr.head.ref !== "review/initial")
      throw new Error("Only initial preview delivery can be recovered here");
    const project = repo.split("/")[1];
    const preview = `https://review-initial.${project}.pages.dev`;
    let response;
    try {
      response = await fetch(preview, {
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      console.log(`delivery_pending=${repo}:preview_unreachable`);
      continue;
    }
    if (!response.ok) {
      console.log(`delivery_pending=${repo}:http_${response.status}`);
      continue;
    }
    const html = await response.text();
    if (!html.includes('id="ll-review"'))
      throw new Error("Preview lacks review controls");
    const file = await github(
      `/repos/${repo}/contents/src/site.config.json?ref=${pr.head.sha}`,
    );
    const config = JSON.parse(Buffer.from(file.content, "base64").toString());
    const inbox = pr.body?.match(/launchloom-feedback-inbox:(\d+)/)?.[1];
    if (!inbox) throw new Error("Missing feedback inbox");
    const comments = await github(
      `/repos/${repo}/issues/${pr.number}/comments?per_page=100`,
    );
    const receipt = `<!-- launchloom-initial-email:${pr.head.sha} -->`;
    if (!comments.some((c) => c.body?.includes(receipt))) {
      // Reuse the exact link/body after an ambiguous email result so Resend's
      // idempotency key can suppress a repeated send, rather than conflict.
      let link = comments
        .flatMap(
          (c) =>
            c.body?.match(/https:\/\/[^\s)]+\?review=[A-Za-z0-9_.-]+/g) || [],
        )
        .find((url) => {
          try {
            const claims = JSON.parse(
              Buffer.from(
                new URL(url).searchParams.get("review").split(".")[0],
                "base64url",
              ).toString(),
            );
            return (
              url.startsWith(`${preview}?review=`) &&
              claims.headSha === pr.head.sha &&
              claims.stage === "developer"
            );
          } catch {
            return false;
          }
        });
      if (!link) {
        const token = execFileSync(
          process.execPath,
          [
            "scripts/create-review-link.mjs",
            "--stage",
            "developer",
            "--repo",
            repo,
            "--pr",
            String(pr.number),
            "--sha",
            pr.head.sha,
            "--site",
            project,
            "--email",
            process.env.LAUNCHLOOM_DEVELOPER_EMAIL,
            "--client-email",
            config.business.email,
            "--feedback-issue",
            inbox,
            "--origins",
            `${preview},https://${project}.pages.dev`,
            "--token-only",
            "true",
          ],
          { encoding: "utf8" },
        ).trim();
        link = `${preview}?review=${token}`;
        await github(`/repos/${repo}/issues/${pr.number}/comments`, "POST", {
          body: `<!-- launchloom-delivery-link:${pr.head.sha} -->\n[Open secure developer review](${link})`,
        });
      }
      execFileSync(
        process.execPath,
        [
          "scripts/send-preview-email.mjs",
          "--to",
          process.env.LAUNCHLOOM_DEVELOPER_EMAIL,
          "--name",
          config.business.name,
          "--preview",
          preview,
          "--review",
          link,
          "--kind",
          "initial",
          "--audience",
          "developer",
          "--idempotency-key",
          `initial-${project}-${pr.head.sha}`,
        ],
        { stdio: ["ignore", "ignore", "ignore"] },
      );
      await github(`/repos/${repo}/issues/${pr.number}/comments`, "POST", {
        body: `${receipt}\n<!-- launchloom-revision:developer -->\nDeveloper preview email sent.\n\n[Open secure developer review](${link})`,
      });
    }
    await github(
      `/repos/${repo}/issues/${pr.number}/labels/${label}`,
      "DELETE",
    );
    console.log(`delivery_recovered=${repo}`);
  } catch (error) {
    failed = true;
    console.error(`delivery_failed=${repo}:${error.message.split("\n")[0]}`);
  }
}
if (failed) process.exitCode = 1;
