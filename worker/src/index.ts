export interface Env {
  ASSETS: {
    put(
      key: string,
      value: ReadableStream,
      options: { httpMetadata: { contentType: string; cacheControl: string } },
    ): Promise<unknown>;
  };
  ASSET_BASE_URL: string;
  PLATFORM_ORIGINS: string;
  GITHUB_ORG_TOKEN: string;
  REVIEW_SIGNING_SECRET: string;
  LEAD_SIGNING_SECRET: string;
  GOOGLE_PLACES_API_KEY?: string;
  RESEND_API_KEY?: string;
  LAUNCHLOOM_FROM_EMAIL?: string;
  LAUNCHLOOM_FEEDBACK_EMAIL?: string;
  TURNSTILE_SECRET_KEY?: string;
}

type ReviewClaims = {
  stage: "developer" | "client";
  repo: string;
  siteId: string;
  reviewerEmail: string;
  clientEmail: string;
  pr?: number;
  headSha?: string;
  feedbackIssue?: number;
  expiresAt: number;
  allowedOrigins?: string[];
};
type LeadClaims = {
  project: string;
  recipient: string;
  allowedOrigins: string[];
  issuedAt: number;
};
type Intake = Record<string, unknown>;

const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromBase64url(value: string) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyHmac<T>(token: string, secret: string): Promise<T> {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) throw new Error("Malformed token.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64url(supplied),
    encoder.encode(encoded),
  );
  if (!valid) throw new Error("Invalid token.");
  return JSON.parse(decoder.decode(fromBase64url(encoded))) as T;
}

function clean(value: unknown, limit = 8000) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, limit);
}

function platformOrigins(env: Env) {
  return env.PLATFORM_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isPagesOrigin(origin: string | null) {
  try {
    return Boolean(
      origin &&
      /^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(new URL(origin).origin),
    );
  } catch {
    return false;
  }
}

function cors(request: Request, allowed: string[]): Record<string, string> {
  const origin = request.headers.get("Origin");
  const permitted = Boolean(
    origin && (allowed.includes(origin) || isPagesOrigin(origin)),
  );
  return permitted
    ? {
        "Access-Control-Allow-Origin": origin!,
        Vary: "Origin",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    : {};
}

function assertOrigin(request: Request, allowed: string[]) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowed.includes(origin))
    throw new Error("Invalid request origin.");
  return origin;
}

function assertClaimOrigin(
  request: Request,
  allowed: string[],
  pageUrl?: string,
) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowed.includes(origin))
    throw new Error("Invalid request origin.");
  if (pageUrl && new URL(pageUrl).origin !== origin)
    throw new Error("Invalid reviewed page.");
}

async function github(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_ORG_TOKEN}`,
      "User-Agent": "LaunchLoom-Cloudflare-Worker",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok)
    throw new Error(
      `GitHub ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  return response;
}

async function dispatch(
  env: Env,
  eventType: string,
  clientPayload: Record<string, unknown>,
) {
  await github(env, "/repos/WrazyAI/launchloom/dispatches", {
    method: "POST",
    body: JSON.stringify({
      event_type: eventType,
      client_payload: clientPayload,
    }),
  });
}

async function verifyTurnstile(env: Env, token: unknown, remoteip?: string) {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (!token) throw new Error("Please complete the spam check.");
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", String(token));
  if (remoteip) form.set("remoteip", remoteip);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form },
  );
  const result = (await response.json()) as { success?: boolean };
  if (!result.success) throw new Error("Spam check failed.");
}

function assetUrl(env: Env, key: string) {
  return `${env.ASSET_BASE_URL.replace(/\/$/, "")}/${key}`;
}

function safeAssets(env: Env, raw: unknown) {
  if (!raw || typeof raw !== "object") return {};
  const allowed = env.ASSET_BASE_URL.replace(/\/$/, "") + "/intakes/";
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(
        ([, value]) => typeof value === "string" && value.startsWith(allowed),
      )
      .map(([key, value]) => [key, value]),
  );
}

async function sendEmail(
  env: Env,
  input: {
    to: string;
    replyTo?: string;
    subject: string;
    html: string;
    tag: string;
  },
) {
  if (!env.RESEND_API_KEY || !env.LAUNCHLOOM_FROM_EMAIL) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.LAUNCHLOOM_FROM_EMAIL,
      to: [input.to],
      reply_to: input.replyTo,
      subject: input.subject,
      html: input.html,
      tags: [{ name: "launchloom_kind", value: input.tag }],
    }),
  });
  if (!response.ok)
    throw new Error(`Email delivery failed: ${response.status}`);
}

async function currentReviewPr(env: Env, claims: ReviewClaims) {
  if (!claims.pr || !claims.headSha)
    throw new Error("Invalid developer review link.");
  return github(env, `/repos/${claims.repo}/pulls/${claims.pr}`).then(
    (response) =>
      response.json() as Promise<{
        head: { sha: string };
        state: string;
        draft: boolean;
      }>,
  );
}

async function intake(request: Request, env: Env) {
  const headers = cors(request, platformOrigins(env));
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  try {
    assertOrigin(request, platformOrigins(env));
    const raw = (await request.json()) as Intake;
    await verifyTurnstile(
      env,
      raw.turnstileToken,
      request.headers.get("CF-Connecting-IP") || undefined,
    );
    if (clean(raw["bot-field"]) || !clean(raw.submissionId, 100))
      return json({ error: "Invalid intake." }, 400, headers);
    const businessName = clean(raw.businessName, 120);
    const email = clean(raw.email, 240);
    if (
      !businessName ||
      !email ||
      !clean(raw.confirmAccuracy, 10) ||
      !clean(raw.confirmRights, 10)
    )
      return json(
        { error: "Please complete the required business details." },
        400,
        headers,
      );
    const safeData = Object.fromEntries(
      Object.entries(raw)
        .filter(([key]) => key !== "turnstileToken")
        .map(([key, value]) => [
          key,
          key === "assets" ? safeAssets(env, value) : clean(value),
        ]),
    );
    const marker = `<!-- launchloom-intake:${safeData.submissionId} -->`;
    const issues = await github(
      env,
      "/repos/WrazyAI/launchloom/issues?state=open&per_page=100",
    ).then(
      (response) =>
        response.json() as Promise<Array<{ body?: string; number: number }>>,
    );
    const duplicate = issues.find((issue) => issue.body?.includes(marker));
    if (duplicate)
      return json(
        { ok: true, duplicate: true, issue: duplicate.number },
        200,
        headers,
      );
    const issue = await github(env, "/repos/WrazyAI/launchloom/issues", {
      method: "POST",
      body: JSON.stringify({
        title: `Intake: ${businessName}`,
        body: `${marker}\n\n\`\`\`json\n${JSON.stringify(safeData, null, 2)}\n\`\`\``,
      }),
    }).then((response) => response.json() as Promise<{ number: number }>);
    await dispatch(env, "intake-submitted", { issue: issue.number });
    return json({ ok: true, issue: issue.number }, 200, headers);
  } catch (error) {
    console.error("Intake failed", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "We couldn’t start your preview. Please try again.",
      },
      500,
      headers,
    );
  }
}

async function upload(request: Request, env: Env) {
  const headers = cors(request, platformOrigins(env));
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  try {
    assertOrigin(request, platformOrigins(env));
    const form = await request.formData();
    if (
      clean(form.get("bot-field")) ||
      !/^[a-z0-9-]{12,100}$/i.test(clean(form.get("submissionId"), 100))
    )
      return json({ error: "Invalid upload." }, 400, headers);
    const slot = clean(form.get("slot"), 30);
    const file = form.get("file");
    const slots = new Set([
      "logo",
      "photoOne",
      "photoTwo",
      "photoThree",
      "teamPhoto",
    ]);
    if (
      !slots.has(slot) ||
      !(file instanceof File) ||
      !file.size ||
      file.size > 3_000_000 ||
      !/^image\/(png|jpe?g|webp)$/i.test(file.type)
    )
      return json(
        { error: "Upload a PNG, JPG, or WebP image under 3 MB." },
        400,
        headers,
      );
    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
    const key = `intakes/${clean(form.get("submissionId"), 100)}/${crypto.randomUUID()}-${slot}.${extension}`;
    await env.ASSETS.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
    return json({ ok: true, key, url: assetUrl(env, key), slot }, 201, headers);
  } catch (error) {
    console.error("Upload failed", error);
    return json(
      { error: "Image upload failed. Please try again." },
      500,
      headers,
    );
  }
}

async function places(request: Request, env: Env) {
  const headers = cors(request, platformOrigins(env));
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  try {
    assertOrigin(request, platformOrigins(env));
    if (!env.GOOGLE_PLACES_API_KEY)
      return json({ error: "Places lookup is not configured." }, 503, headers);
    const { query } = (await request.json().catch(() => ({}))) as {
      query?: unknown;
    };
    if (typeof query !== "string" || query.trim().length < 3)
      return json(
        { error: "Enter a business name, address, or Maps URL." },
        400,
        headers,
      );
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.regularOpeningHours",
        },
        body: JSON.stringify({ textQuery: query.trim(), maxResultCount: 1 }),
      },
    );
    if (!response.ok)
      return json(
        {
          error:
            "Google couldn’t find a matching listing. You can enter the details manually.",
        },
        502,
        headers,
      );
    const { places = [] } = (await response.json()) as { places?: Array<any> };
    const place = places[0];
    if (!place?.id || !place.displayName?.text)
      return json(
        {
          error:
            "No matching listing found. You can enter the details manually.",
        },
        404,
        headers,
      );
    return json(
      {
        place: {
          id: place.id,
          name: place.displayName.text,
          address: place.formattedAddress || "",
          phone:
            place.nationalPhoneNumber || place.internationalPhoneNumber || "",
          website: place.websiteUri || "",
          mapsUrl: place.googleMapsUri || "",
          rating: place.rating,
          ratingCount: place.userRatingCount,
          hours: place.regularOpeningHours?.weekdayDescriptions || [],
        },
      },
      200,
      headers,
    );
  } catch (error) {
    return json({ error: "Places lookup failed." }, 500, headers);
  }
}

async function feedback(request: Request, env: Env) {
  const headers = cors(request, platformOrigins(env));
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  try {
    const { token, comment, pageUrl, email, category } =
      (await request.json()) as Record<string, unknown>;
    const claims = await verifyHmac<ReviewClaims>(
      String(token || ""),
      env.REVIEW_SIGNING_SECRET,
    );
    if (
      !claims.stage ||
      !claims.repo.startsWith("WrazyAI/") ||
      !claims.reviewerEmail ||
      !claims.clientEmail ||
      claims.expiresAt < Date.now() ||
      !claims.allowedOrigins?.length
    )
      throw new Error("Invalid review link.");
    assertClaimOrigin(request, claims.allowedOrigins, String(pageUrl || ""));
    const note = clean(comment, 5000);
    const submittedEmail = clean(email, 240).toLowerCase();
    if (!note)
      return json(
        { error: "Please enter feedback first." },
        400,
        cors(request, claims.allowedOrigins),
      );
    if (
      !submittedEmail ||
      submittedEmail !== claims.reviewerEmail.toLowerCase()
    )
      return json(
        {
          error:
            "That email doesn’t match the email invited to review this site.",
        },
        403,
        cors(request, claims.allowedOrigins),
      );
    if (claims.stage === "developer") {
      const current = await currentReviewPr(env, claims);
      if (
        current.state !== "open" ||
        current.draft ||
        current.head.sha !== claims.headSha
      )
        return json(
          {
            error:
              "This preview has changed. Use the latest developer review link.",
          },
          409,
          cors(request, claims.allowedOrigins),
        );
    } else if (!claims.feedbackIssue) {
      throw new Error("Invalid client review link.");
    }
    const issueNumber =
      claims.stage === "developer" ? claims.pr : claims.feedbackIssue;
    await github(env, `/repos/${claims.repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: `<!-- launchloom-feedback:${claims.stage} -->\n**${claims.stage === "developer" ? "Developer" : "Client"} feedback${category ? ` · ${clean(category, 80)}` : ""}**\n\n${note}\n\n_Page: ${clean(pageUrl, 1000)}_`,
      }),
    });
    await dispatch(
      env,
      claims.stage === "developer"
        ? "process-developer-feedback"
        : "process-client-feedback",
      {
        repo: claims.repo,
        pr: claims.pr,
        feedbackIssue: claims.feedbackIssue,
        siteId: claims.siteId,
        clientEmail: claims.clientEmail,
      },
    );
    if (claims.stage === "client" && env.LAUNCHLOOM_FEEDBACK_EMAIL)
      await sendEmail(env, {
        to: env.LAUNCHLOOM_FEEDBACK_EMAIL,
        replyTo: submittedEmail,
        subject: `Client feedback awaiting developer review · ${claims.repo.split("/")[1]}${category ? ` · ${clean(category, 80)}` : ""}`,
        html: `<p><strong>From:</strong> ${submittedEmail}</p><p>${note.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
        tag: "client-feedback",
      });
    return json(
      { ok: true, stage: claims.stage },
      200,
      cors(request, claims.allowedOrigins),
    );
  } catch (error) {
    console.error("Feedback failed", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "That review link is invalid or has expired.",
      },
      403,
      headers,
    );
  }
}

async function approval(request: Request, env: Env) {
  const headers = cors(request, platformOrigins(env));
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  try {
    const { token, pageUrl, email } = (await request.json()) as Record<
      string,
      unknown
    >;
    const claims = await verifyHmac<ReviewClaims>(
      String(token || ""),
      env.REVIEW_SIGNING_SECRET,
    );
    if (
      claims.stage !== "developer" ||
      !claims.repo.startsWith("WrazyAI/") ||
      !claims.reviewerEmail ||
      !claims.clientEmail ||
      claims.expiresAt < Date.now() ||
      !claims.allowedOrigins?.length
    )
      throw new Error("Invalid review link.");
    assertClaimOrigin(request, claims.allowedOrigins, String(pageUrl || ""));
    if (clean(email, 240).toLowerCase() !== claims.reviewerEmail.toLowerCase())
      return json(
        { error: "Use the developer email that received this review link." },
        403,
        cors(request, claims.allowedOrigins),
      );
    const current = await currentReviewPr(env, claims);
    if (
      current.state !== "open" ||
      current.draft ||
      current.head.sha !== claims.headSha
    )
      return json(
        { error: "This preview has changed. Ask for a fresh approval link." },
        409,
        cors(request, claims.allowedOrigins),
      );
    await github(env, `/repos/${claims.repo}/pulls/${claims.pr!}/merge`, {
      method: "PUT",
      body: JSON.stringify({
        sha: claims.headSha!,
        merge_method: "squash",
        commit_title: "LaunchLoom approved site",
      }),
    });
    await dispatch(env, "publish-site", {
      repo: claims.repo,
      siteId: claims.siteId,
      clientEmail: claims.clientEmail,
      feedbackIssue: claims.feedbackIssue,
    });
    return json({ ok: true }, 200, cors(request, claims.allowedOrigins));
  } catch (error) {
    console.error("Approval failed", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "We couldn’t approve this version.",
      },
      403,
      headers,
    );
  }
}

async function lead(request: Request, env: Env) {
  const headers = cors(request, platformOrigins(env));
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const claims = await verifyHmac<LeadClaims>(
      String(body.token || ""),
      env.LEAD_SIGNING_SECRET,
    );
    if (!claims.project || !claims.recipient || !claims.allowedOrigins?.length)
      throw new Error("Invalid lead form.");
    assertClaimOrigin(
      request,
      claims.allowedOrigins,
      String(body.pageUrl || ""),
    );
    if (clean(body["bot-field"]))
      return json({ ok: true }, 200, cors(request, claims.allowedOrigins));
    const name = clean(body.name, 160);
    const phone = clean(body.phone, 80);
    const email = clean(body.email, 240);
    const message = clean(body.message, 4000);
    if (!name || !phone || !email || !message)
      return json(
        { error: "Please complete every required field." },
        400,
        cors(request, claims.allowedOrigins),
      );
    await sendEmail(env, {
      to: claims.recipient,
      replyTo: email,
      subject: `New website lead · ${name}`,
      html: `<p><strong>Name:</strong> ${name}</p><p><strong>Phone:</strong> ${phone}</p><p><strong>Email:</strong> ${email}</p><p>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
      tag: "client-lead",
    });
    return json({ ok: true }, 200, cors(request, claims.allowedOrigins));
  } catch (error) {
    console.error("Lead failed", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "We couldn’t send your request.",
      },
      403,
      headers,
    );
  }
}

export default {
  fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (path === "/api/intake") return intake(request, env);
    if (path === "/api/upload") return upload(request, env);
    if (path === "/api/places") return places(request, env);
    if (path === "/api/feedback") return feedback(request, env);
    if (path === "/api/approval") return approval(request, env);
    if (path === "/api/lead") return lead(request, env);
    return new Response("Not found", { status: 404 });
  },
};
