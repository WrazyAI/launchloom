const COLORS = {
  ink: "#19332d",
  muted: "#5c6f69",
  green: "#205d51",
  greenDark: "#17483f",
  mint: "#e7f2ed",
  canvas: "#f3f6f2",
  border: "#d8e2dd",
  white: "#ffffff",
  warning: "#9a4f16",
  warningBackground: "#fff2e8",
};

export function cleanEmailText(value, limit = 12_000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, limit);
}

export function cleanEmailLine(value, limit = 240) {
  return cleanEmailText(value, limit)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ");
}

export function escapeEmailHtml(value) {
  return cleanEmailText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(value) {
  return cleanEmailText(value)
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 12px;color:${COLORS.ink};font-size:15px;line-height:1.65">${escapeEmailHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function textBlock(label, value, tone = "default") {
  const warning = tone === "warning";
  return `<tr><td style="padding:0 32px 24px" class="mobile-pad"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${warning ? COLORS.warningBackground : COLORS.canvas};border:1px solid ${warning ? "#f1cfb7" : COLORS.border};border-radius:12px"><tr><td style="padding:20px 22px"><p style="margin:0 0 10px;color:${warning ? COLORS.warning : COLORS.green};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeEmailHtml(label)}</p>${paragraphs(value)}</td></tr></table></td></tr>`;
}

function action(url, label, supportingText) {
  if (!url) return "";
  return `<tr><td align="left" style="padding:4px 32px 30px" class="mobile-pad"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${COLORS.green}" style="border-radius:9px"><a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:14px 22px;color:${COLORS.white};font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;text-decoration:none;border-radius:9px">${escapeEmailHtml(label)}</a></td></tr></table>${supportingText ? `<p style="margin:12px 0 0;color:${COLORS.muted};font-size:13px;line-height:1.55">${escapeEmailHtml(supportingText)}</p>` : ""}</td></tr>`;
}

function labelledLink(url, label) {
  if (!url) return "";
  return `<a href="${escapeEmailHtml(url)}" style="color:${COLORS.green};font-weight:700;text-decoration:underline;text-decoration-color:#9cbdb3;text-underline-offset:3px">${escapeEmailHtml(label)}</a>`;
}

function shell({ preheader, eyebrow, title, intro, rows, footer }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeEmailHtml(title)}</title><style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.mobile-pad{padding-left:20px!important;padding-right:20px!important}.hero-title{font-size:29px!important;line-height:1.16!important}.brand-pad{padding:22px 20px!important}}</style></head><body style="margin:0;padding:0;background:${COLORS.canvas};-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${COLORS.canvas}"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" class="email-shell" style="width:600px;max-width:600px;border-collapse:separate;background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden"><tr><td class="brand-pad" style="padding:24px 32px;background:${COLORS.ink}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:${COLORS.white};font-size:19px;font-weight:800;letter-spacing:-.02em">LaunchLoom</td><td align="right" style="color:#bed3cc;font-size:12px">Website delivery</td></tr></table></td></tr><tr><td style="padding:34px 32px 16px" class="mobile-pad"><p style="margin:0 0 12px;color:${COLORS.green};font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase">${escapeEmailHtml(eyebrow)}</p><h1 class="hero-title" style="margin:0 0 16px;color:${COLORS.ink};font-size:34px;line-height:1.18;letter-spacing:-.035em">${escapeEmailHtml(title)}</h1><p style="margin:0;color:${COLORS.muted};font-size:16px;line-height:1.65">${escapeEmailHtml(intro)}</p></td></tr>${rows}<tr><td style="padding:22px 32px 28px;border-top:1px solid ${COLORS.border}" class="mobile-pad"><p style="margin:0;color:${COLORS.muted};font-size:12px;line-height:1.6">${escapeEmailHtml(footer || "Sent by LaunchLoom for this website project.")}</p></td></tr></table></td></tr></table></body></html>`;
}

function lifecycleCopy({ audience, kind, clientName }) {
  const revision = kind === "revision";
  if (audience === "delivery-failure") {
    return {
      subject: `Client delivery needs attention: ${clientName}`,
      preheader: `The site is live, but the client email could not be delivered.`,
      eyebrow: "Delivery attention",
      title: `The client email needs a manual check`,
      intro: `${clientName} is live, but Resend rejected the client delivery email. The website itself deployed successfully.`,
    };
  }
  if (audience === "developer") {
    return {
      subject: `Developer review required: ${clientName}`,
      preheader: `${revision ? "A revised" : "A new"} website preview is ready for internal review.`,
      eyebrow: revision ? "Revision ready" : "Preview ready",
      title: `${clientName} is ready for your review`,
      intro: `${revision ? "A revised" : "A new"} website preview is ready for internal review. Check the rendered site before approving it for the client.`,
    };
  }
  return {
    subject: `Your ${clientName} website is ready to review`,
    preheader: `Your website is live and ready for your feedback.`,
    eyebrow: "Your website is ready",
    title: `Take a look at your new website`,
    intro: `${clientName} is live and ready for your review. You can explore every page and send requested changes from the review bar.`,
  };
}

export function renderLifecycleEmail(input) {
  const audience = ["developer", "client", "delivery-failure"].includes(
    input.audience,
  )
    ? input.audience
    : "client";
  const kind = cleanEmailLine(input.kind, 40) || "preview";
  const clientName = cleanEmailLine(input.clientName, 160) || "Your website";
  const reviewUrl = cleanEmailText(input.reviewUrl || input.previewUrl, 4_000);
  const previewUrl = cleanEmailText(input.previewUrl, 4_000);
  const feedback = cleanEmailText(input.clientFeedback, 12_000);
  const outcome = cleanEmailText(input.revisionOutcome, 1_000);
  const copy = lifecycleCopy({ audience, kind, clientName });
  let rows = "";
  let textSections = [];

  if (audience === "developer" && feedback) {
    rows += textBlock("Feedback that informed this revision", feedback);
    textSections.push(`FEEDBACK THAT INFORMED THIS REVISION\n${feedback}`);
    if (outcome) {
      rows += textBlock("Revision outcome", outcome);
      textSections.push(`REVISION OUTCOME\n${outcome}`);
    }
  }

  if (audience === "delivery-failure") {
    rows += textBlock(
      "Next step",
      "Confirm or correct the client email address, then send the production website link manually.",
      "warning",
    );
    rows += action(
      previewUrl || reviewUrl,
      "Open production website",
      "This link opens the published website.",
    );
    textSections.push(
      "NEXT STEP\nConfirm or correct the client email address, then send the production website link manually.",
    );
  } else if (audience === "developer") {
    rows += action(
      reviewUrl,
      "Review developer preview",
      "Approve this version to publish it, or leave feedback for another revision.",
    );
  } else {
    rows += action(
      reviewUrl,
      "Review your website",
      "Use the review bar at the top of the site to send any requested changes.",
    );
  }

  const actionLabel =
    audience === "delivery-failure"
      ? "Open production website"
      : audience === "developer"
        ? "Review developer preview"
        : "Review your website";
  const text = `${copy.eyebrow.toUpperCase()}\n\n${copy.title}\n\n${copy.intro}${textSections.length ? `\n\n${textSections.join("\n\n")}` : ""}\n\n${actionLabel}: ${audience === "delivery-failure" ? previewUrl || reviewUrl : reviewUrl}\n\nSent by LaunchLoom for this website project.`;
  return {
    subject: copy.subject,
    html: shell({ ...copy, rows }),
    text,
  };
}

export function renderLeadEmail(input) {
  const name = cleanEmailLine(input.name, 160);
  const phone = cleanEmailLine(input.phone, 80);
  const email = cleanEmailLine(input.email, 240);
  const message = cleanEmailText(input.message, 4_000);
  const project = cleanEmailLine(input.project, 160) || "Website enquiry";
  const pageUrl = cleanEmailText(input.pageUrl, 4_000);
  const qualification = Array.isArray(input.qualification)
    ? input.qualification
        .slice(0, 6)
        .map(([key, answer]) => [
          cleanEmailLine(key, 80),
          cleanEmailText(answer, 240),
        ])
        .filter(([key, answer]) => key && answer)
    : [];
  const detailRows = [
    ["Name", name],
    ["Phone", phone],
    ["Email", email],
    ...qualification,
  ]
    .map(
      ([label, value]) =>
        `<tr><td valign="top" style="padding:8px 12px 8px 0;color:${COLORS.muted};font-size:13px;font-weight:700;width:120px">${escapeEmailHtml(label)}</td><td valign="top" style="padding:8px 0;color:${COLORS.ink};font-size:15px;line-height:1.5;word-break:break-word">${escapeEmailHtml(value)}</td></tr>`,
    )
    .join("");
  let rows = `<tr><td style="padding:0 32px 24px" class="mobile-pad"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${detailRows}</table></td></tr>${textBlock("Message", message)}`;
  if (pageUrl)
    rows += `<tr><td style="padding:0 32px 28px" class="mobile-pad"><p style="margin:0;color:${COLORS.muted};font-size:14px;line-height:1.5">Submitted from ${labelledLink(pageUrl, "the website enquiry page")}.</p></td></tr>`;
  const qualificationText = qualification
    .map(([key, answer]) => `${key}: ${answer}`)
    .join("\n");
  const text = `NEW WEBSITE ENQUIRY\n\nNew enquiry for ${project}\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email}${qualificationText ? `\n${qualificationText}` : ""}\n\nMESSAGE\n${message}${pageUrl ? `\n\nWebsite enquiry page: ${pageUrl}` : ""}\n\nReply directly to this email to contact ${name}.`;
  return {
    subject: `New website lead: ${name}`,
    html: shell({
      preheader: `${name} sent a new enquiry through ${project}.`,
      eyebrow: "New website enquiry",
      title: `A new lead for ${project}`,
      intro: `Reply directly to this email to contact ${name}. Their submitted details are below.`,
      rows,
      footer:
        "This transactional notification was sent from the website enquiry form.",
    }),
    text,
  };
}
