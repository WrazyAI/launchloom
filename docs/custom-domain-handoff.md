# Custom domain handoff

MVP publication uses the generated Cloudflare Pages `pages.dev` URL. For a client domain, the operator should:

1. Add the domain in the client Cloudflare Pages project.
2. Copy the exact DNS record instructions Cloudflare provides for that domain and registrar. An apex domain requires Cloudflare nameservers; a delegated subdomain can use the CNAME target Cloudflare shows.
3. Wait for DNS resolution and Cloudflare certificate provisioning.
4. Verify the apex/`www` redirect, HTTPS, lead form, and metadata on the live domain.

DNS targets vary by registrar and apex-domain support; LaunchLoom does not guess A or CNAME values. Before adding a custom domain, mint a replacement lead token containing that domain origin and rebuild the approved site; the Worker rejects lead posts from an origin that is not in the token.
