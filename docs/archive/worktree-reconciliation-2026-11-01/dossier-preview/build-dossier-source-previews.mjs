#!/usr/bin/env node
// Local review of retained originals, deliberately bypassing client generation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'artifacts/dossier-source-previews');
const ids = [
  'html5up-dental-dimension',
  'colorlib-caseworth-legal-ledger',
  'spicer-law-firm-results-ledger',
  'html5up-home-care-story',
  'colorlib-tavola-restaurant',
  'spicer-plumber-dispatch-console',
];
const records = [];
fs.mkdirSync(output, { recursive: true });
for (const id of ids) {
  const dossier = path.join(root, 'data/reference-library/dossiers', id);
  const template = path.join(dossier, 'template');
  const extraction = JSON.parse(fs.readFileSync(path.join(template, 'extraction.json')));
  const manifest = JSON.parse(fs.readFileSync(path.join(dossier, 'manifest.json')));
  if (extraction.status !== 'extracted') throw new Error(`${id}: source unavailable`);
  for (const file of extraction.files) {
    const bytes = fs.readFileSync(path.join(template, file.path));
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== file.sha256 || bytes.length !== file.bytes) throw new Error(`${id}: ${file.path} integrity mismatch`);
  }
  const destination = path.join(output, id);
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(path.join(template, 'source'), path.join(destination, 'source'), { recursive: true });
  fs.cpSync(path.join(dossier, 'screenshots'), path.join(destination, 'evidence'), { recursive: true });
  fs.copyFileSync(path.join(dossier, 'manifest.json'), path.join(destination, 'manifest.json'));
  fs.copyFileSync(path.join(template, 'extraction.json'), path.join(destination, 'extraction.json'));
  records.push({ id, name: manifest.referenceName, method: extraction.method, source: extraction.source, fileCount: extraction.files.length, entrypoint: extraction.entrypoint });
}
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify({ builtAt: new Date().toISOString(), sourceUnmodified: true, records }, null, 2));
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Extracted source dossier review</title><style>body{font:17px/1.6 system-ui;max-width:1100px;margin:50px auto;padding:0 24px;background:#f4f1eb;color:#17212b}h1{font-size:42px}article{border-top:1px solid #aaa;padding:24px 0}a{color:#164f83;margin-right:22px}small{display:block}code{font-size:14px;overflow-wrap:anywhere}</style><h1>Extracted source dossier review</h1><p>${records.length} retained original source bundles, served locally without client generation or pack adaptation. Source branding is reference material only. Forms must not be submitted.</p><p>Compare the rendered source with retained dossier evidence. Screenshots may describe an adaptation rather than the original source; differences are not hidden.</p>${records.map(r => `<article><h2>${r.name}</h2><p><a href="${r.id}/${r.entrypoint}">Open original source</a><a href="${r.id}/evidence/desktop.png">Dossier desktop</a><a href="${r.id}/evidence/mobile.png">Dossier mobile</a></p><small>${r.fileCount} hash-verified files · ${r.method}</small><code>${r.id}</code></article>`).join('')}</html>`);
console.log(`Built ${records.length} unmodified source previews at ${output}`);
