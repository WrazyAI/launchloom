import type { PageBrief } from "../lib/page-briefs.mjs";
import { supplementalSections } from "../lib/page-briefs.mjs";
/** Shared semantic content primitive inside the existing authored/static shell. */
export default function PageBriefSections({
  brief,
}: {
  brief: PageBrief | null;
}) {
  if (!brief || brief.mode !== "supported") return null;
  const sections =
    brief.pageType === "service" ? supplementalSections(brief) : brief.sections;
  return (
    <div data-page-brief={brief.routeId} data-page-brief-version="1">
      {sections.map((section) => (
        <section
          data-ll-surface="light"
          className="section wrap"
          key={section.kind}
          data-page-field={section.kind}
        >
          <div className="section-heading">
            <h2>{section.heading}</h2>
          </div>
          {section.items.map((item, index) => (
            <p key={index}>{item.text}</p>
          ))}
        </section>
      ))}
      {(brief.pageType === "service" || brief.pageType === "location"
        ? brief.media.slice(1)
        : brief.media
      ).map((media) => (
        <figure className="section wrap ll-page-media" key={media.src}>
          <img src={media.src} alt={media.alt} loading="lazy" />
        </figure>
      ))}
      {brief.pageType !== "service" && brief.process.length > 0 && (
        <section data-ll-surface="light" className="section wrap">
          <h2>Steps to discuss</h2>
          <ol>
            {brief.process.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </section>
      )}
      {brief.pageType !== "service" && brief.faqs.length > 0 && (
        <section data-ll-surface="light" className="section wrap faq-section">
          <h2>Questions about this page</h2>
          <div className="faq-list">
            {brief.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
