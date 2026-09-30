import { LeadForm } from "@launchloom/runtime";
export default function ServicePage({ content, runtime, service }) {
  return <main data-service-page data-service-slug={service.slug}>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-service-hero><h1>{service.name}</h1><p>{service.description}</p></section>
    <section data-service-support><p>{service.support.scope}</p><p>{service.support.preparation}</p><p>{service.support.nextStep}</p></section>
    <section data-service-related><ul>{service.related.map((item) => <li key={item.slug}><a href={`/services/${item.slug}/`}>{item.name}</a></li>)}</ul></section>
    {service.process.length > 0 && <ol>{service.process.map((step) => <li key={step}>{step}</li>)}</ol>}
    {service.faqs.length > 0 && <section>{service.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}
