import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const outputFlag = process.argv.indexOf("--out");
const output = path.resolve(
  (outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined) ||
    path.join(os.tmpdir(), "launchloom-a1-showcase"),
);

const concepts = [
  {
    slug: "quiet-practice",
    number: "01",
    name: "Quiet Practice",
    kind: "Care and consultation",
    note: "Editorial service index, portrait-led trust, low-pressure booking",
  },
  {
    slug: "rapid-response",
    number: "02",
    name: "Rapid Response",
    kind: "Local trades",
    note: "Problem-led dispatch path, service ledger, persistent phone action",
  },
  {
    slug: "neighborhood-table",
    number: "03",
    name: "Neighborhood Table",
    kind: "Food and hospitality",
    note: "Loose collage, daily menu rhythm, visit-first conversion",
  },
  {
    slug: "kinetic-club",
    number: "04",
    name: "Kinetic Club",
    kind: "Fitness and performance",
    note: "Full-bleed action, program bands, goal-first trial path",
  },
  {
    slug: "clear-counsel",
    number: "05",
    name: "Clear Counsel",
    kind: "Professional services",
    note: "Restrained expertise ledger, people-led proof, calm inquiry",
  },
];

const base = String.raw`
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);text-rendering:optimizeLegibility}a{color:inherit}button,input,textarea{font:inherit}p{line-height:1.55}.skip{position:absolute;left:-999px}.skip:focus{left:12px;top:12px;z-index:20;background:#fff;padding:12px}.demo-note{padding:11px 24px;background:#111;color:#fff;font:700 11px/1.3 Arial,sans-serif;letter-spacing:.08em;text-align:center}.demo-note a{margin-left:14px;color:#c9ff3d}.label{font:800 10px/1.2 var(--body);letter-spacing:.2em;text-transform:uppercase}.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;text-decoration:none;font-weight:800}.link{font-weight:800;text-underline-offset:6px}.wrap{width:min(1240px,calc(100% - 48px));margin:auto}.footer{display:grid;grid-template-columns:1fr 1fr auto;gap:30px;padding:46px max(24px,calc((100vw - 1240px)/2));font-size:13px}.footer p{margin:0;opacity:.72}@media(max-width:720px){.wrap{width:min(100% - 30px,1240px)}.demo-note{text-align:left}.footer{grid-template-columns:1fr;padding:34px 18px}}
`;

const nav = (brand, action, modifier = "") =>
  `<header class="nav ${modifier}"><a class="brand" href="./index.html">${brand}</a><nav aria-label="Main navigation"><a href="#services">Services</a><a href="#approach">Approach</a><a href="#contact">Contact</a></nav><a class="nav-cta" href="#contact">${action}</a></header>`;
const footer = (brand) =>
  `<footer class="footer"><strong>${brand}</strong><p>Fictional LaunchLoom design exploration. All facts and businesses are illustrative.</p><a href="./index.html">View all directions</a></footer>`;
const shell = (title, css, content, bodyClass = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>${title} | LaunchLoom A1 showcase</title><style>${base}${css}</style></head><body class="${bodyClass}"><a class="skip" href="#main">Skip to content</a><div class="demo-note">A1-inspired original design direction <a href="./index.html">All five concepts</a></div>${content}</body></html>`;

function quietPractice() {
  const css = String.raw`
:root{--paper:#f3efe7;--ink:#17312d;--sage:#cbd8ca;--clay:#9e634f;--body:Arial,sans-serif;--display:Iowan Old Style,Baskerville,Georgia,serif}.nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:24px 4vw;border-bottom:1px solid #17312d33}.brand{font:500 25px var(--display);text-decoration:none}.nav nav{display:flex;gap:28px}.nav nav a,.nav-cta{font-size:12px;text-decoration:none}.nav-cta{justify-self:end;border-bottom:1px solid}.hero{display:grid;grid-template-columns:.9fr 1.1fr;min-height:760px;padding:60px 4vw 90px}.hero-copy{align-self:end;padding-bottom:30px}.hero h1{max-width:720px;margin:14px 0 24px;font:500 clamp(64px,7.2vw,118px)/.83 var(--display);letter-spacing:-.055em}.hero p{max-width:510px;font-size:18px}.hero-actions{display:flex;gap:25px;align-items:center;margin-top:30px}.hero .button{background:var(--ink);color:white}.portrait{position:relative;min-height:620px;overflow:hidden;border-radius:48% 48% 2px 2px;background:linear-gradient(155deg,#dde3d8,#8fa899)}.portrait:before{content:"";position:absolute;width:46%;height:68%;left:27%;bottom:-5%;border-radius:46% 46% 12% 12%;background:var(--ink)}.portrait:after{content:"";position:absolute;width:22%;aspect-ratio:1;left:39%;top:18%;border-radius:50%;background:#d8ad91}.philosophy{display:grid;grid-template-columns:.8fr 1.2fr;gap:12vw;padding:120px 4vw;background:var(--ink);color:#f8f4ec}.philosophy h2{margin:0;font:500 clamp(52px,6vw,92px)/.92 var(--display)}.philosophy p{max-width:560px;font-size:20px}.service-index{padding:120px 4vw}.service-index header{display:flex;align-items:end;justify-content:space-between;margin-bottom:50px}.service-index h2{max-width:760px;margin:10px 0 0;font:500 clamp(46px,5vw,76px)/.96 var(--display)}.service-row{display:grid;grid-template-columns:1fr 1.6fr auto;gap:30px;padding:26px 0;border-top:1px solid #17312d55;text-decoration:none}.service-row strong{font:500 27px var(--display)}.service-row span{opacity:.7}.consult{display:grid;grid-template-columns:1fr 1fr;gap:8vw;padding:110px 4vw;background:var(--sage)}.consult h2{margin:8px 0 20px;font:500 clamp(48px,5vw,78px)/.94 var(--display)}.consult form{display:grid;gap:14px}.consult input,.consult textarea{width:100%;padding:15px;border:0;border-bottom:1px solid var(--ink);background:transparent}.consult textarea{min-height:90px}.consult button{border:0;background:var(--ink);color:white}.footer{background:var(--ink);color:white}@media(max-width:760px){.nav{grid-template-columns:1fr auto}.nav nav{display:none}.hero,.philosophy,.consult{grid-template-columns:1fr}.hero{padding:50px 18px}.hero-copy{order:1}.hero h1{font-size:60px}.portrait{min-height:420px}.philosophy,.service-index,.consult{padding:76px 18px}.service-row{grid-template-columns:1fr auto}.service-row span{grid-column:1/-1}.service-index header{display:block}}
`;
  const content = `${nav("Aster House", "Plan a consultation")}<main id="main"><section class="hero"><div class="hero-copy"><span class="label">Thoughtful home support in North Harbor</span><h1>Care starts with how life feels at home.</h1><p>Personal support shaped around familiar routines, family priorities, and one clear next step.</p><div class="hero-actions"><a class="button" href="#contact">Plan a conversation</a><a class="link" href="#services">Explore support</a></div></div><div class="portrait" role="img" aria-label="Abstract portrait placeholder"></div></section><section class="philosophy" id="approach"><span class="label">Our starting point</span><div><h2>Listen first. Plan with care.</h2><p>The first call is a chance to understand the day as it is now. We talk through routines, concerns, and where practical support may help.</p></div></section><section class="service-index" id="services"><header><div><span class="label">Ways we support</span><h2>Choose the conversation that fits today.</h2></div><p>Each service begins with a family conversation.</p></header>${[
    ["Daily living support", "Help with familiar routines and everyday tasks."],
    ["Family respite", "Planned space for family caregivers to rest."],
    ["Companion visits", "Connection, conversation, and shared activities."],
  ]
    .map(
      ([a, b]) =>
        `<a class="service-row" href="#contact"><strong>${a}</strong><span>${b}</span><b>Explore ↗</b></a>`,
    )
    .join(
      "",
    )}</section><section class="consult" id="contact"><div><span class="label">A gentle first step</span><h2>Tell us what would make home feel steadier.</h2><p>No pressure and no assumptions. Share only what is useful for the first conversation.</p></div><form><input aria-label="Name" placeholder="Your name"><input aria-label="Email" placeholder="Email address"><textarea aria-label="Message" placeholder="What would you like help with?"></textarea><button class="button" type="button">Request a conversation</button></form></section></main>${footer("Aster House")}`;
  return shell("Quiet Practice", css, content);
}

function rapidResponse() {
  const css = String.raw`
:root{--paper:#efece4;--ink:#0b2023;--signal:#ff5a35;--yellow:#f4d64e;--body:Arial,sans-serif}.nav{display:grid;grid-template-columns:1fr auto auto;gap:34px;align-items:center;padding:18px 3vw;background:var(--paper);border-top:7px solid var(--signal)}.brand{font-weight:950;text-decoration:none;text-transform:uppercase}.nav nav{display:flex;gap:24px}.nav a{font-size:12px;text-decoration:none}.nav-cta{padding:12px 17px;background:var(--ink);color:white}.hero{position:relative;display:grid;grid-template-columns:1fr .85fr;min-height:680px;background:var(--ink);color:white}.hero-copy{padding:90px 5vw}.hero h1{max-width:780px;margin:18px 0 24px;font:950 clamp(60px,7vw,110px)/.86 Arial,sans-serif;letter-spacing:-.065em;text-transform:uppercase}.hero p{max-width:550px;color:#d4dddd;font-size:18px}.hero .button{background:var(--signal);color:white}.hero .link{color:white}.hero-actions{display:flex;gap:22px;align-items:center;margin-top:32px}.site-art{position:relative;overflow:hidden;background:repeating-linear-gradient(125deg,#132f33 0 36px,#0b2023 36px 72px)}.site-art:after{content:"";position:absolute;inset:12% -20% -20% 18%;border:30px solid var(--yellow);transform:rotate(-13deg)}.dispatch{display:grid;grid-template-columns:repeat(3,1fr);background:var(--signal);color:white}.dispatch div{padding:24px 4vw;border-right:1px solid #ffffff55}.dispatch strong{display:block;font-size:18px}.services{display:grid;grid-template-columns:.78fr 1.22fr;min-height:720px}.service-photo{background:linear-gradient(160deg,#b9c8c5,var(--ink));display:grid;place-items:center}.service-photo span{width:58%;aspect-ratio:1;border:24px solid var(--yellow);border-radius:50%}.ledger{padding:80px 4vw}.ledger h2{margin:10px 0 35px;font-size:clamp(42px,5vw,70px);line-height:.92;letter-spacing:-.055em}.service-row{display:grid;grid-template-columns:1fr auto;gap:20px;padding:25px 0;border-top:2px solid var(--ink);text-decoration:none}.service-row strong{font-size:23px}.service-row p{grid-column:1/-1;margin:0;max-width:550px}.service-row:hover{padding-left:15px;background:#f4d64e55}.quote{display:grid;grid-template-columns:1fr 1.1fr;gap:6vw;padding:90px 5vw;background:var(--yellow)}.quote h2{margin:8px 0 15px;font-size:clamp(45px,5vw,76px);line-height:.9}.quote form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.quote input,.quote textarea{padding:15px;border:2px solid var(--ink);background:#fff}.quote textarea{grid-column:1/-1;min-height:100px}.quote button{grid-column:1/-1;border:0;background:var(--ink);color:white}.footer{background:var(--ink);color:white}@media(max-width:760px){.nav{grid-template-columns:1fr auto}.nav nav{display:none}.hero,.services,.quote{grid-template-columns:1fr}.hero-copy{padding:60px 18px}.hero h1{font-size:58px}.site-art{min-height:280px}.dispatch{grid-template-columns:1fr}.dispatch div{border-bottom:1px solid #ffffff55}.service-photo{min-height:340px}.ledger,.quote{padding:65px 18px}.quote form{grid-template-columns:1fr}.quote input,.quote textarea,.quote button{grid-column:1}.nav-cta{font-size:10px}}
`;
  const content = `${nav("Northline Service Co.", "Call (555) 014-2260")}<main id="main"><section class="hero"><div class="hero-copy"><span class="label">Plumbing help across Westfield</span><h1>Find the source. Fix the problem.</h1><p>Tell us what you see and where it is happening. We will help you identify the next practical step.</p><div class="hero-actions"><a class="button" href="#contact">Request service</a><a class="link" href="tel:+15550142260">Call now</a></div></div><div class="site-art" aria-hidden="true"></div></section><section class="dispatch" id="approach" aria-label="Service information"><div><span class="label">Start with</span><strong>The problem you can see</strong></div><div><span class="label">Coverage</span><strong>Westfield service area</strong></div><div><span class="label">Next step</span><strong>Clear scheduling follow-up</strong></div></section><section class="services" id="services"><div class="service-photo" aria-hidden="true"><span></span></div><div class="ledger"><span class="label">What needs attention?</span><h2>Choose the problem, not a package.</h2>${[
    ["Active leaks", "Visible water, dripping lines, or damaged pipework."],
    ["Slow or blocked drains", "Recurring clogs, backups, or slow fixtures."],
    ["Water heater trouble", "Inconsistent hot water or an aging system."],
    ["Planned plumbing work", "Fixtures, replacements, and property upgrades."],
  ]
    .map(
      ([a, b]) =>
        `<a class="service-row" href="#contact"><strong>${a}</strong><b>Get help ↗</b><p>${b}</p></a>`,
    )
    .join(
      "",
    )}</div></section><section class="quote" id="contact"><div><span class="label">Request service</span><h2>Show us what is happening.</h2><p>Share the address, the affected area, and whether water is actively flowing.</p></div><form><input aria-label="Name" placeholder="Name"><input aria-label="Phone" placeholder="Phone"><textarea aria-label="Problem" placeholder="Describe the problem"></textarea><button class="button" type="button">Send service request</button></form></section></main>${footer("Northline Service Co.")}`;
  return shell("Rapid Response", css, content);
}

function neighborhoodTable() {
  const css = String.raw`
:root{--paper:#fff7e8;--ink:#3c231b;--tomato:#db5938;--butter:#f4c861;--mint:#abc8ae;--body:Trebuchet MS,Arial,sans-serif;--display:Georgia,serif}.nav{display:flex;align-items:center;justify-content:space-between;padding:22px 3vw;background:var(--paper)}.brand{font:700 25px var(--display);text-decoration:none}.nav nav{display:flex;gap:25px}.nav a{font-size:12px;text-decoration:none}.nav-cta{padding:12px 18px;border:1px solid}.today{padding:10px;background:var(--tomato);color:white;text-align:center;font-weight:800}.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:22px;padding:26px 3vw 80px}.hero-copy{padding:80px 30px 30px}.hero h1{max-width:800px;margin:12px 0 20px;font:500 clamp(65px,8vw,124px)/.83 var(--display);letter-spacing:-.055em}.hero p{max-width:540px;font-size:19px}.hero-actions{display:flex;gap:20px;align-items:center;margin-top:28px}.hero .button{background:var(--ink);color:white}.collage{display:grid;grid-template-columns:1.2fr .8fr;grid-template-rows:1fr .72fr;gap:12px;min-height:650px}.collage div{display:grid;place-items:center;overflow:hidden}.bread{grid-row:1/3;background:radial-gradient(ellipse at 50% 65%,#a96736 0 22%,#e6a45f 23% 34%,var(--butter) 35%)}.bread:after{content:"fresh\A every morning";white-space:pre;text-align:center;font:700 20px var(--display)}.coffee{background:radial-gradient(circle,#3c231b 0 25%,#fff7e8 26% 38%,var(--mint) 39%)}.door{background:var(--tomato);color:white;font:700 22px var(--display);padding:20px;text-align:center}.menu{padding:100px 3vw}.menu-head{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:end;margin-bottom:55px}.menu h2{margin:10px 0 0;font:500 clamp(50px,6vw,88px)/.9 var(--display)}.menu-list{display:grid;grid-template-columns:1.2fr .8fr;border-top:2px solid}.menu-item{padding:28px 12px;border-bottom:1px solid}.menu-item:nth-child(4n+1),.menu-item:nth-child(4n+4){background:#abc8ae55}.menu-item h3{margin:0 0 8px;font:500 29px var(--display)}.visit{display:grid;grid-template-columns:1fr 1fr;background:var(--tomato);color:white}.visit-art{min-height:520px;background:repeating-radial-gradient(circle at 0 100%,var(--butter) 0 40px,var(--ink) 41px 75px,var(--mint) 76px 110px)}.visit-copy{padding:90px 7vw}.visit h2{margin:10px 0 22px;font:500 clamp(48px,6vw,82px)/.9 var(--display)}.visit .button{background:var(--paper);color:var(--ink)}.footer{background:var(--ink);color:white}@media(max-width:760px){.nav nav{display:none}.hero,.menu-head,.visit{grid-template-columns:1fr}.hero{padding-inline:15px}.hero-copy{padding:50px 4px 15px}.hero h1{font-size:60px}.collage{min-height:470px}.menu{padding:70px 18px}.menu-list{grid-template-columns:1fr}.visit-art{min-height:350px}.visit-copy{padding:65px 18px}.nav-cta{font-size:10px}}
`;
  const content = `${nav("Common Table", "Plan a visit")}<div class="today">Open today for bread, pastry, and coffee</div><main id="main"><section class="hero"><div class="hero-copy"><span class="label">Old Market bakery</span><h1>Good mornings are made here.</h1><p>Slow-fermented loaves, layered pastry, and a neighborhood table ready when the doors open.</p><div class="hero-actions"><a class="button" href="#services">See the counter</a><a class="link" href="#approach">Get directions</a></div></div><div class="collage" aria-label="Abstract bakery collage"><div class="bread"></div><div class="coffee"></div><div class="door">Meet at the long table.</div></div></section><section class="menu" id="services"><div class="menu-head"><div><span class="label">From the ovens</span><h2>A small menu with plenty to say.</h2></div><p>The counter changes with the season. Ask about availability before making a special trip.</p></div><div class="menu-list">${[
    ["Country sourdough", "A deeply caramelized crust and open crumb."],
    ["Seasonal pastry", "Butter, fruit, and whatever the week brings."],
    ["Espresso and filter coffee", "Prepared for the cup in front of us."],
    ["Celebration cakes", "Planned through a short flavor consultation."],
  ]
    .map(
      ([a, b]) =>
        `<article class="menu-item"><h3>${a}</h3><p>${b}</p><a class="link" href="#approach">Ask about today</a></article>`,
    )
    .join(
      "",
    )}</div></section><section class="visit" id="approach"><div class="visit-art" aria-hidden="true"></div><div class="visit-copy"><span class="label">Come by</span><h2>Find your place at the table.</h2><p>18 Market Lane<br>Open Tuesday to Sunday, 7 am to 3 pm</p><a class="button" href="#contact">Get directions</a></div></section><section id="contact" class="wrap" style="padding:80px 0"><span class="label">Special orders</span><h2 style="font:500 clamp(42px,5vw,72px)/.95 Georgia,serif">Planning something worth gathering for?</h2><a class="button" style="background:var(--ink);color:white" href="mailto:hello@example.com">Start an order</a></section></main>${footer("Common Table")}`;
  return shell("Neighborhood Table", css, content);
}

function kineticClub() {
  const css = String.raw`
:root{--paper:#080b0b;--ink:#f7f7ef;--acid:#b7ef2a;--steel:#aeb8b6;--body:Arial,sans-serif}.nav{position:absolute;z-index:2;top:44px;left:0;right:0;display:grid;grid-template-columns:1fr auto auto;gap:34px;align-items:center;padding:20px 3vw;color:white}.brand{font-size:20px;font-weight:950;text-decoration:none}.nav nav{display:flex;gap:25px}.nav a{font-size:12px;text-decoration:none}.nav-cta{padding:13px 18px;background:var(--acid);color:#080b0b}.hero{position:relative;display:grid;align-items:end;min-height:850px;padding:110px 3vw 55px;overflow:hidden;background:linear-gradient(110deg,#080b0b 0 34%,transparent 60%),radial-gradient(circle at 74% 45%,#81907d 0 12%,#2c3935 13% 25%,#080b0b 52%);color:white}.hero:after{content:"MOVE";position:absolute;right:-2vw;bottom:-7vw;color:#ffffff0d;font:950 31vw/.7 Arial,sans-serif;letter-spacing:-.09em}.hero-copy{position:relative;z-index:1;max-width:920px}.hero h1{margin:15px 0 22px;font:950 clamp(76px,10vw,158px)/.76 Arial,sans-serif;letter-spacing:-.08em;text-transform:uppercase}.hero p{max-width:560px;color:#d1d9d7;font-size:18px}.hero-actions{display:flex;gap:22px;align-items:center;margin-top:30px}.hero .button{background:var(--acid);color:#080b0b}.programs{color:white}.program-head{display:grid;grid-template-columns:1fr 1fr;padding:100px 3vw 55px}.program-head h2{max-width:720px;margin:8px 0 0;font-size:clamp(52px,7vw,104px);line-height:.82;letter-spacing:-.07em;text-transform:uppercase}.program-head p{align-self:end;max-width:430px;color:var(--steel)}.program{display:grid;grid-template-columns:.7fr 2fr 1fr auto;gap:25px;align-items:center;padding:34px 3vw;border-top:1px solid #ffffff33;text-decoration:none;transition:.2s}.program:hover{background:var(--acid);color:#080b0b}.program span{font-weight:900}.program strong{font-size:clamp(28px,4vw,58px);letter-spacing:-.05em;text-transform:uppercase}.program p{margin:0}.proof{display:grid;grid-template-columns:1.1fr .9fr;min-height:620px;background:var(--acid);color:#080b0b}.proof-art{display:grid;place-items:center;background:repeating-linear-gradient(55deg,#080b0b 0 25px,#26312d 25px 50px)}.proof-art span{width:42%;aspect-ratio:1;border:22px solid var(--acid);transform:rotate(45deg)}.proof-copy{padding:100px 6vw}.proof h2{margin:10px 0 20px;font-size:clamp(50px,6vw,86px);line-height:.85;text-transform:uppercase}.proof .button{background:#080b0b;color:white}.footer{background:#111;color:white}@media(max-width:760px){.nav{grid-template-columns:1fr auto}.nav nav{display:none}.hero{min-height:700px;padding-inline:18px}.hero h1{font-size:72px}.program-head,.proof{grid-template-columns:1fr}.program-head{padding:75px 18px 35px}.program{grid-template-columns:auto 1fr;padding:25px 18px}.program p{grid-column:2}.proof-art{min-height:350px}.proof-copy{padding:65px 18px}.nav-cta{font-size:10px}}
`;
  const content = `${nav("FORM / 84", "Book an assessment")}<main id="main"><section class="hero"><div class="hero-copy"><span class="label">Strength and recovery in South Park</span><h1>Build power that lasts.</h1><p>Coached training and focused recovery organized around a week you can repeat.</p><div class="hero-actions"><a class="button" href="#services">Choose your goal</a><a class="link" href="#contact">Tour the club</a></div></div></section><section class="programs" id="services"><header class="program-head"><div><span class="label">Train with intent</span><h2>Pick the result. We shape the work.</h2></div><p>Every program has a clear audience, session format, and next action.</p></header>${[
    ["01", "Get stronger", "Coached small-group strength", "Explore"],
    ["02", "Move better", "Mobility and movement coaching", "Explore"],
    ["03", "Recover well", "Sauna and cold-plunge sessions", "Explore"],
  ]
    .map(
      ([n, a, b, c]) =>
        `<a class="program" href="#contact"><span>${n}</span><strong>${a}</strong><p>${b}</p><b>${c} ↗</b></a>`,
    )
    .join(
      "",
    )}</section><section class="proof" id="approach"><div class="proof-art"><span></span></div><div class="proof-copy"><span class="label">How the club works</span><h2>Coach. Track. Recover. Repeat.</h2><p>Start with an assessment, choose a realistic weekly rhythm, and build from there.</p><a class="button" href="#contact">See the first session</a></div></section><section id="contact" class="wrap" style="padding:100px 0;color:white"><span class="label">Your first move</span><h2 style="max-width:900px;font:950 clamp(52px,7vw,100px)/.82 Arial,sans-serif;letter-spacing:-.07em;text-transform:uppercase">Walk in with a goal. Leave with a plan.</h2><a class="button" style="background:var(--acid);color:#080b0b" href="mailto:hello@example.com">Book an assessment</a></section></main>${footer("FORM / 84")}`;
  return shell("Kinetic Club", css, content);
}

function clearCounsel() {
  const css = String.raw`
:root{--paper:#f5f3ee;--ink:#182223;--blue:#dce6e8;--rust:#8b452f;--body:Arial,sans-serif;--display:Georgia,serif}.nav{display:grid;grid-template-columns:1fr auto auto;gap:36px;align-items:center;padding:28px 5vw;border-bottom:1px solid #18222344}.brand{font:600 22px var(--display);text-decoration:none}.nav nav{display:flex;gap:26px}.nav a{font-size:12px;text-decoration:none}.nav-cta{padding-bottom:5px;border-bottom:1px solid}.hero{display:grid;grid-template-columns:260px 1fr;min-height:660px}.hero-side{padding:70px 5vw;border-right:1px solid #18222344}.hero-side p{font-size:12px}.hero-main{display:grid;grid-template-columns:1.2fr .8fr;gap:7vw;padding:90px 5vw}.hero h1{max-width:820px;margin:16px 0 25px;font:500 clamp(58px,7vw,105px)/.9 var(--display);letter-spacing:-.05em}.hero-copy p{max-width:560px;font-size:18px}.hero .button{margin-top:20px;background:var(--ink);color:white}.portrait{align-self:stretch;background:linear-gradient(155deg,var(--blue),#93a5a7);position:relative}.portrait:before{content:"";position:absolute;width:62%;height:70%;left:19%;bottom:0;background:var(--ink);border-radius:50% 50% 0 0}.portrait:after{content:"";position:absolute;width:26%;aspect-ratio:1;left:37%;top:18%;background:#c69374;border-radius:50%}.expertise{padding:100px 5vw;background:white}.expertise-head{display:grid;grid-template-columns:.8fr 1.2fr;margin-bottom:45px}.expertise h2{max-width:760px;margin:8px 0;font:500 clamp(46px,5vw,75px)/.95 var(--display)}.matter{display:grid;grid-template-columns:1fr 1.5fr auto;gap:30px;padding:25px 0;border-top:1px solid #18222366;text-decoration:none}.matter strong{font:500 25px var(--display)}.matter p{margin:0}.process{display:grid;grid-template-columns:1fr 1fr}.process-copy{padding:110px 6vw;background:var(--blue)}.process h2{margin:10px 0 20px;font:500 clamp(48px,5vw,76px)/.94 var(--display)}.process-list{padding:85px 6vw;background:var(--ink);color:white}.process-list div{padding:25px 0;border-top:1px solid #ffffff55}.process-list strong{display:block;font:500 24px var(--display)}.contact{display:grid;grid-template-columns:1fr 1fr;gap:8vw;padding:100px 5vw}.contact h2{margin:8px 0 20px;font:500 clamp(45px,5vw,72px)/.95 var(--display)}.contact form{display:grid;gap:12px}.contact input,.contact textarea{padding:15px;border:1px solid;background:transparent}.contact textarea{min-height:100px}.contact button{border:0;background:var(--rust);color:white}.footer{background:var(--ink);color:white}@media(max-width:800px){.nav{grid-template-columns:1fr auto}.nav nav{display:none}.hero{grid-template-columns:1fr}.hero-side{padding:30px 18px;border-right:0;border-bottom:1px solid}.hero-main,.expertise-head,.process,.contact{grid-template-columns:1fr}.hero-main{padding:60px 18px}.hero h1{font-size:58px}.portrait{min-height:380px}.expertise{padding:75px 18px}.matter{grid-template-columns:1fr auto}.matter p{grid-column:1/-1}.process-copy,.process-list{padding:70px 18px}.contact{padding:75px 18px}.nav-cta{font-size:10px}}
`;
  const content = `${nav("Morrow Advisory", "Discuss your matter")}<main id="main"><section class="hero"><aside class="hero-side"><span class="label">Independent counsel</span><p>For owners, families, and organizations navigating consequential decisions.</p></aside><div class="hero-main"><div class="hero-copy"><span class="label">Clear advice for complex moments</span><h1>Know where you stand. Decide what comes next.</h1><p>Focused legal guidance that turns a complicated matter into a practical path forward.</p><a class="button" href="#contact">Discuss your matter</a></div><div class="portrait" role="img" aria-label="Abstract professional portrait placeholder"></div></div></section><section class="expertise" id="services"><div class="expertise-head"><span class="label">Areas of focus</span><div><h2>Start with the decision in front of you.</h2><p>Each conversation is scoped around the matter, the people involved, and the next useful action.</p></div></div>${[
    ["Business transitions", "Ownership, structure, and planned change."],
    ["Property matters", "Agreements, disputes, and practical resolution."],
    ["Private client advice", "Family, legacy, and long-term planning."],
  ]
    .map(
      ([a, b]) =>
        `<a class="matter" href="#contact"><strong>${a}</strong><p>${b}</p><b>View focus ↗</b></a>`,
    )
    .join(
      "",
    )}</section><section class="process" id="approach"><div class="process-copy"><span class="label">Working together</span><h2>A measured process, clearly explained.</h2><p>You will know what information matters, what choices are available, and who is responsible for the next step.</p></div><div class="process-list"><div><span class="label">First</span><strong>Define the matter</strong><p>Share the situation and the decision that needs attention.</p></div><div><span class="label">Then</span><strong>Understand the options</strong><p>Review scope, constraints, and a practical course of action.</p></div><div><span class="label">Next</span><strong>Move with clarity</strong><p>Proceed with responsibilities and expectations made explicit.</p></div></div></section><section class="contact" id="contact"><div><span class="label">Confidential inquiry</span><h2>Begin with a focused conversation.</h2><p>Provide a concise overview. Do not include sensitive or time-critical information in this demonstration form.</p></div><form><input aria-label="Name" placeholder="Name"><input aria-label="Email" placeholder="Email"><textarea aria-label="Matter overview" placeholder="Brief matter overview"></textarea><button class="button" type="button">Request a conversation</button></form></section></main>${footer("Morrow Advisory")}`;
  return shell("Clear Counsel", css, content);
}

const pages = new Map([
  ["quiet-practice", quietPractice()],
  ["rapid-response", rapidResponse()],
  ["neighborhood-table", neighborhoodTable()],
  ["kinetic-club", kineticClub()],
  ["clear-counsel", clearCounsel()],
]);

const indexCards = concepts
  .map(
    (concept) =>
      `<a class="card card-${concept.slug}" href="./${concept.slug}.html"><span>${concept.number} · ${concept.kind}</span><h2>${concept.name}</h2><p>${concept.note}</p><b>Open full homepage ↗</b></a>`,
  )
  .join("");
const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>LaunchLoom A1 design directions</title><style>*{box-sizing:border-box}body{margin:0;background:#111;color:white;font-family:Arial,sans-serif}.shell{width:min(1380px,calc(100% - 36px));margin:auto;padding:70px 0}.intro{max-width:980px;margin-bottom:65px}.intro span,.card span{font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.intro span{color:#c9ff3d}.intro h1{margin:15px 0 24px;font:500 clamp(58px,8vw,116px)/.86 Georgia,serif;letter-spacing:-.07em}.intro p{max-width:760px;color:#bbb;font-size:18px;line-height:1.55}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.card{display:flex;flex-direction:column;min-height:440px;padding:34px;color:#111;text-decoration:none;transition:transform .2s}.card:hover{transform:translateY(-5px)}.card h2{margin:80px 0 15px;font-size:clamp(45px,5vw,78px);line-height:.88;letter-spacing:-.06em}.card p{max-width:500px;font-size:17px;line-height:1.5}.card b{margin-top:auto}.card-quiet-practice{background:#cbd8ca;font-family:Georgia,serif}.card-rapid-response{background:#ff5a35;text-transform:uppercase;font-weight:800}.card-neighborhood-table{background:#f4c861;font-family:Georgia,serif}.card-kinetic-club{background:#b7ef2a;text-transform:uppercase;font-weight:950}.card-clear-counsel{background:#dce6e8}.note{margin-top:30px;color:#888;font-size:12px}@media(max-width:720px){.shell{padding-top:40px}.grid{grid-template-columns:1fr}.card{min-height:350px}.card h2{margin-top:55px}}</style></head><body><main class="shell"><header class="intro"><span>Five A1-informed original concepts</span><h1>Different businesses deserve different visual logic.</h1><p>Each concept uses a separate composition, service presentation, proof rhythm, type character, and conversion path. These are fictional design explorations, not production client sites.</p></header><section class="grid">${indexCards}</section><p class="note">References informed principles only. No source site, brand asset, copy, or trade dress was reproduced.</p></main></body></html>`;

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, "screenshots"), { recursive: true });
await fs.writeFile(path.join(output, "index.html"), index);
for (const [slug, html] of pages)
  await fs.writeFile(path.join(output, `${slug}.html`), html);

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const concept of concepts) {
  const url = pathToFileURL(path.join(output, `${concept.slug}.html`)).href;
  await desktop.goto(url);
  await desktop.screenshot({
    path: path.join(output, "screenshots", `${concept.slug}-desktop.png`),
    fullPage: true,
  });
  await mobile.goto(url);
  await mobile.screenshot({
    path: path.join(output, "screenshots", `${concept.slug}-mobile.png`),
    fullPage: true,
  });
}
await browser.close();
console.log(
  `a1_showcase=${path.join(output, "index.html")} sites=${concepts.length} screenshots=${concepts.length * 2}`,
);
