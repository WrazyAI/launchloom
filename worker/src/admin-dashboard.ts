/**
 * Data-free same-origin admin shell.
 *
 * The workspace and login pages mount the compiled React application from the
 * allowlisted /admin-assets/* bundle. This module intentionally contains no
 * client records, inline script, inline style or fabricated identity.
 */
const ADMIN_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#10251f"/><path d="M24 14h11l-5 29h17l-2 8H17l7-37Z" fill="#f4f2ea"/></svg>',
)}`;

function shellMarkup(mode: "workspace" | "login") {
  const fallback =
    mode === "login"
      ? `<main class="admin-fallback">
<p class="admin-eyebrow">LaunchLoom</p>
<h1>LaunchLoom admin</h1>
<p>Sign in with your approved admin account.</p>
<noscript><p>JavaScript is required for the admin sign-in shell.</p></noscript>
</main>`
      : `<main class="admin-fallback">
<p class="admin-eyebrow">LaunchLoom operations</p>
<h1>Operations workspace</h1>
<p>Loading the workspace shell...</p>
<noscript><p>JavaScript is required for the operations workspace.</p></noscript>
</main>`;
  const title = mode === "login" ? "Sign in | LaunchLoom" : "LaunchLoom operations";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<link rel="icon" href="${ADMIN_FAVICON}">
<link rel="stylesheet" href="/admin-assets/app.css">
</head>
<body class="admin-page" data-admin-view="${mode}">
<div id="admin-root">${fallback}</div>
<script type="module" src="/admin-assets/app.js"></script>
</body>
</html>`;
}

export function renderAdminDashboardHtml() {
  return shellMarkup("workspace");
}

export function renderAdminLoginHtml() {
  return shellMarkup("login");
}
