/**
 * Cloudflare Access protected operations dashboard rendered by the Worker.
 *
 * The Generations tab reads the authenticated admin API and shows one card per
 * tracked client generation: hero preview, review state, site links, per-stage
 * provider costs, and an expandable event timeline. The Invitations tab keeps
 * the existing private invite management surface.
 */
export function renderAdminDashboardHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>LaunchLoom operations</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f2ea;color:#10251f;font:16px/1.5 system-ui,sans-serif}.shell{width:min(1180px,calc(100% - 36px));margin:40px auto 80px}.card{padding:clamp(22px,4vw,44px);border:1px solid #d9ddd1;border-radius:24px;background:#fffefa;box-shadow:0 20px 70px #10251f1f}.eyebrow{color:#40695b;font-size:.7rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}h1{margin:14px 0 10px;font-size:clamp(2rem,4.5vw,3.2rem);letter-spacing:-.055em;line-height:1.02}h2{margin:26px 0 8px;font-size:1.2rem;letter-spacing:-.02em}p{color:#587069;line-height:1.65}.muted{color:#587069}.tabs{display:flex;gap:6px;margin:30px 0 4px;border-bottom:1px solid #d9ddd1;flex-wrap:wrap}.tab{border:0;background:transparent;padding:11px 14px;font:inherit;font-weight:750;color:#587069;cursor:pointer;border-bottom:2px solid transparent}.tab.is-active{color:#10251f;border-bottom-color:#10251f}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:20px 0}.kpi{padding:14px 16px;border:1px solid #d9ddd1;border-radius:14px;background:#f4f2ea}.kpi strong{display:block;font-size:1.4rem;letter-spacing:-.035em}.kpi small{color:#587069}.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:6px 0 16px}.toolbar label{display:grid;gap:5px;font-size:.68rem;font-weight:800;color:#587069;text-transform:uppercase;letter-spacing:.1em}.toolbar input,.toolbar select{padding:11px;border:1px solid #d9ddd1;border-radius:11px;font:inherit;min-width:230px;background:#fff}.button{display:inline-flex;align-items:center;justify-content:center;padding:13px 19px;border:0;border-radius:999px;background:#10251f;color:#fffef9;font:inherit;font-weight:750;cursor:pointer;text-decoration:none}.button.small{padding:11px 16px}.secondary{background:#d9f06b;color:#10251f}.text-button{border:0;background:transparent;color:#356c5b;font:inherit;font-weight:700;cursor:pointer;padding:6px 0}.status{min-height:1.5em}.generations{display:grid;gap:16px}.gen{display:grid;grid-template-columns:290px minmax(0,1fr);gap:20px;padding:18px;border:1px solid #d9ddd1;border-radius:18px;background:#fffefa}.gen-hero{aspect-ratio:16/10;border-radius:13px;overflow:hidden;background:#e6ece7;display:flex;align-items:center;justify-content:center;color:#587069;font-size:.78rem;text-align:center;padding:10px}.gen-hero img{width:100%;height:100%;object-fit:cover;display:block}.gen-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.gen-head strong{font-size:1.12rem;letter-spacing:-.02em}.gen-meta{display:block;color:#587069;margin-top:3px;font-size:.82rem}.links{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.links a{color:#205d51;font-weight:700;text-decoration:underline;text-decoration-color:#9cbdb3;text-underline-offset:3px;font-size:.9rem}.chips{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:#eef3ee;border:1px solid #d9ddd1;color:#31443e;font-size:.76rem;font-weight:650}.chip.estimated{background:#fdf5e6;border-color:#ecd9b6}.chip.total{background:#10251f;border-color:#10251f;color:#fffef9}.pill{display:inline-flex;align-items:center;padding:5px 11px;border-radius:999px;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}.pill.ok{background:#e2f3e8;color:#1c5c34}.pill.live{background:#e1f0f4;color:#155166}.pill.warn{background:#fdf1df;color:#8a5514}.pill.bad{background:#fae3e0;color:#8c2f22}.pill.rev{background:#ece7f8;color:#4d3a86}.pill.neutral{background:#eceeea;color:#4b5b55}.hero-note{font-size:.78rem;color:#587069}.timeline{margin-top:12px;border-top:1px solid #e2e6df;padding-top:12px;display:grid;gap:10px}.event{display:grid;gap:2px}.event-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.event small{color:#587069}.event-note{margin:2px 0 0;font-size:.85rem}.empty{padding:26px;border:1px dashed #c9d2c9;border-radius:16px;color:#587069;text-align:center}.row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #d9ddd1}.row small{display:block;color:#587069}.field{display:grid;gap:7px;margin:20px 0}.field input{width:100%;padding:12px;border:1px solid #d9ddd1;border-radius:12px;font:inherit}.linkrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.linkrow input{min-width:0;padding:12px;border:1px solid #d9ddd1;border-radius:12px;font:inherit}.divider{border-top:1px solid #d9ddd1;margin:36px 0}button:disabled{opacity:.6;cursor:wait}[hidden]{display:none!important}.clickable{background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;text-align:left;cursor:pointer}.gen-open{display:block}.gen-open:hover strong,.gen-open:focus-visible strong{text-decoration:underline;text-decoration-color:#9cbdb3;text-underline-offset:3px}.link-button{background:none;border:0;padding:0;font:inherit;font-weight:inherit;color:#10251f;text-align:left;cursor:pointer}.link-button:hover{text-decoration:underline;text-decoration-color:#9cbdb3;text-underline-offset:3px}.drawer-backdrop{position:fixed;inset:0;background:#10251f33;z-index:30}.drawer{position:fixed;top:0;right:0;bottom:0;width:min(620px,100%);z-index:40;background:#fffefa;border-left:1px solid #d9ddd1;box-shadow:-24px 0 70px #10251f2e;overflow-y:auto;padding:26px}.drawer-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}.drawer-close{border:0;background:transparent;color:#587069;font-size:1.7rem;line-height:1;cursor:pointer;padding:2px 8px;border-radius:10px}.drawer-close:hover{background:#f0f2ea}.drawer-body{display:grid;gap:14px}.drawer-hero{aspect-ratio:16/10;border-radius:14px;overflow:hidden;background:#e6ece7;display:flex;align-items:center;justify-content:center;color:#587069;font-size:.8rem;text-align:center;padding:10px}.drawer-hero img{width:100%;height:100%;object-fit:cover;display:block}.drawer-links a{color:#205d51;font-weight:700;text-decoration:underline;text-decoration-color:#9cbdb3;text-underline-offset:3px;font-size:.9rem;margin-right:14px}.facts{display:grid;grid-template-columns:150px minmax(0,1fr);gap:4px 12px;font-size:.86rem}.facts dt{color:#587069;font-weight:700}.facts dd{margin:0;word-break:break-word}.cost-table{width:100%;border-collapse:collapse;font-size:.86rem}.cost-table th,.cost-table td{text-align:left;padding:7px 6px;border-bottom:1px solid #e2e6df;vertical-align:top}.cost-table th{color:#587069;font-size:.66rem;text-transform:uppercase;letter-spacing:.09em}.cost-table td.amount{text-align:right;white-space:nowrap}.cost-table tr.total td{border-bottom:0;font-weight:800}.drawer .timeline{border-top:0;padding-top:0}@media(max-width:760px){.gen{grid-template-columns:1fr}.linkrow{grid-template-columns:1fr}.row{align-items:flex-start}.drawer{width:100%;padding:18px}.facts{grid-template-columns:110px minmax(0,1fr)}}
</style></head><body><main class="shell"><section class="card">
<header class="masthead"><span class="eyebrow">LaunchLoom operations</span><h1>Invites and client generations</h1><p>Invite business owners, then track every generated client site: review state, site links, hero preview, and measured provider cost per stage. Costs reported by the provider are marked actual; configured estimates are marked estimated. Select a client to open their details.</p></header>
<nav class="tabs" role="tablist">
<button class="tab is-active" id="tab-invites" role="tab" aria-selected="true" aria-controls="panel-invites" type="button">Invitations</button>
<button class="tab" id="tab-generations" role="tab" aria-selected="false" aria-controls="panel-generations" type="button">Generations</button>
</nav>
<section id="panel-generations" role="tabpanel" aria-labelledby="tab-generations" hidden>
<div class="kpis" id="kpis" aria-live="polite"></div>
<div class="toolbar">
<label>Search<input id="generation-search" type="search" placeholder="Business, email, project, issue"></label>
<label>Status<select id="generation-status-filter"><option value="">All statuses</option><option value="generating">Generating</option><option value="preview_ready">Preview ready</option><option value="attention">Needs attention</option><option value="published">Published</option><option value="revision">Revision</option><option value="failed">Failed</option></select></label>
<button class="button small" id="generations-refresh" type="button">Refresh</button>
</div>
<p id="generations-status" class="status" role="status" aria-live="polite">Loading generations…</p>
<div id="generations" class="generations"></div>
</section>
<section id="panel-invites" role="tabpanel" aria-labelledby="tab-invites">
<span class="eyebrow">Private invite management</span>
<h2>Invite a business owner.</h2>
<p>Create a private, one-use link. Bind it to the preview email or leave the email field blank.</p>
<form id="create"><label class="field">Client preview email (optional)<input type="email" name="clientEmail" autocomplete="email" placeholder="owner@example.com"></label><button class="button" type="submit">Create private link</button></form>
<p id="status" role="status" aria-live="polite"></p>
<section id="new" hidden><h2>New invitation</h2><p>The link is shown once. Copy it and send it directly to the business owner.</p><div class="linkrow"><input id="invite-link" readonly aria-label="New private invitation link"><button class="button secondary" id="copy" type="button">Copy link</button></div></section>
<div class="divider"></div>
<section><h2>Recent invitations</h2><button class="text-button" id="refresh" type="button">Refresh list</button><button class="text-button" id="backfill" type="button">Bind missing client emails</button><div id="invites" aria-live="polite"></div></section>
</section>
<div id="gen-backdrop" class="drawer-backdrop" hidden></div>
<aside id="gen-drawer" class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
<div class="drawer-head"><div><span class="eyebrow">Generation detail</span><h2 id="drawer-title">Client</h2></div><button class="drawer-close" id="drawer-close" type="button" aria-label="Close details">×</button></div>
<div class="drawer-body" id="drawer-body"></div>
</aside>
</section></main>
<script>
(function () {
  'use strict';
  var STATUS = {
    queued: { label: 'Queued', kind: 'warn' },
    generating: { label: 'Generating', kind: 'warn' },
    preview_ready: { label: 'Preview ready', kind: 'ok' },
    attention: { label: 'Needs attention', kind: 'warn' },
    failed: { label: 'Failed', kind: 'bad' },
    published: { label: 'Published', kind: 'live' },
    revision: { label: 'Revision', kind: 'rev' }
  };
  function byId(id) { return document.getElementById(id); }
  function text(value) { return value === null || value === undefined ? '' : String(value); }
  function elem(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function link(href, label) {
    var anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.textContent = label;
    return anchor;
  }
  function usd(value) {
    var amount = Number(value || 0);
    if (!amount) return '$0';
    var fixed = amount >= 1 ? amount.toFixed(2) : amount.toFixed(4);
    fixed = fixed.replace(/0+$/, '').replace(/\\.$/, '');
    return '$' + fixed;
  }
  function prettyStage(stage) {
    var known = { seo_research: 'SEO research', site_config: 'Site copy', reference_dna: 'Reference DNA', reasoning_preflight: 'Reasoning preflight', images: 'Images', authoring: 'Creative authoring', repair_qa: 'Repair & QA', revision: 'Revision', preview: 'Preview deploy', publish: 'Publish' };
    return known[stage] || text(stage).replace(/[_-]+/g, ' ').replace(/^./, function (char) { return char.toUpperCase(); });
  }
  function statusOnlyStage(stage) {
    return stage === 'preview' || stage === 'publish';
  }
  function shortTime(value) {
    if (!value) return '';
    try { return new Date(Number(value)).toLocaleString(); } catch (error) { return ''; }
  }
  function pill(status) {
    var known = STATUS[status] || { label: prettyStage(status || 'unknown'), kind: 'neutral' };
    var node = elem('span', 'pill ' + known.kind, known.label);
    return node;
  }
  function parseDetail(value) {
    if (!value || typeof value !== 'string') return null;
    try { return JSON.parse(value); } catch (error) { return null; }
  }
  function stageChip(entry) {
    var label = prettyStage(entry.stage);
    var chip;
    if (entry.costUsd) {
      chip = elem('span', entry.estimatedCount > 0 && entry.actualCount === 0 ? 'chip estimated' : 'chip', label + ' ' + usd(entry.costUsd) + (entry.estimatedCount > 0 && entry.actualCount === 0 ? ' est.' : ''));
    } else if (entry.unreportedCount > 0 && !statusOnlyStage(entry.stage)) {
      chip = elem('span', 'chip estimated', label + ' price not reported');
    } else {
      chip = elem('span', 'chip', label);
    }
    chip.title = entry.eventCount + ' event(s)';
    return chip;
  }
  var state = { items: [], search: '', status: '', details: {}, expanded: {} };
  function visibleItems() {
    var needle = state.search.trim().toLowerCase();
    return state.items.filter(function (item) {
      if (state.status && item.status !== state.status) return false;
      if (!needle) return true;
      var haystack = [item.businessName, item.clientEmail, item.siteId, item.repo, item.slug, item.issueNumber, item.generationId].filter(Boolean).join(' ').toLowerCase();
      return haystack.indexOf(needle) !== -1;
    });
  }
  function renderKpis(items) {
    var host = byId('kpis');
    host.replaceChildren();
    var now = Date.now();
    var monthSpend = 0;
    var actual = 0;
    var estimated = 0;
    var counts = { preview_ready: 0, published: 0, failed: 0, attention: 0 };
    items.forEach(function (item) {
      if (item.startedAt && now - item.startedAt <= 30 * 24 * 60 * 60 * 1000) monthSpend += Number(item.totalCostUsd) || 0;
      actual += Number(item.actualCostUsd) || 0;
      estimated += Number(item.estimatedCostUsd) || 0;
      if (counts[item.status] !== undefined) counts[item.status] += 1;
    });
    function kpi(label, value, hint) {
      var card = elem('div', 'kpi');
      card.appendChild(elem('strong', null, value));
      card.appendChild(elem('small', null, label + (hint ? ' · ' + hint : '')));
      return card;
    }
    host.appendChild(kpi('Spend last 30 days', usd(monthSpend), 'all tracked'));
    host.appendChild(kpi('Actual provider cost', usd(actual), 'reported'));
    host.appendChild(kpi('Estimated cost', usd(estimated), 'configured rates'));
    host.appendChild(kpi('Tracked generations', String(items.length), 'total'));
    host.appendChild(kpi('Preview ready', String(counts.preview_ready), 'awaiting review'));
    host.appendChild(kpi('Published', String(counts.published), 'live sites'));
    host.appendChild(kpi('Needs attention', String(counts.attention), 'review'));
    host.appendChild(kpi('Failed', String(counts.failed), 'inspect'));
  }
  function timelineHost(item) {
    var host = elem('div', 'timeline');
    host.hidden = !state.expanded[item.generationId];
    host.renderEvents = function (events) { renderEventList(host, events); };
    return host;
  }
  function heroPreview(record, className) {
    var hero = elem('div', className || 'gen-hero');
    if (record.heroUpdatedAt) {
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = 'Latest hero preview for ' + (record.businessName || record.siteId || 'client site');
      img.src = '/api/admin/onboarding-invites/generation-hero?id=' + encodeURIComponent(record.generationId) + '&v=' + encodeURIComponent(record.heroUpdatedAt);
      img.addEventListener('error', function () { hero.replaceChildren(elem('span', 'hero-note', 'Hero preview unavailable')); });
      hero.appendChild(img);
    } else {
      hero.appendChild(elem('span', 'hero-note', 'No hero preview yet'));
    }
    return hero;
  }
  function renderEventList(host, events) {
    host.replaceChildren();
    if (!events.length) {
      host.appendChild(elem('p', 'event-note', 'No recorded events for this generation yet.'));
      return;
    }
    events.forEach(function (event) {
      var row = elem('div', 'event');
      var head = elem('div', 'event-head');
      head.appendChild(elem('strong', null, prettyStage(event.stage) + ' · ' + text(event.status)));
      if (event.costUsd !== null && event.costUsd !== undefined) {
        var cost = elem('span', 'chip' + (event.costKind === 'estimated' ? ' estimated' : ''), usd(event.costUsd) + (event.costKind === 'estimated' ? ' est.' : ''));
        head.appendChild(cost);
      }
      row.appendChild(head);
      var meta = [event.provider, event.model, shortTime(event.createdAt)].filter(Boolean).join(' · ');
      if (meta) row.appendChild(elem('small', null, meta));
      var detail = parseDetail(event.detail);
      var note = detail && typeof detail.notes === 'string' ? detail.notes : detail && typeof detail.message === 'string' ? detail.message : '';
      if (note) row.appendChild(elem('p', 'event-note', note));
      host.appendChild(row);
    });
  }
  function aggregateStages(events) {
    var map = {};
    events.forEach(function (event) {
      var entry = map[event.stage] || (map[event.stage] = { stage: event.stage, costUsd: 0, provider: '', model: '', kinds: {} });
      if (event.costUsd) entry.costUsd += Number(event.costUsd) || 0;
      entry.kinds[event.costKind] = (entry.kinds[event.costKind] || 0) + 1;
      if (event.provider) entry.provider = event.provider;
      if (event.model) entry.model = event.model;
    });
    return Object.keys(map).map(function (key) { return map[key]; }).sort(function (left, right) { return left.stage < right.stage ? -1 : left.stage > right.stage ? 1 : 0; });
  }
  function costKindLabel(entry) {
    var kinds = entry.kinds || {};
    if (entry.costUsd && kinds.estimated && !kinds.actual) return 'estimated';
    if (entry.costUsd) return 'actual';
    if (kinds.unreported) return 'not reported';
    return 'actual';
  }
  function renderGenerationDrawer(record, events) {
    var body = byId('drawer-body');
    byId('drawer-title').textContent = record.businessName || record.siteId || record.generationId;
    body.replaceChildren();
    body.appendChild(heroPreview(record, 'drawer-hero'));
    var head = elem('div', 'gen-head');
    var identity = elem('div');
    identity.appendChild(elem('strong', null, record.businessName || record.siteId || record.generationId));
    var metaParts = [];
    if (record.clientEmail) metaParts.push(record.clientEmail);
    if (record.issueNumber) metaParts.push('issue #' + record.issueNumber);
    if (record.siteId) metaParts.push(record.siteId);
    if (metaParts.length) identity.appendChild(elem('span', 'gen-meta', metaParts.join(' · ')));
    head.appendChild(identity);
    head.appendChild(pill(record.status));
    body.appendChild(head);
    var links = elem('div', 'drawer-links');
    if (record.previewUrl) links.appendChild(link(record.previewUrl, 'Preview site'));
    if (record.productionUrl) links.appendChild(link(record.productionUrl, 'Production site'));
    if (record.issueNumber) links.appendChild(link('https://github.com/WrazyAI/launchloom/issues/' + record.issueNumber, 'Intake issue'));
    if (record.repo) links.appendChild(link('https://github.com/' + record.repo, 'Client repo'));
    if (links.childNodes.length) body.appendChild(links);
    var facts = document.createElement('dl');
    facts.className = 'facts';
    function fact(label, value) {
      if (value === null || value === undefined || value === '') return;
      facts.appendChild(elem('dt', null, label));
      facts.appendChild(elem('dd', null, text(value)));
    }
    fact('Generation', record.generationId);
    fact('Submission', record.submissionId);
    fact('Issue', record.issueNumber ? '#' + record.issueNumber : '');
    fact('Repository', record.repo);
    fact('Review PR', record.reviewPr ? '#' + record.reviewPr : '');
    fact('Reviewed commit', record.reviewedSha ? String(record.reviewedSha).slice(0, 8) : '');
    fact('Started', shortTime(record.startedAt));
    fact('Updated', shortTime(record.updatedAt));
    fact('Completed', record.completedAt ? shortTime(record.completedAt) : '');
    if (record.failureReason) fact('Failure', record.failureReason);
    body.appendChild(facts);
    var stages = aggregateStages(events);
    var total = 0;
    stages.forEach(function (entry) { total += entry.costUsd; });
    body.appendChild(elem('h3', null, 'Cost by stage'));
    if (!stages.length) {
      body.appendChild(elem('p', 'event-note', 'No cost events recorded yet.'));
    } else {
      var table = document.createElement('table');
      table.className = 'cost-table';
      var thead = document.createElement('thead');
      var hrow = document.createElement('tr');
      ['Stage', 'Provider / model', 'Kind', 'Amount'].forEach(function (label) { hrow.appendChild(elem('th', null, label)); });
      thead.appendChild(hrow);
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      stages.forEach(function (entry) {
        var row = document.createElement('tr');
        var kind = costKindLabel(entry);
        row.appendChild(elem('td', null, prettyStage(entry.stage)));
        row.appendChild(elem('td', null, [entry.provider, entry.model].filter(Boolean).join(' · ') || '-'));
        row.appendChild(elem('td', null, kind));
        row.appendChild(elem('td', 'amount', entry.costUsd ? usd(entry.costUsd) + (kind === 'estimated' ? ' est.' : '') : '-'));
        tbody.appendChild(row);
      });
      var totalRow = document.createElement('tr');
      totalRow.className = 'total';
      totalRow.appendChild(elem('td', null, 'Total'));
      totalRow.appendChild(elem('td'));
      totalRow.appendChild(elem('td'));
      totalRow.appendChild(elem('td', 'amount', usd(total)));
      tbody.appendChild(totalRow);
      table.appendChild(tbody);
      body.appendChild(table);
    }
    body.appendChild(elem('h3', null, 'Timeline'));
    var timeline = elem('div', 'timeline');
    renderEventList(timeline, events);
    body.appendChild(timeline);
  }
  function closeGenerationDrawer() {
    byId('gen-drawer').hidden = true;
    byId('gen-backdrop').hidden = true;
    document.body.style.overflow = '';
  }
  function openGenerationDrawer(generationId, fallbackLabel) {
    var body = byId('drawer-body');
    byId('drawer-title').textContent = fallbackLabel || generationId || 'Generation detail';
    byId('gen-drawer').hidden = false;
    byId('gen-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    body.replaceChildren();
    if (!generationId) {
      body.appendChild(elem('p', 'event-note', fallbackLabel || 'No tracked generation for this client yet. A tracked generation appears after the intake is submitted and generation runs.'));
      return;
    }
    body.appendChild(elem('p', 'event-note', 'Loading generation details…'));
    fetch('/api/admin/onboarding-invites/generations?id=' + encodeURIComponent(generationId), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) { return response.json().catch(function () { return {}; }).then(function (payload) { if (!response.ok) throw new Error(payload.error || 'Generation details are unavailable.'); return payload; }); })
      .then(function (payload) { renderGenerationDrawer(payload.generation, payload.events || []); })
      .catch(function (error) {
        body.replaceChildren(elem('p', 'event-note', 'No tracked generation for this client yet. ' + error.message));
      });
  }
  window.LaunchLoomOpenGeneration = function (generationId, fallbackLabel) { openGenerationDrawer(generationId, fallbackLabel); };
  byId('drawer-close').addEventListener('click', closeGenerationDrawer);
  byId('gen-backdrop').addEventListener('click', closeGenerationDrawer);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !byId('gen-drawer').hidden) closeGenerationDrawer(); });
  function renderGenerations() {
    var host = byId('generations');
    host.replaceChildren();
    var items = visibleItems();
    if (!items.length) {
      host.appendChild(elem('div', 'empty', state.items.length ? 'No generation matches the current filter.' : 'No tracked generations yet. New runs appear here after the tracking secret and Access paths are configured.'));
      return;
    }
    items.forEach(function (item) {
      var card = elem('article', 'gen');
      card.appendChild(heroPreview(item, 'gen-hero'));
      var main = elem('div', 'gen-main');
      var head = elem('div', 'gen-head');
      var titleWrap = elem('div');
      var openButton = elem('button', 'gen-open clickable');
      openButton.type = 'button';
      openButton.title = 'Open client generation details';
      openButton.appendChild(elem('strong', null, item.businessName || item.siteId || item.generationId));
      var metaParts = [];
      if (item.clientEmail) metaParts.push(item.clientEmail);
      if (item.issueNumber) metaParts.push('issue #' + item.issueNumber);
      if (item.siteId) metaParts.push(item.siteId);
      if (metaParts.length) openButton.appendChild(elem('span', 'gen-meta', metaParts.join(' · ')));
      openButton.addEventListener('click', function () { openGenerationDrawer(item.generationId, item.businessName || item.siteId); });
      titleWrap.appendChild(openButton);
      head.appendChild(titleWrap);
      head.appendChild(pill(item.status));
      main.appendChild(head);
      var links = elem('div', 'links');
      if (item.previewUrl) links.appendChild(link(item.previewUrl, 'Preview site'));
      if (item.productionUrl) links.appendChild(link(item.productionUrl, 'Production site'));
      if (item.issueNumber) links.appendChild(link('https://github.com/WrazyAI/launchloom/issues/' + item.issueNumber, 'Intake issue'));
      if (item.repo) links.appendChild(link('https://github.com/' + item.repo, 'Client repo'));
      if (links.childNodes.length) main.appendChild(links);
      var chips = elem('div', 'chips');
      var stages = item.stages || [];
      stages.forEach(function (entry) { chips.appendChild(stageChip(entry)); });
      if (stages.length) chips.appendChild(elem('span', 'chip total', 'Total ' + usd(item.totalCostUsd) + (item.estimatedCostUsd > 0 ? ' (est. ' + usd(item.estimatedCostUsd) + ')' : '')));
      if (chips.childNodes.length) main.appendChild(chips);
      var meta = elem('span', 'gen-meta', 'Updated ' + shortTime(item.updatedAt) + (item.lastEventAt ? ' · last event ' + shortTime(item.lastEventAt) : '') + (item.eventCount ? ' · ' + item.eventCount + ' event(s)' : ''));
      main.appendChild(meta);
      if (item.failureReason) main.appendChild(elem('p', 'event-note', 'Failure: ' + item.failureReason));
      var toggle = elem('button', 'text-button', state.expanded[item.generationId] ? 'Hide timeline' : 'Show timeline');
      toggle.type = 'button';
      var timeline = timelineHost(item);
      toggle.addEventListener('click', function () {
        var open = !state.expanded[item.generationId];
        state.expanded[item.generationId] = open;
        timeline.hidden = !open;
        toggle.textContent = open ? 'Hide timeline' : 'Show timeline';
        if (!open) return;
        if (state.details[item.generationId]) {
          timeline.renderEvents(state.details[item.generationId]);
          return;
        }
        timeline.replaceChildren(elem('p', 'event-note', 'Loading events…'));
        fetch('/api/admin/onboarding-invites/generations?id=' + encodeURIComponent(item.generationId), { credentials: 'same-origin', cache: 'no-store' })
          .then(function (response) { return response.json().catch(function () { return {}; }).then(function (body) { if (!response.ok) throw new Error(body.error || 'Events are unavailable.'); return body; }); })
          .then(function (body) {
            state.details[item.generationId] = (body.events || []);
            timeline.renderEvents(state.details[item.generationId]);
          })
          .catch(function (error) { timeline.replaceChildren(elem('p', 'event-note', error.message)); });
      });
      main.appendChild(toggle);
      main.appendChild(timeline);
      card.appendChild(main);
      host.appendChild(card);
    });
  }
  function loadGenerations() {
    byId('generations-status').textContent = 'Loading generations…';
    fetch('/api/admin/onboarding-invites/generations', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) { return response.json().catch(function () { return {}; }).then(function (body) { if (!response.ok) throw new Error(body.error || 'Generation tracking is unavailable (' + response.status + ').'); return body; }); })
      .then(function (body) {
        state.items = body.generations || [];
        renderKpis(state.items);
        renderGenerations();
        byId('generations-status').textContent = state.items.length ? 'Tracking ' + state.items.length + ' generation(s).' : 'No tracked generations yet. New runs appear after the tracking secret and Access paths are configured.';
      })
      .catch(function (error) {
        byId('generations-status').textContent = error.message + ' If this is an Access 403, confirm the admin Access application still covers /api/admin/onboarding-invites*.';
      });
  }
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (other) {
        var active = other === tab;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', active ? 'true' : 'false');
        var panel = byId(other.getAttribute('aria-controls'));
        if (panel) panel.hidden = !active;
      });
    });
  });
  byId('generation-search').addEventListener('input', function (event) { state.search = event.currentTarget.value; renderGenerations(); });
  byId('generation-status-filter').addEventListener('change', function (event) { state.status = event.currentTarget.value; renderGenerations(); });
  byId('generations-refresh').addEventListener('click', loadGenerations);
  loadGenerations();
})();
(function () {
  'use strict';
  var endpoint = '/api/admin/onboarding-invites';
  var status = document.getElementById('status');
  var list = document.getElementById('invites');
  function request(method, body) {
    return fetch(endpoint, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) { return response.json().catch(function () { return {}; }).then(function (result) { if (!response.ok) throw Error(result.error || 'Invite management is unavailable.'); return result; }); });
  }
  function refresh() {
    return request('GET').then(function (result) {
      list.replaceChildren();
      (result.invites || []).forEach(function (invite) {
        var row = document.createElement('article');
        row.className = 'row';
        var details = document.createElement('div');
        var generationId = invite.issueNumber ? ('issue:' + invite.issueNumber) : (invite.submissionId || '');
        var email = document.createElement(generationId ? 'button' : 'strong');
        if (generationId) {
          email.type = 'button';
          email.className = 'link-button';
          email.title = 'Open generation details';
          email.addEventListener('click', function () {
            if (window.LaunchLoomOpenGeneration)
              window.LaunchLoomOpenGeneration(generationId, invite.clientEmail || invite.submitterEmail || ('issue #' + invite.issueNumber));
            else
              status.textContent = 'Generation details are unavailable in this view.';
          });
        }
        var meta = document.createElement('small');
        email.textContent = invite.clientEmail || invite.submitterEmail || 'Email not bound';
        meta.textContent = invite.status + (invite.issueNumber ? ' · issue #' + invite.issueNumber : '') + ' · expires ' + new Date(invite.expiresAt).toLocaleString();
        details.append(email, meta);
        row.append(details);
        if (invite.status === 'unused') {
          var button = document.createElement('button');
          button.className = 'text-button';
          button.type = 'button';
          button.textContent = 'Revoke';
          button.addEventListener('click', function () {
            button.disabled = true;
            request('POST', { action: 'revoke', inviteId: invite.inviteId })
              .then(function () { status.textContent = 'Invitation revoked.'; return refresh(); })
              .catch(function (error) { status.textContent = error.message; button.disabled = false; });
          });
          row.append(button);
        }
        list.append(row);
      });
      if (!list.children.length) list.textContent = 'No invitations yet.';
    }).catch(function (error) { status.textContent = error.message || 'Invite list is unavailable.'; });
  }
  document.getElementById('create').addEventListener('submit', function (event) {
    event.preventDefault();
    var button = event.currentTarget.querySelector('button');
    button.disabled = true;
    status.textContent = 'Creating invitation…';
    var form = new FormData(event.currentTarget);
    request('POST', { action: 'create', clientEmail: form.get('clientEmail') })
      .then(function (result) {
        document.getElementById('invite-link').value = result.url;
        document.getElementById('new').hidden = false;
        status.textContent = 'Private invitation created.';
        event.currentTarget.reset();
        return refresh();
      })
      .catch(function (error) { status.textContent = error.message || 'Invitation could not be created.'; })
      .finally(function () { button.disabled = false; });
  });
  document.getElementById('copy').addEventListener('click', function () {
    navigator.clipboard.writeText(document.getElementById('invite-link').value).then(function () { status.textContent = 'Invitation link copied.'; });
  });
  document.getElementById('refresh').addEventListener('click', function () { void refresh(); });
  document.getElementById('backfill').addEventListener('click', function () {
    var button = this;
    button.disabled = true;
    status.textContent = 'Binding client emails from stored intakes…';
    request('POST', { action: 'backfill' })
      .then(function (result) {
        var bound = Number(result.backfilled) || 0;
        var remaining = Number(result.remaining) || 0;
        status.textContent = bound
          ? 'Bound ' + bound + ' client email' + (bound === 1 ? '' : 's') + (remaining ? '; ' + remaining + ' still missing.' : '.')
          : 'No client emails were available to bind.';
        return refresh();
      })
      .catch(function (error) { status.textContent = error.message; })
      .finally(function () { button.disabled = false; });
  });
  void refresh();
})();
</script></body></html>`;
}
