# Custom domain handoff

MVP publication uses the site’s `netlify.app` URL. For a client domain, the operator should:

1. Add the domain in the client Netlify project.
2. Copy the exact DNS record instructions Netlify provides for that domain and registrar.
3. Wait for DNS resolution and Netlify SSL provisioning.
4. Verify the apex/`www` redirect, HTTPS, lead form, and metadata on the live domain.

DNS targets vary by registrar and apex-domain support; LaunchLoom does not guess A or CNAME values.
