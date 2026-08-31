const token = process.env.NETLIFY_AUTH_TOKEN;
const slug = process.argv[2];
const account = process.env.NETLIFY_ACCOUNT_SLUG;
if (!token || !slug || !account) throw new Error("NETLIFY_AUTH_TOKEN, NETLIFY_ACCOUNT_SLUG, and a site slug are required.");
const response = await fetch(`https://api.netlify.com/api/v1/${account}/sites`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: slug }) });
if (!response.ok) throw new Error(`Could not create Netlify site: ${response.status} ${(await response.text()).slice(0, 300)}`);
const site = await response.json();
console.log(JSON.stringify({ id: site.id, url: site.url, name: site.name }));
