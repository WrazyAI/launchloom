import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { getDesignVariant } from "../templates/client-site/src/lib/design-variants.ts";

const outputFlag = process.argv.indexOf("--out");
const output = path.resolve(
  (outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined) ||
    path.join(os.tmpdir(), "launchloom-template-showcase"),
);

const sites = [
  {
    slug: "harbor-family-care",
    variantId: "care-private-practice",
    art: "care",
    name: "Harbor Family Care",
    monogram: "HFC",
    eyebrow: "In-home support across North Harbor",
    headline: "Care that begins with listening.",
    intro:
      "Thoughtful daily support shaped around the person, their routines, and the family beside them.",
    primary: "Plan a conversation",
    secondary: "Explore support",
    servicesTitle: "A steadier day starts here",
    services: [
      [
        "Daily living support",
        "Practical help shaped around familiar routines at home.",
      ],
      [
        "Family respite",
        "Planned support that gives family caregivers room to reset.",
      ],
      [
        "Companion visits",
        "Conversation, shared activities, and everyday connection.",
      ],
    ],
    aboutTitle: "The first conversation is simply a conversation.",
    about:
      "Tell us what daily life looks like now and where support would be useful. We listen first, then outline a clear next step for the family to consider.",
    process: [
      "Share what support would help",
      "Talk through routines and preferences",
      "Review a practical care outline",
    ],
    faq: [
      [
        "Can family join the first call?",
        "Yes. Family members are welcome to take part in the planning conversation.",
      ],
    ],
    contactTitle: "Start with what matters at home.",
    contactNote: "Fictional fixture. No form data is submitted.",
    theme: ["#284f47", "#e9efe9", "#f9f5ee", "#c9976d", "#172a26"],
  },
  {
    slug: "northline-plumbing",
    variantId: "trades-emergency-line",
    art: "trades",
    name: "Northline Plumbing",
    monogram: "NP",
    eyebrow: "Plumbing service across Westfield",
    headline: "Stop the leak. Start with one call.",
    intro:
      "Tell us what you see, where it is happening, and how we can reach you.",
    primary: "Request service",
    secondary: "Call (555) 013-4820",
    servicesTitle: "What needs attention?",
    services: [
      [
        "Leaks and pipe repair",
        "For active drips, visible water, and damaged supply lines.",
      ],
      [
        "Drain clearing",
        "For slow drains, recurring clogs, and backed-up fixtures.",
      ],
      [
        "Water heaters",
        "For inconsistent hot water, replacement, and maintenance.",
      ],
    ],
    aboutTitle: "Clear information before work begins.",
    about:
      "We confirm the service address, learn what the system is doing, and explain the next practical step before scheduling work.",
    process: [
      "Describe the problem",
      "Confirm location and access",
      "Receive the next available step",
    ],
    faq: [
      [
        "What should I share when I call?",
        "Describe where the issue is, when it started, and whether water is actively flowing.",
      ],
    ],
    contactTitle: "Tell us what the plumbing is doing.",
    contactNote: "Fictional fixture. No service request is submitted.",
    theme: ["#f4552f", "#f0efe9", "#f8f5ed", "#f7c948", "#081216"],
  },
  {
    slug: "common-table-bakery",
    variantId: "general-editorial-house",
    art: "bakery",
    name: "Common Table Bakery",
    monogram: "CT",
    eyebrow: "Bread, pastry, and coffee in Old Market",
    headline: "Made slowly. Shared warmly.",
    intro:
      "Naturally leavened bread, laminated pastry, and a neighborhood table ready each morning.",
    primary: "See today's counter",
    secondary: "Plan a visit",
    servicesTitle: "From the ovens this morning",
    services: [
      [
        "Naturally leavened loaves",
        "Long-fermented bread baked for the morning counter.",
      ],
      [
        "Laminated pastry",
        "Croissants and seasonal pastry folded and shaped by hand.",
      ],
      [
        "Celebration cakes",
        "Made-to-order cakes planned through a simple inquiry.",
      ],
    ],
    aboutTitle: "Flour, time, heat, and a place to gather.",
    about:
      "Our fictional Old Market bakery keeps the menu focused, the coffee fresh, and the counter changing with the season.",
    process: [
      "Browse the daily menu",
      "Ask about availability",
      "Collect from the bakery",
    ],
    faq: [
      [
        "Can I reserve a loaf?",
        "Use the inquiry form to ask about the day and item you have in mind.",
      ],
    ],
    contactTitle: "Meet us at the morning counter.",
    contactNote:
      "Fictional fixture. Menu availability is for demonstration only.",
    theme: ["#a64325", "#efe2d1", "#fbf6ec", "#d69d55", "#312018"],
  },
  {
    slug: "pulse-athletic-club",
    variantId: "general-product-studio",
    art: "athletic",
    name: "Pulse Athletic Club",
    monogram: "PA",
    eyebrow: "Strength and recovery in South Park",
    headline: "Train hard. Recover smarter.",
    intro:
      "Coached strength sessions and contrast recovery designed around a repeatable weekly rhythm.",
    primary: "Claim a trial session",
    secondary: "Tour the club",
    servicesTitle: "Build your week around progress",
    services: [
      [
        "Coached strength",
        "Small-group sessions with a clear plan for each training day.",
      ],
      ["Open training", "Dedicated time to follow your own strength program."],
      [
        "Contrast recovery",
        "Sauna and cold-plunge sessions booked around training.",
      ],
    ],
    aboutTitle: "A club for showing up again.",
    about:
      "The space is organized around focused training, measured recovery, and a schedule members can return to consistently.",
    process: [
      "Choose a starting goal",
      "Visit the club",
      "Build a weekly rhythm",
    ],
    faq: [
      [
        "Can I tour before joining?",
        "Yes. Choose the tour option and share a preferred day in the message.",
      ],
    ],
    contactTitle: "Your first session starts here.",
    contactNote: "Fictional fixture. No membership request is submitted.",
    theme: ["#c8ff00", "#dfe5dc", "#f4f7ef", "#759900", "#050806"],
  },
  {
    slug: "everwood-landscapes",
    variantId: "trades-craftsman",
    art: "landscape",
    name: "Everwood Landscapes",
    monogram: "EL",
    eyebrow: "Garden design and seasonal care in Briar County",
    headline: "A garden that belongs to the house.",
    intro:
      "Planting plans, hardscape details, and seasonal care considered as one living landscape.",
    primary: "Discuss your property",
    secondary: "See our approach",
    servicesTitle: "Designed for the way you live outside",
    services: [
      [
        "Garden design",
        "A planting direction shaped around the site and how you use it.",
      ],
      [
        "Hardscape planning",
        "Paths, gathering areas, and transitions considered together.",
      ],
      [
        "Seasonal care",
        "Scheduled garden attention guided by the changing season.",
      ],
    ],
    aboutTitle: "Begin with the ground already there.",
    about:
      "We look at light, movement, existing plants, and the relationship between the house and garden before outlining a direction.",
    process: [
      "Walk the property",
      "Shape the design direction",
      "Plan the work in stages",
    ],
    faq: [
      [
        "Do you work with existing gardens?",
        "Yes. The first visit considers what can be retained, edited, or replanted.",
      ],
    ],
    contactTitle: "Tell us how you want to use the garden.",
    contactNote: "Fictional fixture. No consultation request is submitted.",
    theme: ["#486047", "#e7e0d0", "#f8f3e9", "#a77a43", "#20291f"],
  },
];

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const sections = {
  hero: (site) =>
    `<section class="hero"><div class="hero__copy"><p class="eyebrow">${escapeHtml(site.eyebrow)}</p><h1>${escapeHtml(site.headline)}</h1><p class="lede">${escapeHtml(site.intro)}</p><div class="actions"><a class="button" href="#contact">${escapeHtml(site.primary)}</a><a class="text-link" href="#services">${escapeHtml(site.secondary)}</a></div></div><div class="hero__art"><span>${escapeHtml(site.monogram)}</span><i></i><b></b></div></section>`,
  trust: () =>
    `<section class="signal" aria-label="What to expect"><span>Clear next step</span><span>Local service</span><span>Thoughtful follow-up</span></section>`,
  services: (site) =>
    `<section class="section services" id="services"><header class="section__heading"><p class="eyebrow">Ways to begin</p><h2>${escapeHtml(site.servicesTitle)}</h2></header><div class="service-list">${site.services.map(([name, description]) => `<article><h3>${escapeHtml(name)}</h3><p>${escapeHtml(description)}</p><a href="#contact">Learn more <span>↗</span></a></article>`).join("")}</div></section>`,
  about: (site) =>
    `<section class="story"><div class="story__art"><span>${escapeHtml(site.name)}</span></div><div class="story__copy"><p class="eyebrow">Our approach</p><h2>${escapeHtml(site.aboutTitle)}</h2><p>${escapeHtml(site.about)}</p><a class="text-link" href="#contact">Start a conversation</a></div></section>`,
  process: (site) =>
    `<section class="section process"><header class="section__heading"><p class="eyebrow">What happens next</p><h2>A clear way forward.</h2></header><ol>${site.process.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(step)}</p></li>`).join("")}</ol></section>`,
  gallery: (site) =>
    `<section class="gallery-art" aria-label="Brand atmosphere"><div><span>${escapeHtml(site.monogram)}</span></div><div></div><div></div></section>`,
  coverage: (site) =>
    `<section class="coverage"><p class="eyebrow">Local by design</p><h2>${escapeHtml(site.eyebrow)}</h2><a href="#contact">Confirm your location</a></section>`,
  faq: (site) =>
    `<section class="section faq"><p class="eyebrow">Useful details</p><h2>Before you reach out.</h2>${site.faq.map(([question, answer]) => `<details><summary>${escapeHtml(question)}<span>+</span></summary><p>${escapeHtml(answer)}</p></details>`).join("")}</section>`,
  contact: (site) =>
    `<section class="contact" id="contact"><div><p class="eyebrow">Take the next step</p><h2>${escapeHtml(site.contactTitle)}</h2><p>${escapeHtml(site.contactNote)}</p></div><form><label>Name<input autocomplete="name" placeholder="Your name"></label><label>Email<input type="email" autocomplete="email" placeholder="you@example.com"></label><label>How can we help?<textarea placeholder="Share a few useful details"></textarea></label><button type="button">${escapeHtml(site.primary)}</button></form></section>`,
};

const baseCss = String.raw`
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:var(--paper);font-family:Arial,sans-serif}a{color:inherit;text-decoration:none}p{line-height:1.6}h1,h2,h3,p{margin-top:0}
.nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;padding:20px clamp(20px,5vw,72px);border-bottom:1px solid color-mix(in srgb,var(--ink) 18%,transparent);background:var(--paper)}.brand{display:flex;align-items:center;gap:12px;font-weight:800}.brand span{display:grid;width:42px;height:42px;place-items:center;background:var(--ink);color:var(--paper);font-size:11px}.nav nav{display:flex;gap:28px;font-size:13px}.nav__action{justify-self:end;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.hero{display:grid;grid-template-columns:minmax(0,.92fr) minmax(360px,1.08fr);gap:clamp(36px,6vw,90px);align-items:center;min-height:720px;padding:clamp(60px,8vw,120px) clamp(20px,5vw,72px);background:var(--wash)}.hero__copy{max-width:720px}.eyebrow{margin-bottom:20px;color:var(--accent);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.18em}.hero h1{font-size:clamp(62px,7vw,112px);line-height:.88;letter-spacing:-.07em;margin-bottom:30px}.lede{max-width:610px;color:color-mix(in srgb,var(--ink) 72%,transparent);font-size:18px}.actions{display:flex;align-items:center;gap:26px;margin-top:32px}.button{padding:16px 22px;background:var(--accent);color:var(--paper);font-weight:900}.text-link{padding-bottom:5px;border-bottom:1px solid currentColor;font-weight:800}
.hero__art{position:relative;display:grid;min-height:560px;place-items:center;overflow:hidden;background:linear-gradient(145deg,var(--accent),var(--ink));color:var(--paper)}.hero__art span{position:relative;z-index:2;font-size:clamp(80px,12vw,180px);font-weight:900;letter-spacing:-.08em}.hero__art i,.hero__art b{position:absolute;display:block;border:1px solid color-mix(in srgb,var(--paper) 55%,transparent);border-radius:50%}.hero__art i{width:72%;aspect-ratio:1}.hero__art b{width:44%;aspect-ratio:1}
.signal{display:grid;grid-template-columns:repeat(3,1fr);border-block:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}.signal span{padding:25px clamp(20px,5vw,72px);border-right:1px solid color-mix(in srgb,var(--ink) 18%,transparent);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.section{padding:clamp(90px,10vw,150px) clamp(20px,5vw,72px)}.section__heading{max-width:920px;margin-bottom:60px}.section h2,.story h2,.contact h2,.coverage h2{font-size:clamp(46px,6vw,84px);line-height:.94;letter-spacing:-.065em}
.service-list{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.service-list article{display:flex;flex-direction:column;min-height:330px;padding:34px;border:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}.service-list h3{font-size:clamp(24px,3vw,38px);line-height:1;letter-spacing:-.04em}.service-list article p{color:color-mix(in srgb,var(--ink) 68%,transparent)}.service-list article a{display:flex;justify-content:space-between;margin-top:auto;font-size:12px;font-weight:800}
.story{display:grid;grid-template-columns:1.05fr .95fr;min-height:720px;background:var(--accent);color:var(--paper)}.story__art{display:grid;place-items:end start;padding:50px;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--ink) 82%,transparent) 0 14px,color-mix(in srgb,var(--accent) 68%,transparent) 14px 28px)}.story__art span{max-width:380px;font-size:clamp(52px,7vw,100px);font-weight:900;line-height:.82;letter-spacing:-.07em}.story__copy{align-self:center;padding:clamp(55px,8vw,120px)}.story__copy .eyebrow{color:var(--secondary)}.story__copy p{max-width:600px}
.process ol{display:grid;grid-template-columns:repeat(3,1fr);padding:0;margin:0;list-style:none}.process li{min-height:240px;padding:30px;border-top:2px solid var(--accent);background:color-mix(in srgb,var(--wash) 62%,var(--paper))}.process li span{color:var(--accent);font-size:11px;font-weight:900}.process li p{margin-top:65px;font-size:24px;line-height:1.1}.gallery-art{display:grid;grid-template-columns:1.3fr .7fr;grid-template-rows:320px 320px;gap:16px;padding:16px}.gallery-art div{min-height:220px;background:linear-gradient(140deg,var(--ink),var(--accent))}.gallery-art div:first-child{grid-row:1/3;display:grid;place-items:center;color:var(--paper)}.gallery-art div:first-child span{font-size:150px;font-weight:900;letter-spacing:-.08em}.gallery-art div:nth-child(2){background:linear-gradient(40deg,var(--secondary),var(--wash))}.gallery-art div:nth-child(3){background:repeating-radial-gradient(circle at 100% 100%,var(--accent) 0 20px,var(--ink) 21px 40px)}
.coverage{padding:100px clamp(20px,5vw,72px);background:var(--ink);color:var(--paper)}.coverage .eyebrow{color:var(--secondary)}.coverage h2{max-width:920px}.coverage a{display:inline-block;margin-top:15px;padding-bottom:6px;border-bottom:1px solid currentColor;font-weight:800}.faq{max-width:1050px}.faq details{border-top:1px solid color-mix(in srgb,var(--ink) 22%,transparent);padding:24px 0}.faq summary{display:flex;justify-content:space-between;cursor:pointer;font-size:22px;font-weight:800}.faq details p{max-width:700px;margin-top:18px;color:color-mix(in srgb,var(--ink) 68%,transparent)}
.contact{display:grid;grid-template-columns:.8fr 1.2fr;gap:8vw;padding:clamp(80px,10vw,140px) clamp(20px,5vw,72px);background:var(--wash)}.contact>div p{color:color-mix(in srgb,var(--ink) 68%,transparent)}form{display:grid;gap:16px;padding:35px;background:var(--paper)}label{display:grid;gap:7px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}input,textarea{width:100%;border:1px solid color-mix(in srgb,var(--ink) 25%,transparent);padding:14px;background:transparent;color:var(--ink);font:inherit}textarea{min-height:110px;resize:vertical}button{border:0;padding:17px;background:var(--accent);color:var(--paper);font-weight:900}.footer{display:grid;grid-template-columns:1fr 2fr auto;gap:30px;padding:45px clamp(20px,5vw,72px);background:var(--ink);color:var(--paper);font-size:12px}.footer p{margin:0;color:color-mix(in srgb,var(--paper) 72%,transparent)}
.type-refined-serif h1,.type-refined-serif h2,.type-refined-serif h3{font-family:Didot,"Bodoni MT",Georgia,serif;font-weight:500}.type-industrial h1,.type-industrial h2,.type-industrial h3{font-family:Impact,"Arial Narrow",sans-serif;font-weight:500;letter-spacing:-.035em}.type-editorial h1,.type-editorial h2,.type-editorial h3,.type-heritage h1,.type-heritage h2,.type-heritage h3{font-family:Garamond,Georgia,serif;font-weight:500}.type-geometric h1,.type-geometric h2,.type-geometric h3{font-family:Futura,"Century Gothic",Arial,sans-serif;font-weight:800}
.art-care .hero__art{border-radius:260px 2px 2px}.art-care .service-list article{border-width:0 0 2px;background:#fff}.art-care .story{background:var(--ink)}
.art-trades .nav{border-top:8px solid var(--accent)}.art-trades .hero{color:#fff;background:var(--ink)}.art-trades .hero .lede{color:#dce4e2}.art-trades .hero__art{background:repeating-linear-gradient(125deg,#16262c 0 34px,#0d181c 34px 68px)}.art-trades .service-list article{border:0;border-top:8px solid var(--accent);background:#fff}.art-trades .story{background:var(--secondary);color:var(--ink)}.art-trades .story__copy .eyebrow{color:var(--ink)}
.art-bakery .hero{grid-template-columns:1.25fr .75fr;background:var(--paper)}.art-bakery .hero__art{border-radius:50% 50% 3px 3px;background:radial-gradient(circle at 48% 70%,var(--secondary) 0 18%,var(--accent) 19% 35%,var(--ink) 36%)}.art-bakery .service-list{display:block;border-top:1px solid var(--ink)}.art-bakery .service-list article{display:grid;grid-template-columns:.8fr 1fr auto;gap:30px;align-items:start;min-height:0;border:0;border-bottom:1px solid var(--ink)}.art-bakery .story{background:var(--paper);color:var(--ink);border-block:1px solid var(--ink)}
.art-athletic{background:var(--ink);color:var(--paper)}.art-athletic .nav{background:var(--ink);color:var(--paper)}.art-athletic .hero{min-height:820px;background:color-mix(in srgb,var(--accent) 16%,var(--ink));color:var(--paper)}.art-athletic .hero .eyebrow{color:var(--accent)}.art-athletic .hero .lede{color:color-mix(in srgb,var(--paper) 74%,transparent)}.art-athletic .hero__art{clip-path:polygon(10% 0,100% 0,100% 100%,0 100%,0 10%);border-bottom:12px solid var(--accent)}.art-athletic .button{background:var(--accent);color:var(--ink)}.art-athletic .signal,.art-athletic .section{background:var(--ink);color:var(--paper)}.art-athletic .service-list{grid-template-columns:1.3fr .85fr .85fr}.art-athletic .service-list article{border-color:#ffffff55;background:#ffffff08}.art-athletic .story{background:var(--wash);color:var(--ink)}.art-athletic .story__copy .eyebrow{color:var(--secondary)}.art-athletic .contact,.art-athletic .faq{color:var(--ink)}
.art-landscape .nav{margin:18px;border:1px solid var(--ink)}.art-landscape .hero{margin:18px;padding-left:clamp(30px,7vw,110px);background:var(--paper);border:1px solid var(--ink)}.art-landscape .hero__art{background:repeating-radial-gradient(ellipse at 0 100%,var(--accent) 0 40px,var(--wash) 42px 72px,var(--ink) 74px 110px)}.art-landscape .service-list{grid-template-columns:1fr 1.2fr}.art-landscape .service-list article:nth-child(3){grid-column:2}.art-landscape .story{margin:18px;background:var(--ink)}
@media(max-width:760px){.nav{grid-template-columns:1fr auto;padding:15px 18px}.nav nav{display:none}.nav__action{font-size:9px}.hero,.story,.contact{grid-template-columns:1fr;min-height:0}.hero{padding:60px 18px}.hero h1{font-size:58px}.hero__art{min-height:390px}.signal{grid-template-columns:1fr}.signal span{border-right:0;border-bottom:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}.service-list,.art-athletic .service-list,.art-landscape .service-list{grid-template-columns:1fr}.art-landscape .service-list article:nth-child(3){grid-column:auto}.art-bakery .service-list article{display:block}.process ol{grid-template-columns:1fr}.process li{min-height:160px}.process li p{margin-top:35px}.gallery-art{grid-template-columns:1fr;grid-template-rows:auto}.gallery-art div:first-child{grid-row:auto}.contact{padding-inline:18px}.footer{grid-template-columns:1fr}.art-landscape .nav,.art-landscape .hero,.art-landscape .story{margin:8px}.hero__art span,.gallery-art div:first-child span{font-size:90px}}
`;

const contrastCss = String.raw`.art-athletic .section h2,.art-athletic .service-list h3,.art-athletic .service-list article a{color:var(--paper)}.art-athletic .service-list article p{color:color-mix(in srgb,var(--paper) 72%,transparent)}.art-athletic .section .eyebrow{color:var(--accent)}`;

function renderPage(site) {
  const variant = getDesignVariant(site.variantId);
  if (!variant) throw new Error(`Unknown showcase variant: ${site.variantId}`);
  const [accent, wash, paper, secondary, ink] = site.theme;
  const rendered = variant.sections
    .map((section) => section.type)
    .filter((type) => type !== "social-proof")
    .filter((type, index, all) => all.indexOf(type) === index)
    .map((type) => sections[type]?.(site) || "")
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>${escapeHtml(site.name)} | LaunchLoom fictional showcase</title><style>${baseCss}${contrastCss}</style></head><body class="art-${site.art} composition-${variant.composition} type-${variant.typography}" style="--accent:${accent};--wash:${wash};--paper:${paper};--secondary:${secondary};--ink:${ink}" data-design-variant="${variant.id}"><header class="nav"><a class="brand" href="./index.html"><span>${escapeHtml(site.monogram)}</span>${escapeHtml(site.name)}</a><nav><a href="#services">Services</a><a href="#contact">Contact</a></nav><a class="nav__action" href="#contact">${escapeHtml(site.primary)}</a></header><main>${rendered}</main><footer class="footer"><strong>${escapeHtml(site.name)}</strong><p>Fictional LaunchLoom design fixture. No claims or form submissions are real.</p><a href="./index.html">All five concepts</a></footer></body></html>`;
}

const indexCards = sites
  .map((site, index) => {
    const variant = getDesignVariant(site.variantId);
    return `<a class="card" href="./${site.slug}.html" style="--accent:${site.theme[0]};--paper:${site.theme[2]};--ink:${site.theme[4]}"><span>0${index + 1} · ${escapeHtml(variant.name)}</span><h2>${escapeHtml(site.name)}</h2><p>${escapeHtml(site.headline)}</p><b>Open full site →</b></a>`;
  })
  .join("");
const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LaunchLoom five-site showcase</title><style>*{box-sizing:border-box}body{margin:0;background:#111;color:#fff;font-family:Arial,sans-serif}.shell{width:min(1400px,calc(100% - 36px));margin:auto;padding:70px 0}.intro{max-width:850px;margin-bottom:70px}.intro span{color:#c8ff00;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.18em}.intro h1{font:500 clamp(54px,8vw,110px)/.9 Georgia,serif;letter-spacing:-.07em;margin:16px 0}.intro p{max-width:660px;color:#aaa;font-size:17px;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.card{display:block;min-height:390px;padding:35px;background:var(--paper);color:var(--ink);text-decoration:none;border-top:8px solid var(--accent);transition:transform .2s}.card:hover{transform:translateY(-5px)}.card span{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:var(--accent)}.card h2{font:500 clamp(40px,5vw,70px)/.92 Georgia,serif;letter-spacing:-.06em;margin:65px 0 16px}.card p{font-size:18px}.card b{display:block;margin-top:60px}@media(max-width:720px){.grid{grid-template-columns:1fr}.shell{padding-top:40px}.card{min-height:330px}}</style></head><body><main class="shell"><header class="intro"><span>Five finished fictional websites</span><h1>Distinct directions, ready to inspect.</h1><p>Each link opens a complete responsive homepage driven by a reusable LaunchLoom design variant. Businesses and content are fictional. No reviews or credentials are claimed.</p></header><div class="grid">${indexCards}</div></main></body></html>`;

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, "screenshots"), { recursive: true });
await fs.writeFile(path.join(output, "index.html"), index);
for (const site of sites)
  await fs.writeFile(path.join(output, `${site.slug}.html`), renderPage(site));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
for (const site of sites) {
  await page.goto(pathToFileURL(path.join(output, `${site.slug}.html`)).href);
  await page.screenshot({
    path: path.join(output, "screenshots", `${site.slug}-desktop.png`),
    fullPage: true,
  });
}
await browser.close();
console.log(
  `template_showcase=${path.join(output, "index.html")} sites=${sites.length} screenshots=${sites.length}`,
);
