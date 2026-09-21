import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseModelJson } from "./model-json.mjs";
import {
  logOpenRouterCacheUsage,
  openRouterChatCompletion,
  openRouterSessionId,
} from "./openrouter-client.mjs";
import {
  assembleSplitExperience,
  createSplitExperienceStages,
} from "./model-experience-stages.mjs";

const repository = fileURLToPath(new URL("..", import.meta.url));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
const fixturePath = args.fixture ? path.resolve(args.fixture) : null;
const fixture = fixturePath
  ? JSON.parse(await fs.readFile(fixturePath, "utf8"))
  : null;
const output = path.resolve(
  args.out ||
    (fixture?.id
      ? `artifacts/model-experience-lab-${fixture.id}`
      : "artifacts/model-experience-lab"),
);
const resume = args.resume === "true";
const qaRepair = args["qa-repair"] !== "false";
const models = String(
  args.models || "z-ai/glm-5.3-flash,moonshotai/kimi-k2.6,qwen/qwen3.6-27b",
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const referenceFiles = {
  "z-ai/glm-5.3-flash": path.join(
    repository,
    "artifacts/nightjar-cinematic-prototype/qa/desktop-full-page.png",
  ),
  "moonshotai/kimi-k2.6": path.join(
    repository,
    "artifacts/canopy-stone-storm-prototype/qa/desktop-full-page.png",
  ),
  "qwen/qwen3.6-27b": path.join(
    repository,
    "artifacts/a1-design-showcase/screenshots/kinetic-club-desktop.png",
  ),
};
const assetSource = path.resolve(
  repository,
  fixture?.assetSource || "artifacts/creative-probe-kokoro/public/assets",
);
const nodeModules = path.join(
  repository,
  "artifacts/creative-probe-kokoro/node_modules",
);

if (!process.env.OPENROUTER_API_KEY)
  throw new Error("OPENROUTER_API_KEY is required");

const slugFor = (model) =>
  model
    .replace(/^[^/]+\//u, "")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/(^-|-$)/gu, "")
    .toLowerCase();

const referenceData = new Map(
  await Promise.all(
    models.map(async (model) => {
      const file = fixture?.referenceFile
        ? path.resolve(repository, fixture.referenceFile)
        : referenceFiles[model] || Object.values(referenceFiles)[0];
      const mime =
        path.extname(file).toLowerCase() === ".webp"
          ? "image/webp"
          : "image/png";
      return [
        model,
        `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`,
      ];
    }),
  ),
);
const directionFor = (model) =>
  fixture?.assignedDirection ||
  {
    "z-ai/glm-5.3-flash":
      "Cinematic narrative: immersive image crops, dramatic but readable type, layered spatial transitions, and a page that unfolds like a guided story.",
    "moonshotai/kimi-k2.6":
      "High-contrast diagnostic utility: confident display type, bold color blocking, an immediately useful conversion interaction, and strong section-to-section contrast.",
    "qwen/qwen3.6-27b":
      "Contemporary asymmetric editorial: surprising alignment, expressive image geometry, generous but purposeful scale changes, and crisp conversion hierarchy.",
  }[model] ||
  "Create a distinctive premium local-service experience.";
const businessBrief =
  fixture?.businessBrief ||
  `
- Alder & Ash Architecture is a fictional residential architecture studio serving Asheville and Western North Carolina. Do not claim a street address.
- Phone: (828) 555-0142. Email: hello@alderandash.studio.
- Primary action: Schedule a discovery call.
- Services: Mountain Home Design; Thoughtful Renovations; Interior Architecture; Site and Feasibility Studies.
- Audience: homeowners planning distinctive mountain homes, renovations, or interiors.
- Natural SEO vocabulary: residential architect Asheville, mountain home architect, sustainable home design, historic home renovation Asheville.
- Never invent awards, testimonials, reviews, certifications, guarantees, pricing, staff, years in business, project counts, named client projects, or response times.`;
const assetBrief =
  fixture?.assetBrief ||
  `
- Use only /assets/hero-atrium.webp, /assets/project-mosaic.webp, and /assets/ridge-house.webp for imagery.`;
const interactionBrief = fixture?.interactionBrief || "";
const forbiddenClaims = Array.isArray(fixture?.forbiddenClaims)
  ? fixture.forbiddenClaims
  : [];
const splitStages = Object.fromEntries(
  createSplitExperienceStages().map((stage) => [stage.id, stage]),
);
const brief = `
You are the sole creative director and frontend author for a controlled LaunchLoom canary. Create a complete, unusually polished React 19 and CSS single-page website. Your work will be rendered exactly as returned. A deterministic compiler will validate it but will not redesign it.

Work from one shared design contract so the separately authored files form one coherent experience.

CREATIVE BAR
- Treat the supplied image as evidence of editorial confidence, typographic scale, pacing, material atmosphere, and art direction. Do not copy its layout, brand, wording, or typography one-to-one.
- Produce a composition that would feel at home on godly.design, Awwwards, or a strong independent studio portfolio, while remaining usable for a local service business.
- Do not use numbered service cards, a bento grid, a generic card wall, glassmorphism, neon gradients, or repeated fade-up sections. A split or centered composition is allowed only when the proportions, overlap, crop, and typography feel unmistakably art-directed rather than templated.
- The complete header and hero must fit inside 1536 by 864 and 1366 by 768 viewports at 100% zoom. The opening promise, image, and primary action must all be visible without scrolling.
- The first viewport must feel visually complete, not sparse or unfinished. The primary image should occupy roughly 35 to 60 percent of the visible hero and must not look like a floating thumbnail. Keep the headline, supporting sentence, and primary action in one coherent visual cluster.
- Use whitespace to focus attention, but do not leave more than about one third of the first viewport as purposeless empty space. Body copy and navigation must remain comfortably readable at 100 percent zoom.
- Build a clear visual crescendo across the page: a memorable opening, at least two strong image moments, a distinctive service presentation, useful FAQs, and a decisive closing conversion scene. Each section must look composed, not merely placed in a vertical stack.
- Use no more than two type families. Decorative script is optional and should never carry essential information. Body copy should render at 16px or larger on desktop and mobile.
- Choose one purposeful advanced interaction. GSAP and ScrollTrigger are available, but use them only if a scrubbed, pinned, or sequenced scene materially improves the narrative. Generic reveal animations do not justify GSAP.
- Mobile must be recomposed, not merely scaled. Respect prefers-reduced-motion.

VERIFIED FICTIONAL BUSINESS FACTS
${businessBrief}

LOCAL ASSETS AND STACK
- React 19, Vite 6, plain JSX, and CSS. GSAP is installed but optional.
- Allowed imports: react, react-dom, gsap, gsap/ScrollTrigger, and ./styles.css.
${assetBrief}
- Google Fonts may be loaded in index.html. No other remote scripts, media, UI libraries, icon libraries, SVG drawings, canvas, Three.js, or placeholder art.
- Use semantic HTML, one H1, keyboard-visible focus, adequate contrast, useful alt text, and no horizontal overflow.
- Navigation must expose Services, FAQs, and Contact. Conversion must exist in the hero or immediately after it.
- Mark the root with data-model-experience, the opening section with data-hero, and the immediate conversion element with data-early-conversion.
- Use accessible native details for FAQs or equivalent keyboard-operable disclosures.
- The inquiry form must work without a backend and replace itself with an honest in-page demo confirmation.
- Include canonical, description, Open Graph tags, and JSON-LD using the most accurate supplied local-business type and only supplied facts.
- No em dash character anywhere.
${interactionBrief}

COPY LIMITS
- Hero heading: 4 to 10 memorable words. Hero body: one sentence under 24 words.
- Services should read as an authored, business-specific presentation, not cards with decorative numbers.
- Every section needs a distinct informational or emotional job.
- Keep Why Us or proof content to at most three short supported principles.

Return complete work for the requested stage. Do not wrap strings in markdown fences.
`;

async function requestJsonStage(model, { messages, stage, temperature }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360_000);
  try {
    const sessionId = openRouterSessionId(
      "model-experience-lab",
      model,
      brief,
    );
    const response = await openRouterChatCompletion({
      title: "LaunchLoom Model Experience Lab",
      signal: controller.signal,
      sessionId,
      body: {
          model,
          temperature,
          reasoning: { effort: stage.reasoningEffort, exclude: true },
          response_format: { type: "json_schema", json_schema: stage.schema },
          max_tokens: stage.maxTokens,
          messages,
        },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        `OpenRouter ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`,
      );
    const content = payload.choices?.[0]?.message?.content;
    if (!content)
      throw new Error(
        `No content returned for ${stage.id} (${payload.choices?.[0]?.finish_reason || "unknown"}; provider ${payload.provider || "unknown"})`,
      );
    const cache = logOpenRouterCacheUsage(
      `model-experience-${stage.id}`,
      payload.usage,
    );
    return {
      value: parseModelJson(content),
      usage: payload.usage || null,
      cache,
      sessionId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestModel(model, repair) {
  const system = repair
    ? "Return valid JSON only. Repair the requested frontend file without changing its art direction or verified facts. Preserve the visual ambition and do not replace the composition with a generic template."
    : "Return valid JSON only. You are evaluated on visual originality, frontend quality, responsive composition, factual discipline, SEO, accessibility, and conversion clarity.";
  const shared = `${brief}\n\nASSIGNED ART DIRECTION\n${directionFor(model)}`;
  const usage = {};
  let contract;

  if (repair) {
    contract = {
      designContract:
        repair.files.designContract ||
        repair.files.designRationale ||
        "Preserve the current composition and visual system.",
      designRationale:
        repair.files.designRationale || "Preserve the current art direction.",
    };
  } else {
    const result = await requestJsonStage(model, {
      stage: splitStages.contract,
      temperature: 0.72,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${shared}\n\nCONTRACT STAGE\nReturn a detailed implementation contract covering the page narrative, DOM outline, section IDs, component states, class-name vocabulary, responsive recomposition, typography, color tokens, image placement, motion, interaction behavior, accessibility, metadata, and factual boundaries. Also return a rationale under 220 words. Do not return source files yet.`,
            },
            {
              type: "text",
              text: "Full-page reference evidence for quality and rhythm. Transfer principles, not layout or content:",
            },
            {
              type: "image_url",
              image_url: {
                url: referenceData.get(model) || [...referenceData.values()][0],
              },
            },
          ],
        },
      ],
    });
    contract = result.value;
    usage.contract = result.usage;
  }

  const repairEvidence = repair
    ? `\n\nREPAIR EVIDENCE\n${repair.error.slice(0, 5000)}\nTreat every measured failure as mandatory.`
    : "";
  const appResult = await requestJsonStage(model, {
    stage: splitStages.appJsx,
    temperature: repair ? 0.2 : 0.68,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `${shared}\n\nDESIGN CONTRACT\n${contract.designContract}${repairEvidence}\n\nAPP JSX STAGE\nReturn JSON with one key, content, containing complete src/App.jsx. Implement every section, state, interaction, accessibility behavior, marker, and class name in the contract. Import ./styles.css. Do not return CSS or HTML.${repair ? `\n\nCURRENT APP JSX\n${repair.files.appJsx}` : ""}`,
      },
    ],
  });
  usage.appJsx = appResult.usage;

  const [cssResult, htmlResult] = await Promise.all([
    requestJsonStage(model, {
      stage: splitStages.stylesCss,
      temperature: repair ? 0.2 : 0.68,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${shared}\n\nDESIGN CONTRACT\n${contract.designContract}${repairEvidence}\n\nAUTHORED APP JSX\n${appResult.value.content}\n\nCSS STAGE\nReturn JSON with one key, content, containing complete src/styles.css. Style the exact authored markup as the contract specifies. Include responsive recomposition at desktop, compact desktop, and mobile, visible focus, contrast, reduced motion, and overflow safety. Do not return JSX or HTML.${repair ? `\n\nCURRENT CSS\n${repair.files.stylesCss}` : ""}`,
        },
      ],
    }),
    requestJsonStage(model, {
      stage: splitStages.indexHtml,
      temperature: repair ? 0.2 : 0.5,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${shared}\n\nDESIGN CONTRACT\n${contract.designContract}${repairEvidence}\n\nINDEX HTML STAGE\nReturn JSON with one key, content, containing complete index.html for the authored React app. Include the root node, module entry, title, canonical, description, Open Graph tags, allowed fonts, and truthful JSON-LD using only supplied facts. Do not return JSX or CSS.${repair ? `\n\nCURRENT INDEX HTML\n${repair.files.indexHtml}` : ""}`,
        },
      ],
    }),
  ]);
  usage.stylesCss = cssResult.usage;
  usage.indexHtml = htmlResult.usage;

  const files = assembleSplitExperience({
    contract,
    appJsx: appResult.value,
    stylesCss: cssResult.value,
    indexHtml: htmlResult.value,
  });
  for (const key of ["appJsx", "stylesCss", "indexHtml"])
    files[key] = files[key].replaceAll("—", "-");
  return { files, usage: { stages: usage } };
}

function run(command, commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(
            new Error(`${command} exited with ${code}\n${stdout}\n${stderr}`),
          ),
    );
  });
}

async function writeCandidate(directory, files) {
  // The lab serves every candidate below its own path. Keep model-authored markup
  // intact while making the sealed local assets portable at that path.
  files.appJsx = files.appJsx
    .replaceAll('"/assets/', '"./assets/')
    .replaceAll("'/assets/", "'./assets/");
  files.stylesCss += `

/* LaunchLoom deterministic responsive boundary. This does not alter art direction. */
html, body, #root { max-width: 100%; overflow-x: clip; }
@media (max-width: 480px) {
  header [data-early-conversion] { display: none; }
}
`;
  await fs.mkdir(path.join(directory, "src"), { recursive: true });
  await fs.mkdir(path.join(directory, "public"), { recursive: true });
  await fs.cp(assetSource, path.join(directory, "public/assets"), {
    recursive: true,
  });
  await fs.writeFile(path.join(directory, "src/App.jsx"), files.appJsx);
  await fs.writeFile(path.join(directory, "src/styles.css"), files.stylesCss);
  await fs.writeFile(
    path.join(directory, "src/main.jsx"),
    'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./styles.css";\ncreateRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);\n',
  );
  await fs.writeFile(path.join(directory, "index.html"), files.indexHtml);
  await fs.writeFile(
    path.join(directory, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: { build: "vite build" },
        dependencies: {
          "@vitejs/plugin-react": "latest",
          gsap: "latest",
          react: "latest",
          "react-dom": "latest",
          vite: "latest",
        },
        devDependencies: {},
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(directory, "vite.config.mjs"),
    'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ base: "./", plugins: [react()] });\n',
  );
  await fs.symlink(nodeModules, path.join(directory, "node_modules"), "dir");
}

async function author(model) {
  const slug = slugFor(model);
  const directory = path.join(output, slug);
  const record = {
    model,
    slug,
    ok: false,
    repaired: false,
    usage: null,
    error: null,
  };
  try {
    if (
      resume &&
      (await fs.stat(path.join(directory, "dist/index.html")).catch(() => null))
    ) {
      record.ok = true;
      record.resumed = true;
      return record;
    }
    let generated = await requestModel(model);
    record.usage = generated.usage;
    await writeCandidate(directory, generated.files);
    try {
      await run("npm", ["run", "build"], directory);
    } catch (error) {
      record.repaired = true;
      await fs.rm(path.join(directory, "node_modules"), { force: true });
      await fs.rm(path.join(directory, "dist"), {
        recursive: true,
        force: true,
      });
      generated = await requestModel(model, {
        error: error instanceof Error ? error.message : String(error),
        files: generated.files,
      });
      await fs.rm(directory, { recursive: true, force: true });
      await writeCandidate(directory, generated.files);
      await run("npm", ["run", "build"], directory);
    }
    record.ok = true;
    record.rationale = generated.files.designRationale;
    await fs.writeFile(
      path.join(directory, "model-output.json"),
      `${JSON.stringify({ model, rationale: record.rationale, usage: record.usage }, null, 2)}\n`,
    );
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
  }
  return record;
}

if (!resume) await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, "screenshots"), { recursive: true });
const records = await Promise.all(models.map(author));
const successful = records.filter((record) => record.ok);
if (!successful.length)
  throw new Error(`No model candidate built: ${JSON.stringify(records)}`);

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://localhost").pathname,
    );
    const [slug, ...rest] = pathname.replace(/^\/+|\/+$/gu, "").split("/");
    const record = successful.find((item) => item.slug === slug);
    if (!record) throw new Error("Unknown candidate");
    let target = path.join(output, slug, "dist", ...rest);
    const stat = await fs.stat(target).catch(() => null);
    if (!stat || stat.isDirectory()) target = path.join(target, "index.html");
    const extension = path.extname(target);
    response.setHeader(
      "content-type",
      extension === ".html"
        ? "text/html"
        : extension === ".css"
          ? "text/css"
          : extension === ".js"
            ? "text/javascript"
            : extension === ".webp"
              ? "image/webp"
              : "application/octet-stream",
    );
    response.end(await fs.readFile(target));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Could not start model lab server");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

async function verifyRecord(record) {
  record.verification = [];
  for (const viewport of [
    { name: "desktop", width: 1536, height: 864 },
    { name: "desktop-compact", width: 1366, height: 768 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(`${origin}/${record.slug}/`, { waitUntil: "networkidle" });
    const result = await page.evaluate(() => {
      const root = document.querySelector("[data-model-experience]");
      const hero = document.querySelector("[data-hero]");
      const heroBounds = hero?.getBoundingClientRect();
      const mainChildren = [...document.querySelectorAll("main > *")];
      const text = [document.title, document.body.innerText].join("\n");
      return {
        hasRoot: Boolean(root),
        h1: document.querySelectorAll("h1").length,
        nav: [...document.querySelectorAll("nav a, nav button")].map((item) =>
          item.textContent?.trim(),
        ),
        earlyConversion: (() => {
          const conversions = [
            ...document.querySelectorAll("[data-early-conversion]"),
          ];
          return conversions.some((conversion) => {
            if (hero?.contains(conversion)) return true;
            const topLevel = mainChildren.find(
              (child) => child === conversion || child.contains(conversion),
            );
            const position = topLevel ? mainChildren.indexOf(topLevel) : -1;
            return position === 0 || position === 1;
          });
        })(),
        heroFits: !heroBounds || heroBounds.bottom <= innerHeight + 1,
        heroBounds: heroBounds
          ? {
              top: heroBounds.top,
              bottom: heroBounds.bottom,
              width: heroBounds.width,
              height: heroBounds.height,
            }
          : null,
        heroChildren: hero
          ? [...hero.children].map((child) => {
              const bounds = child.getBoundingClientRect();
              const style = getComputedStyle(child);
              return {
                className: child.className || child.tagName,
                display: style.display,
                gridColumn: style.gridColumn,
                width: bounds.width,
                height: bounds.height,
              };
            })
          : [],
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        emDashes: (text.match(/—/gu) || []).length,
        brokenImages: [...document.images].filter(
          (image) => image.complete && image.naturalWidth === 0,
        ).length,
        brokenFragments: [...document.querySelectorAll('a[href^="#"]')]
          .map((link) => link.getAttribute("href"))
          .filter(
            (href) => href && href !== "#" && !document.querySelector(href),
          ).length,
        metadataText: [
          ...[...document.querySelectorAll("meta[content]")].map(
            (meta) => meta.getAttribute("content") || "",
          ),
          ...[
            ...document.querySelectorAll('script[type="application/ld+json"]'),
          ].map((script) => script.textContent || ""),
        ].join("\n"),
      };
    });
    const navText = result.nav.join(" ");
    const renderedText = await page.locator("body").innerText();
    const unsupportedClaims = forbiddenClaims.filter((claim) =>
      new RegExp(claim, "iu").test(`${renderedText}\n${result.metadataText}`),
    );
    let formOutcome = { checked: false, valid: true, detail: "" };
    if (viewport.name === "desktop") {
      const form = page
        .locator('form:has(input[type="email"]), form:has(textarea)')
        .first();
      if (!(await form.isVisible().catch(() => false))) {
        formOutcome = {
          checked: true,
          valid: false,
          detail: "inquiry form is absent or hidden",
        };
      } else {
        for (const input of await form
          .locator(
            "input:not([type=hidden]):not([type=checkbox]):not([type=radio])",
          )
          .all()) {
          if (!(await input.isVisible())) continue;
          const type = await input.getAttribute("type");
          const name = (await input.getAttribute("name")) || "";
          await input.fill(
            type === "email" || /email/iu.test(name)
              ? "test@example.com"
              : type === "tel" || /phone/iu.test(name)
                ? "123-456-7890"
                : "Test User",
          );
        }
        for (const textarea of await form.locator("textarea").all())
          if (await textarea.isVisible())
            await textarea.fill("Fictional local demo inquiry");
        await form
          .locator('button[type="submit"], input[type="submit"]')
          .first()
          .click();
        await page.waitForTimeout(250);
        const outcomeText = await page.locator("body").innerText();
        const honest =
          /not sent|nothing was sent|not configured|local demo|demo only|please call|please email/iu.test(
            outcomeText,
          );
        const falseDelivery =
          /message (?:was )?(?:sent|submitted|received)|we(?:'|’)ve received|thank you for (?:your )?(?:submission|message)/iu.test(
            outcomeText,
          ) && !/not sent|nothing was sent/iu.test(outcomeText);
        formOutcome = {
          checked: true,
          valid: honest && !falseDelivery,
          detail:
            honest && !falseDelivery
              ? "honest fallback shown"
              : "submission lacks an honest local-demo fallback",
        };
      }
    }
    const errors = [
      !result.hasRoot && "missing root marker",
      result.h1 !== 1 && `expected one H1, got ${result.h1}`,
      !/Services/iu.test(navText) && "missing Services navigation",
      !/FAQs/iu.test(navText) && "missing FAQs navigation",
      !/Contact/iu.test(navText) && "missing Contact navigation",
      !result.earlyConversion && "conversion is not immediate",
      viewport.name.startsWith("desktop") &&
        !result.heroFits &&
        "hero exceeds desktop viewport",
      result.overflow && "horizontal overflow",
      result.emDashes && "rendered em dash",
      result.brokenImages && "broken image",
      result.brokenFragments && "broken fragment link",
      unsupportedClaims.length &&
        `unsupported claims: ${unsupportedClaims.join(", ")}`,
      formOutcome.checked && !formOutcome.valid && formOutcome.detail,
      browserErrors.length && `browser errors: ${browserErrors.join(" | ")}`,
    ].filter(Boolean);
    record.verification.push({
      viewport,
      ...result,
      unsupportedClaims,
      formOutcome,
      errors,
    });
    await page.screenshot({
      path: path.join(
        output,
        "screenshots",
        `${record.slug}-${viewport.name}.png`,
      ),
      fullPage: true,
    });
    await page.close();
  }
  record.valid = record.verification.every((item) => item.errors.length === 0);
}

for (const record of successful) await verifyRecord(record);

for (const record of successful.filter((item) => qaRepair && !item.valid)) {
  try {
    const directory = path.join(output, record.slug);
    const currentFiles = {
      appJsx: await fs.readFile(path.join(directory, "src/App.jsx"), "utf8"),
      stylesCss: await fs.readFile(
        path.join(directory, "src/styles.css"),
        "utf8",
      ),
      indexHtml: await fs.readFile(path.join(directory, "index.html"), "utf8"),
      designRationale:
        record.rationale || "Preserve the existing art direction.",
    };
    const failures = record.verification.map(
      ({ viewport, errors, heroFits, heroBounds, heroChildren }) => ({
        viewport,
        heroFits,
        heroBounds,
        heroChildren,
        errors,
      }),
    );
    const revised = await requestModel(record.model, {
      error: `Release checks failed:\n${JSON.stringify(failures, null, 2)}\nThe fixed header and complete hero must fit at 100 percent zoom. Navigation controls must be semantic links or buttons inside nav. Inspect the exact hero wrapper hierarchy and computed child measurements. If one wrapper contains both copy and figure, that wrapper itself must own the intended columns and width rather than collapsing into one parent-grid cell.`,
      files: currentFiles,
    });
    await fs.rm(directory, { recursive: true, force: true });
    await writeCandidate(directory, revised.files);
    await run("npm", ["run", "build"], directory);
    record.repaired = true;
    record.rationale = revised.files.designRationale;
    record.usage = revised.usage || record.usage;
    await fs.writeFile(
      path.join(directory, "model-output.json"),
      `${JSON.stringify({ model: record.model, rationale: record.rationale, usage: record.usage }, null, 2)}\n`,
    );
    await verifyRecord(record);
  } catch (error) {
    record.qaRepairError =
      error instanceof Error ? error.message : String(error);
  }
}

await browser.close();
await new Promise((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve())),
);
await fs.writeFile(
  path.join(output, "results.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)}\n`,
);

const cards = successful
  .map(
    (record) =>
      `<a href="./${record.slug}/dist/index.html"><img src="./screenshots/${record.slug}-desktop.png" alt="${record.model} candidate"><strong>${record.model}</strong><span>${record.valid ? "Passed deterministic gates" : "Needs review"}</span></a>`,
  )
  .join("");
await fs.writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>LaunchLoom model-authored experience lab</title><style>*{box-sizing:border-box}body{margin:0;padding:clamp(24px,6vw,80px);background:#0c0c0c;color:#f5f3ec;font:16px/1.4 Arial,sans-serif}header{max-width:950px;margin-bottom:64px}h1{margin:.15em 0;font:400 clamp(52px,8vw,112px)/.88 Georgia,serif;letter-spacing:-.06em}p{max-width:680px;color:#aaa}.grid{display:grid;grid-template-columns:repeat(${Math.min(3, successful.length)},minmax(0,1fr));gap:18px}.grid a{display:grid;gap:12px;color:inherit;text-decoration:none}.grid img{width:100%;aspect-ratio:4/5;object-fit:cover;object-position:top;border:1px solid #333}.grid span{color:#aaa;font-size:13px}@media(max-width:900px){.grid{grid-template-columns:1fr}}</style></head><body><header><small>Latest pipeline models, identical sealed brief</small><h1>Model-authored experience canaries.</h1><p>No shared LaunchLoom renderer chose these compositions. Each model authored its own React and CSS implementation. Deterministic systems only supplied facts, assets, constraints, and release checks.</p></header><main class="grid">${cards}</main></body></html>`,
);

console.log(`model_experience_lab=${output}`);
for (const record of records)
  console.log(
    JSON.stringify({
      model: record.model,
      ok: record.ok,
      valid: record.valid,
      repaired: record.repaired,
      error: record.error,
    }),
  );
