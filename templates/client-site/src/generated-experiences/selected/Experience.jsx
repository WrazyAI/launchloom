export default function SelectedExperience({ content, runtime: _runtime }) {
  return (
    <main data-creative-candidate="fallback" data-model-experience="fallback">
      <section data-hero>
        <p>{content.hero.kicker}</p>
        <h1>{content.hero.heading}</h1>
        <p>{content.hero.body}</p>
        <a data-early-conversion href="#contact">
          {content.hero.primaryLabel}
        </a>
      </section>
      <section id="services">
        <h2>{content.copy.servicesHeading || "Services"}</h2>
        {content.services.map((service) => (
          <article key={service.name}>
            <h3>{service.name}</h3>
            <p>{service.description}</p>
          </article>
        ))}
      </section>
      <section id="faqs">
        <h2>{content.copy.faqHeading || "FAQs"}</h2>
        {content.faqs.map((faq) => (
          <details key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </section>
      <section id="contact">
        <h2>{content.copy.contactHeading || content.hero.primaryLabel}</h2>
        <a href={`tel:${content.brand.phone.replace(/[^+\d]/gu, "")}`}>
          {content.brand.phone}
        </a>
      </section>
    </main>
  );
}
