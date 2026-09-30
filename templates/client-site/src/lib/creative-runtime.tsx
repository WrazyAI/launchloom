import { useEffect, useMemo, useState } from "react";

export type CreativeRuntime = {
  candidateId?: string;
  reducedMotion?: boolean;
  diagnostic?: boolean;
  asset?: (token: string) => string;
  lead?: { apiUrl?: string; token?: string };
  reviews?: { apiUrl?: string; token?: string };
};

export type CreativeContent = {
  brand: {
    name: string;
    logo?: string;
    phone: string;
    email: string;
    address: string;
    serviceAreas: readonly string[];
  };
  hero: {
    kicker: string;
    heading: string;
    body: string;
    primaryLabel: string;
    image?: string;
    secondaryImage?: string;
    tertiaryImage?: string;
    offer?: string;
  };
  services: readonly {
    name: string;
    description: string;
    slug?: string;
  }[];
  proof: readonly string[];
  process: readonly string[];
  faqs: readonly { question: string; answer: string }[];
  locations: readonly { name: string; description?: string }[];
  locationMap: {
    available: boolean;
    address: string;
    hours: string;
    directionsHref: string;
    embedHref: string;
  };
  copy: Record<string, string | undefined>;
  businessDescription: string;
  showLocationMap: boolean;
  hasSocialProof: boolean;
  socialProof: {
    source: string;
    heading: string;
    intro: string;
    points: readonly string[];
  } | null;
};

export type CreativeServicePage = {
  name: string;
  slug: string;
  description: string;
  support: {
    scope: string;
    preparation: string;
    nextStep: string;
  };
  related: readonly {
    name: string;
    slug: string;
    description: string;
  }[];
  process: readonly string[];
  faqs: readonly { question: string; answer: string }[];
  images: { context?: string };
};

export type CreativeLocationPage = {
  name: string;
  slug: string;
  description: string;
  localNote: string;
  services: readonly {
    name: string;
    slug: string;
    description: string;
  }[];
  otherAreas: readonly { name: string; slug: string }[];
  images: { context?: string };
};

export function useReducedMotion(runtime?: CreativeRuntime) {
  const [reducedMotion, setReducedMotion] = useState(
    Boolean(runtime?.reducedMotion),
  );
  useEffect(() => {
    if (runtime?.reducedMotion !== undefined) {
      setReducedMotion(Boolean(runtime.reducedMotion));
      return undefined;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [runtime?.reducedMotion]);
  return reducedMotion;
}

export function resolveAsset(
  value: string | undefined,
  runtime?: CreativeRuntime,
) {
  if (!value) return "";
  return runtime?.asset ? runtime.asset(value) : value;
}

export function ContactLinks({ content }: { content: CreativeContent }) {
  return (
    <div className="launchloom-contact-links" data-runtime="contact-links">
      {content.brand.phone && (
        <a href={`tel:${content.brand.phone.replace(/[^+\d]/gu, "")}`}>
          {content.brand.phone}
        </a>
      )}
      {content.brand.email && (
        <a href={`mailto:${content.brand.email}`}>{content.brand.email}</a>
      )}
    </div>
  );
}

export function FAQList({ content }: { content: CreativeContent }) {
  return (
    <div className="launchloom-faq-list" data-runtime="faq-list">
      {content.faqs.map((faq) => (
        <details key={faq.question}>
          <summary>
            {faq.question}
            <span aria-hidden="true">+</span>
          </summary>
          <p>{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}

type LeadFormProps = {
  content: CreativeContent;
  runtime?: CreativeRuntime;
  id?: string;
};

export function LeadForm(props: LeadFormProps) {
  if (props.runtime?.diagnostic)
    return (
      <p className="launchloom-lead-form-note" data-runtime="lead-form-disabled" role="status">
        Contact forms are disabled in this private design preview.
      </p>
    );
  return <ConfiguredLeadForm {...props} />;
}

function ConfiguredLeadForm({
  content,
  runtime,
  id = "creative-lead-form",
}: LeadFormProps) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const initial = useMemo(
    () => ({ name: "", phone: "", email: "", message: "" }),
    [],
  );
  const [fields, setFields] = useState(initial);
  return (
    <form
      id={id}
      className="launchloom-lead-form"
      data-runtime="lead-form"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        window.dispatchEvent(new CustomEvent("launchloom:lead-started"));
        const payload = {
          token: runtime?.lead?.token || "",
          name: fields.name,
          phone: fields.phone,
          email: fields.email,
          message: fields.message,
          qualification: {},
          "bot-field": "",
          pageUrl: window.location.href,
        };
        if (!runtime?.lead?.apiUrl || !runtime.lead.token) {
          setStatus("This form is not configured yet. Please call us instead.");
          setPending(false);
          return;
        }
        void fetch(`${runtime.lead.apiUrl.replace(/\/$/u, "")}/api/lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(async (response) => {
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "We could not send your request.");
            setFields(initial);
            setStatus("Thank you. We will be in touch shortly.");
            window.dispatchEvent(new CustomEvent("launchloom:lead-submitted"));
          })
          .catch((error) => {
            setStatus(error instanceof Error ? error.message : "We could not send your request. Please try again.");
          })
          .finally(() => setPending(false));
      }}
    >
      <label>
        Your name
        <input
          required
          name="name"
          value={fields.name}
          onChange={(event) => setFields({ ...fields, name: event.target.value })}
          autoComplete="name"
        />
      </label>
      <label>
        Phone number
        <input
          required
          name="phone"
          value={fields.phone}
          onChange={(event) => setFields({ ...fields, phone: event.target.value })}
          autoComplete="tel"
        />
      </label>
      <label>
        Email address
        <input
          required
          type="email"
          name="email"
          value={fields.email}
          onChange={(event) => setFields({ ...fields, email: event.target.value })}
          autoComplete="email"
        />
      </label>
      <label>
        How can we help?
        <textarea
          required
          name="message"
          value={fields.message}
          onChange={(event) => setFields({ ...fields, message: event.target.value })}
        />
      </label>
      <button type="submit" disabled={pending}>
        {content.hero.primaryLabel}
      </button>
      <small role="status">{status || content.copy.formIntro || "We will follow up with the next useful step."}</small>
    </form>
  );
}

export function LocationMap({
  content,
  variant = "full",
}: {
  content: CreativeContent;
  variant?: "compact" | "full";
}) {
  const location = content.locationMap;
  if (!location?.available) return null;

  if (variant === "compact")
    return (
      <div
        className="launchloom-location-compact"
        data-runtime="location-map"
        data-location-integration="compact"
      >
        {location.address && <span>{location.address}</span>}
        {location.directionsHref && (
          <a href={location.directionsHref} target="_blank" rel="noopener noreferrer">
            Get directions <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    );

  return (
    <section
      className="launchloom-location-map"
      id="location"
      data-runtime="location-map"
      data-location-integration="full"
    >
      <div className="launchloom-location-map-copy">
        <span>Visit us</span>
        <h2>Find {content.brand.name}</h2>
        {location.address && <address>{location.address}</address>}
        {location.hours && <p>{location.hours}</p>}
        {location.directionsHref && (
          <a href={location.directionsHref} target="_blank" rel="noopener noreferrer">
            Open in Google Maps <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
      {location.embedHref && (
        <div className="launchloom-location-map-frame">
          <iframe
            src={location.embedHref}
            title={`Map showing ${content.brand.name}${location.address ? ` at ${location.address}` : ""}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      )}
    </section>
  );
}

export function SocialProof({
  content,
  runtime,
}: {
  content: CreativeContent;
  runtime?: CreativeRuntime;
}) {
  const proof = content.socialProof;
  const [reviews, setReviews] = useState<
    Array<{
      author?: string;
      authorUrl?: string;
      mapsUrl?: string;
      rating?: number;
      relativeTime?: string;
      text?: string;
    }>
  >([]);
  useEffect(() => {
    if (
      proof?.source !== "google_reviews" ||
      !runtime?.reviews?.apiUrl ||
      !runtime.reviews.token
    ) {
      setReviews([]);
      return undefined;
    }
    const controller = new AbortController();
    void fetch(
      `${runtime.reviews.apiUrl.replace(/\/$/u, "")}/api/google-reviews?token=${encodeURIComponent(runtime.reviews.token)}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Reviews are unavailable.");
        return response.json();
      })
      .then((payload) => {
        setReviews(
          Array.isArray(payload?.reviews) ? payload.reviews.slice(0, 3) : [],
        );
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setReviews([]);
      });
    return () => controller.abort();
  }, [proof?.source, runtime?.reviews?.apiUrl, runtime?.reviews?.token]);

  if (!content.hasSocialProof || !proof) return null;
  return (
    <section
      className="launchloom-social-proof"
      data-runtime="social-proof"
      data-source={proof.source}
    >
      {proof.heading && <h2>{proof.heading}</h2>}
      {proof.intro && <p>{proof.intro}</p>}
      {reviews.length > 0 && (
        <div className="launchloom-google-reviews" aria-live="polite">
          {reviews.map((review, index) => {
            const href = review.authorUrl || review.mapsUrl || "";
            return (
              <article key={`${review.author || "review"}-${index}`}>
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    {review.author || "Google Maps reviewer"}
                  </a>
                ) : (
                  <strong>{review.author || "Google Maps reviewer"}</strong>
                )}
                <p>
                  {"★".repeat(
                    Math.max(0, Math.min(5, Number(review.rating) || 0)),
                  )}{" "}
                  {review.relativeTime || ""}
                </p>
                {review.text && <p>{review.text}</p>}
              </article>
            );
          })}
        </div>
      )}
      {proof.points.length > 0 && (
        <div className="launchloom-proof-points">
          {proof.points.map((point) => (
            <p key={point}>{point}</p>
          ))}
        </div>
      )}
    </section>
  );
}

export function ChatLauncher() {
  return (
    <a className="launchloom-chat-launcher" href="#contact" data-runtime="chat-launcher">
      Got questions?
    </a>
  );
}

export default {
  ChatLauncher,
  ContactLinks,
  FAQList,
  LeadForm,
  LocationMap,
  SocialProof,
  resolveAsset,
  useReducedMotion,
};
