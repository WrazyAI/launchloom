# Future GoHighLevel integration

GHL is intentionally not connected in the MVP. When enabled, LaunchLoom will add a location-level OAuth installation and map:

- an onboarding submission to a GHL opportunity and pipeline stage;
- the client’s calendar/chat widget identifiers into `site.config.json`;
- preview-ready and live events to GHL workflows for SMS/email;
- generated-site Netlify Form submissions into GHL contacts and conversations.

The platform will use a location-scoped access token, validate every webhook signature, and store only the widget/configuration IDs required by the site. No GHL token is exposed to generated client sites.
