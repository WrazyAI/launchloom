# Cloudflare cutover and rollback

## Before enabling production traffic

1. Add all secrets from the README and confirm the Cloudflare API token has Workers Scripts, Workers Routes, Pages, R2, and Zone DNS write access for `wrazyos.com`.
2. In Cloudflare, set the account’s one free WAF rate-limiting rule to match `http.request.uri.path starts_with "/api/"`, count by IP, allow 30 requests per 10 seconds, then block for 10 seconds. Keep this single rule focused on the API because the Free plan allows one rate rule.
3. Leave Turnstile optional until the onboarding experience is otherwise accepted. When provisioned, set its site key in the form and `TURNSTILE_SECRET_KEY` as a Worker secret; the Worker already performs server-side verification whenever the secret exists.
4. Run the platform deployment workflow. It is the only step that attaches `api.launchloom.wrazyos.com`; this prevents an unfinished Worker from claiming that hostname.
5. Wait for the existing Pages and R2 custom hostname certificates to become active. Do not direct clients to either custom hostname while they are pending.

## Staging acceptance

Use one fictional wellness business and one fictional home-services business. For each, verify the public `pages.dev` platform can complete Google lookup (including no-result and manual-skip cases), image upload, intake creation, private repository creation, Pages preview, both emails, email-matched feedback rejection/acceptance, revision rebuild, stale-approval rejection, approval merge, production deployment, and a client lead email.

Check the generated repository contains only configuration and no service credentials. Inspect a deployed page source to confirm no private intake values or API secrets are emitted. The signed review and lead tokens are intentionally public runtime capabilities but are limited to their exact allowed origins; review tokens also expire and require the invited email.

## Cutover

After both fixtures pass, point the public LaunchLoom link to `https://launchloom.wrazyos.com` and begin accepting new production intakes there. New sites use direct Pages upload and R2 only. Keep all Netlify projects and their existing URLs unchanged; they retain serving the client sites that were created before cutover.

## Rollback

If the Worker, Pages upload, or email path fails, stop sending users to the Cloudflare onboarding URL and restore the prior Netlify platform link. Existing Netlify sites remain live because this migration never removes or mutates them. For a bad Cloudflare platform release, use the previous successful deployment in the Pages dashboard or re-run the platform workflow from its last known-good commit. For a bad Worker release, redeploy the last known-good commit; do not delete R2 assets or generated repositories during rollback.
