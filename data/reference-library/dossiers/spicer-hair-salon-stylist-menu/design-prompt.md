# Stylist-led hair salon implementation brief

Use the paired screenshots as a reference for service information architecture and atmosphere, not as a copy deck. Build an original site around the client's verified service list, prices, stylist levels, timing, color policy, hours, and booking rules. Do not copy the source salon name, artwork, wording, prices, staff descriptions, testimonials, treatment claims, or business details. Client photography has priority; if absent, use newly generated or licensed salon imagery that does not pretend to depict the client or actual staff.

## Visual hierarchy

Open with a narrow phone/booking utility and a cinematic salon-interior image under a dark overlay. Place a concise appointment promise and two practical actions over the left side: one to book, one to inspect the menu. Keep the brand/navigation quiet and usable. The page's main visual idea is a transition from atmospheric shop photography to a highly legible service table; do not extend the hero mood into every section or replace the service data with a stack of generic cards.

Use a dark aubergine, charcoal, and warm-ivory field with one copper or bronze accent for actions and important values. Body text and prices must retain strong contrast. The reference declares Inter for body and Fraunces for display, though its static CSS utility does not apply `font-family` correctly; if adopting this intended pairing, define those roles explicitly and verify them in the browser. Use mono-like uppercase micro-labels for table headings only when readable. The service menu should remain the dominant content.

## Page sequence

1. Utility strip with the verified booking/phone route and any confirmed scheduling note.
2. Image-backed hero with a short service promise, primary booking action, and menu shortcut.
3. Service menu showing price and duration side by side. If actual prices vary by stylist level, name those levels with verified client terminology and put the price basis next to the service.
4. Stylist-level comparison that explains the difference in experience or price only when the business confirms that information.
5. A color-service consultation path with patch-test or other prerequisites only when required by verified salon policy and applicable professional guidance.
6. Product recommendations only if the salon genuinely sells products and has approved inventory copy.
7. Gallery/image policy: show genuine approved work or explain how client work is selected. Do not show generated before-and-after hair transformations as real results.
8. Genuine approved review proof, native FAQ, and a focused appointment request form with a real destination.
9. Footer with the required Spicer Designs credit if the CC BY template is directly adapted; do not imply their endorsement.

The central value is planning: visitors should understand approximate time, price, and preparation before booking. Search copy should answer real local questions about services and stylist choice. Never reuse example service durations, prices, business hours, review claims, staff names, patch-test intervals, or color-safety statements from the screenshot.

## Responsive translation

At 1440px, keep the hero wide and the main service table within a readable max-width. Preserve the relationship between service, time, and price column. At 390px, stack each service as a labeled row or compact block: service name, duration, then available stylist-level prices. Do not force the desktop table to scroll sideways. Turn stylist tiers into labeled panels with enough width for their explanations. Put color consultation prerequisites before a color booking action. Stack form fields, preserve phone access, and keep both primary actions visible and touch-safe.

Use brief section reveals only when JavaScript and intersection observation work. The full source package uses hidden reveal classes without a reveal observer in its HTML version, so all content must render visibly by default or use a robust reduced-motion/static fallback. The captures were taken with the package's reduced-motion state, where all 18 reveal groups become visible. Native `<details>` is an acceptable FAQ pattern. Provide keyboard focus, clear table headers, semantic form labels, useful alt text, and no motion-only or color-only information.

## Signature elements

- A compact booking/phone utility above a moody salon hero.
- A service matrix that exposes both duration and price basis before booking.
- Distinct stylist-level pricing when the client actually uses that model.
- A separate consultation/prerequisite path for color work when supported by policy.
- A restrained appointment close instead of repetitive calls to action after every section.

## Prohibited patterns

- No source brand, name, image, exact copy, sample prices, sample durations, fictional stylist names, testimonials, store hours, or business facts.
- No invented stylist seniority, credentials, patch-test timing, allergy advice, color policy, product recommendation, treatment result, or booking availability.
- No source placeholder art presented as a real salon, customer, or employee.
- No hiding the menu behind a filter, card wall, accordion, or animation; no default invisible sections; no horizontal-scroll service table at mobile width.
- No non-functional booking/filter controls labeled as live, and no form shown as successfully submitting without a real handler.

Before delivery, verify client facts against the sealed content source, calculate no prices or timings from the reference, test booking routes, inspect contrast and table legibility at desktop and mobile, confirm reduced-motion behavior, and preserve required CC BY attribution if directly adapting the Spicer package. Treat the visual language as guidance; the client and current SEO research govern the copy and services.
