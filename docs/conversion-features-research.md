# Conversion feature direction

Research date: 2026-09-08. This is a design and implementation recommendation. No production changes were made.

## Live reference behavior

The [Versailles Health & Wellness](https://versailleshealthwellness.com/) homepage uses three small deterministic interactions:

1. A multi-step qualifier asks treatment interest, prior experience, and timing before collecting contact details. Choices advance immediately and update a progress bar.
2. A scripted concierge opens from a floating button. It presents a fixed set of questions and delayed predefined answers. It is not a generative chatbot.
3. An exit offer appears once per page load when a desktop pointer leaves through the top. A second trigger displays it after a visitor scrolls beyond 900 pixels and returns near the top, which can also affect mobile visitors.

The reference lead script advances to a success state even when the network request fails. LaunchLoom should preserve its existing truthful error handling instead.

## Recommended LaunchLoom components

### Guided qualifier

Convert the existing `conversion.qualification` data into an optional step-by-step component. Each answer should be visibly selected, saved between steps, keyboard operable, and submitted through the current signed Worker lead endpoint. Keep contact details at the final step and show a real failure state when delivery fails.

Default use:

- Care and consultation sites: two or three decision questions, followed by contact details.
- Local trades: one or two practical questions such as service type and urgency, followed quickly by phone or quote details.
- Do not ask for health diagnoses, protected information, or unnecessary personal detail.

### Quick answers

Add an optional scripted FAQ assistant populated from verified `conversion.faqs`, the submitted offer, hours, services, and contact actions. Label it `Quick answers` or `Website assistant`. Do not claim that a person is online or that answers are live when they are scripted. It should provide a clear call, booking, or quote action after each useful answer.

### Exit offer

Add an optional exit offer only when the business has a real, verified offer or useful next step. On desktop, enable it after meaningful engagement and one genuine exit signal. Store dismissal in `sessionStorage` so it appears no more than once per session. Do not trigger it after a lead has started or completed, while another dialog is open, or during developer/client review actions.

Avoid automatic full-screen exit offers on mobile. Google recommends small banners rather than promotional interstitials that obscure the main content because intrusive dialogs can hurt usability and search understanding: [Google Search Central](https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials).

## Accessibility and interaction rules

Modal dialogs must move keyboard focus inside, contain the tab sequence, close with Escape, provide a visible close button, and return focus to the invoking control. These behaviors follow the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [WCAG focus-order guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).

Only one overlay can be active at a time. Sticky mobile calls, the review banner, quick answers, and exit offer must not cover each other. Respect reduced motion. Preserve visible selection and progress states without relying on color alone.

## Configuration shape

Keep all three features bounded and typed in `site.config.json`:

```json
{
  "conversion": {
    "guidedQualifier": {
      "enabled": true,
      "heading": "A few quick questions",
      "steps": []
    },
    "quickAnswers": {
      "enabled": true,
      "greeting": "How can we help?",
      "items": []
    },
    "exitOffer": {
      "enabled": true,
      "heading": "Your consultation is complimentary.",
      "body": "...",
      "ctaLabel": "Request a consultation",
      "ctaTarget": "#contact"
    }
  }
}
```

The generator may enable features and improve presentation, but normalization must require source-backed content. Revisions should support enable, disable, wording, question order, and CTA changes as explicit operations. Requested artifacts must be checked in rendered desktop and mobile output.

## Recommended order

1. Build the guided qualifier using the existing lead endpoint and qualification data.
2. Add the scripted quick-answer assistant from verified FAQ content.
3. Add the restrained desktop exit offer with once-per-session and form-state suppression.
4. Add rendered interaction tests for keyboard behavior, mobile overlap, real error handling, and review-banner coexistence.

This gives LaunchLoom the useful conversion behavior shown in the reference while improving honesty, mobile restraint, accessibility, and delivery reliability.
