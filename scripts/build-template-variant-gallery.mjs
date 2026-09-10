import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listDesignVariants } from "../templates/client-site/src/lib/design-variants.ts";

const outputFlag = process.argv.indexOf("--out");
const output = path.resolve(
  (outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined) ||
    path.join(os.tmpdir(), "launchloom-template-variants"),
);

const fixtureByRecipe = {
  "care-editorial": {
    eyebrow: "Fictional care fixture",
    name: "Harbor Family Care",
    headline: "Support that starts by listening",
    services: ["Daily support", "Family guidance", "Care planning"],
    colors: ["#315f55", "#e8efe9", "#f8f4ed"],
  },
  "local-trades": {
    eyebrow: "Fictional trades fixture",
    name: "Northline Home Service",
    headline: "Fix the problem. Know the next step.",
    services: ["Repair", "Installation", "Maintenance"],
    colors: ["#125d78", "#e8f0f2", "#fff8ed"],
  },
  "general-editorial": {
    eyebrow: "Fictional local fixture",
    name: "Common Table Bakery",
    headline: "Made slowly. Shared warmly.",
    services: ["Daily bread", "Pastry", "Celebration cakes"],
    colors: ["#a3482c", "#f5e8da", "#fbf6ed"],
  },
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function renderVariant(variant) {
  const fixture = fixtureByRecipe[variant.recipe];
  const sectionOrder = variant.sections.map((section) => section.type);
  return `<article class="variant variant--${escapeHtml(variant.composition)} type--${escapeHtml(variant.typography)}" style="--accent:${fixture.colors[0]};--wash:${fixture.colors[1]};--paper:${fixture.colors[2]}">
    <header class="variant__meta">
      <div><span>${escapeHtml(variant.id)}</span><h2>${escapeHtml(variant.name)}</h2></div>
      <p>${escapeHtml(variant.intent)}</p>
    </header>
    <div class="page-preview">
      <nav><strong>${escapeHtml(fixture.name)}</strong><i>Services &nbsp; About &nbsp; Contact</i></nav>
      <section class="mini-hero">
        <div class="mini-copy"><small>${escapeHtml(fixture.eyebrow)}</small><h3>${escapeHtml(fixture.headline)}</h3><p>Clear local information and a useful next step.</p><b>Start here</b></div>
        <div class="mini-image" aria-label="Abstract fixture image"></div>
      </section>
      <section class="mini-services">${fixture.services.map((service) => `<div><strong>${escapeHtml(service)}</strong><span>Useful details</span></div>`).join("")}</section>
      <footer>${sectionOrder.map((section) => `<span>${escapeHtml(section)}</span>`).join("")}</footer>
    </div>
    <dl><div><dt>Composition</dt><dd>${escapeHtml(variant.composition)}</dd></div><div><dt>Typography</dt><dd>${escapeHtml(variant.typography)}</dd></div><div><dt>Density</dt><dd>${escapeHtml(variant.density)}</dd></div></dl>
  </article>`;
}

const groups = ["care-editorial", "local-trades", "general-editorial"]
  .map((recipe) => {
    const variants = listDesignVariants(recipe);
    return `<section class="family"><header><span>9 variants</span><h1>${escapeHtml(recipe)}</h1></header><div class="gallery">${variants.map(renderVariant).join("")}</div></section>`;
  })
  .join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LaunchLoom template variants</title><style>
*{box-sizing:border-box}body{margin:0;background:#111;color:#f6f3eb;font-family:Inter,Arial,sans-serif}.shell{width:min(1600px,calc(100% - 40px));margin:auto;padding:64px 0 100px}.intro{max-width:850px;margin-bottom:80px}.intro span,.family>header span{color:#b7ff42;text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:800}.intro h1{font:500 clamp(48px,7vw,100px)/.92 Georgia,serif;letter-spacing:-.065em;margin:16px 0}.intro p{color:#bdbdb7;font-size:18px;line-height:1.6}.family{margin-top:90px}.family>header{display:flex;align-items:end;justify-content:space-between;border-bottom:1px solid #45453f;padding-bottom:18px}.family>header h1{margin:0;font-size:30px}.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:36px 22px;margin-top:28px}.variant{min-width:0}.variant__meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;min-height:115px}.variant__meta span{font:700 10px/1 monospace;color:#b7ff42}.variant__meta h2{font-size:20px;margin:7px 0}.variant__meta p{font-size:12px;line-height:1.5;color:#aaa;margin:0}.page-preview{overflow:hidden;min-height:430px;background:var(--paper);color:#101512;border-radius:2px}.page-preview nav{display:flex;justify-content:space-between;padding:15px 17px;background:#fff;font-size:10px}.page-preview nav i{font-style:normal;color:#555}.mini-hero{display:grid;grid-template-columns:1fr 1fr;gap:15px;padding:24px 18px;background:var(--wash);min-height:245px}.mini-copy{align-self:center}.mini-copy small{font-size:7px;text-transform:uppercase;letter-spacing:.14em;color:var(--accent)}.mini-copy h3{font:500 28px/.95 Georgia,serif;letter-spacing:-.05em;margin:11px 0}.mini-copy p{font-size:9px;line-height:1.5;color:#59605d}.mini-copy b{display:inline-block;padding:8px 10px;background:var(--accent);color:#fff;font-size:8px}.mini-image{min-height:190px;background:linear-gradient(145deg,var(--accent),#151c19);border-radius:50% 2px 2px}.mini-services{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#bbb;padding-top:1px}.mini-services div{display:flex;flex-direction:column;gap:22px;min-height:96px;padding:13px;background:#fff}.mini-services strong{font-size:10px}.mini-services span{font-size:8px;color:#777}.page-preview footer{display:flex;gap:5px;overflow:hidden;padding:11px 14px;background:var(--accent);color:#fff}.page-preview footer span{font-size:6px;white-space:nowrap;opacity:.85}.variant dl{display:flex;gap:16px;margin:13px 0}.variant dl div{display:flex;gap:5px}.variant dt{color:#777;font-size:9px}.variant dd{margin:0;font-size:9px}.variant--centered .mini-hero{display:block;text-align:center}.variant--centered .mini-copy{max-width:260px;margin:auto}.variant--centered .mini-image{height:70px;min-height:0;margin-top:15px;border-radius:0}.variant--full-bleed .mini-hero{position:relative;color:#fff;background:linear-gradient(100deg,#111 0 55%,var(--accent))}.variant--full-bleed .mini-copy{position:relative;z-index:1}.variant--full-bleed .mini-copy p{color:#ddd}.variant--full-bleed .mini-image{position:absolute;inset:0 0 0 54%;opacity:.55;border-radius:0}.variant--magazine .mini-copy h3{font-size:34px}.variant--framed .mini-hero{margin:12px;border:1px solid var(--accent)}.variant--stacked .mini-hero{grid-template-columns:1fr}.variant--stacked .mini-image{min-height:85px;border-radius:0}.variant--sidebar .mini-hero{grid-template-columns:.7fr 1.3fr}.variant--sidebar .mini-services{grid-template-columns:1fr}.variant--sidebar .mini-services div{min-height:45px;flex-direction:row;justify-content:space-between}.variant--mosaic .mini-image{clip-path:polygon(0 0,100% 0,100% 74%,72% 74%,72% 100%,0 100%)}.variant--asymmetric .mini-hero{grid-template-columns:1.25fr .75fr}.type--strong h3,.type--industrial h3,.type--condensed h3{font-family:Impact,"Arial Narrow",sans-serif}.type--geometric h3,.type--soft-sans h3,.type--humanist h3{font-family:"Trebuchet MS",Arial,sans-serif}.type--heritage h3,.type--refined-serif h3,.type--modern-serif h3{font-family:Garamond,Georgia,serif;font-weight:500}@media(max-width:1050px){.gallery{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.shell{width:min(100% - 24px,1600px);padding-top:40px}.gallery{grid-template-columns:1fr}.family>header{display:block}.variant__meta{min-height:0;margin-bottom:14px}}
</style></head><body><main class="shell"><header class="intro"><span>LaunchLoom design system</span><h1>27 directions, one controlled pipeline.</h1><p>Each preview uses fictional content. The gallery compares composition, typography, density, section order, and section treatment without inventing proof or client facts.</p></header>${groups}</main></body></html>`;

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, "index.html"), html);
console.log(
  `template_variant_gallery=${path.join(output, "index.html")} variants=${listDesignVariants().length}`,
);
