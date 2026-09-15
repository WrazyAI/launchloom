import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";

type Place = {
  id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  rating?: number;
  ratingCount?: number;
};
export type SeoIntake = {
  priorityService: string;
  searchPhrases: string;
  customerProblems: string;
  excludedServices: string;
  priorityLocations: string;
  competitorUrls: string;
  seoNotSure?: "yes";
};
const steps = ["Business", "Services", "Search language", "Brand", "Confirm"];
const apiBase = (import.meta.env.PUBLIC_LAUNCHLOOM_API_URL || "").replace(
  /\/$/,
  "",
);

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
  return blob
    ? new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
        type: "image/webp",
      })
    : file;
}

type ImagePreview = {
  url: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
};

function imageSize(bytes: number) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

function BrandColorField() {
  const [color, setColor] = useState("#205d51");

  return (
    <label className="field brand-color-field">
      Primary color
      <span className="brand-color-control">
        <input
          aria-label="Choose primary brand color"
          name="primaryColor"
          type="color"
          defaultValue={color}
          onInput={(event) => setColor(event.currentTarget.value)}
        />
        <span className="brand-color-value">
          <strong>{color.toUpperCase()}</strong>
          <small>Choose color</small>
        </span>
      </span>
      <small className="brand-color-note">
        Very bright colors stay focused on buttons and accents, not large page
        backgrounds.
      </small>
    </label>
  );
}

function ImageUploadField({
  name,
  label,
  optional = false,
}: {
  name: string;
  label: string;
  optional?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [dragging, setDragging] = useState(false);

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
  }

  function previewFile(file?: File) {
    if (!file?.type.startsWith("image/")) return;
    clearPreview();
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreview({ url, name: file.name, size: file.size });
  }

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    const reset = () => clearPreview();
    form?.addEventListener("reset", reset);
    return () => {
      form?.removeEventListener("reset", reset);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function removeFile() {
    if (inputRef.current) inputRef.current.value = "";
    clearPreview();
  }

  function acceptDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file?.type.startsWith("image/") || !inputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    previewFile(file);
  }

  return (
    <div
      className={`field image-upload${dragging ? " is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={acceptDrop}
    >
      <div className="image-upload-label">
        <label htmlFor={inputId}>{label}</label>
        {optional && <span>Optional</span>}
      </div>
      <input
        ref={inputRef}
        className="image-upload-input"
        id={inputId}
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => previewFile(event.currentTarget.files?.[0])}
      />
      {preview ? (
        <figure className="image-preview-card">
          <img
            src={preview.url}
            alt={`Preview of ${label.toLowerCase()}`}
            onLoad={(event) => {
              const image = event.currentTarget;
              setPreview((current) =>
                current?.url === preview.url
                  ? {
                      ...current,
                      width: image.naturalWidth,
                      height: image.naturalHeight,
                    }
                  : current,
              );
            }}
          />
          <figcaption>
            <strong title={preview.name}>{preview.name}</strong>
            <span>
              {preview.width && preview.height
                ? `${preview.width} × ${preview.height} · `
                : ""}
              {imageSize(preview.size)}
            </span>
            <div className="image-preview-actions">
              <label htmlFor={inputId}>Replace</label>
              <button type="button" onClick={removeFile}>
                Remove
              </button>
            </div>
          </figcaption>
        </figure>
      ) : (
        <label className="image-upload-empty" htmlFor={inputId}>
          <span aria-hidden="true">＋</span>
          <strong>Choose an image</strong>
          <small>PNG, JPEG, or WebP. You can also drop it here.</small>
        </label>
      )}
    </div>
  );
}

export default function OnboardingForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const [showLookup, setShowLookup] = useState(true);
  const [seoNotSure, setSeoNotSure] = useState(false);
  const [submissionId, setSubmissionId] = useState(
    () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  );
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const progress = useMemo(
    () => `${((step + 1) / steps.length) * 100}%`,
    [step],
  );
  const draftValue = (name: string) => draftRef.current[name] || "Not provided";

  function captureDraft() {
    const form = formRef.current;
    if (!form) return;
    const next: Record<string, string> = {};
    for (const field of form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea")) {
      if (!field.name || field.type === "file") continue;
      if (field instanceof HTMLInputElement && field.type === "radio") {
        if (field.checked) next[field.name] = field.value;
        continue;
      }
      if (field instanceof HTMLInputElement && field.type === "checkbox") {
        if (field.checked) next[field.name] = field.value || "yes";
        continue;
      }
      next[field.name] = field.value;
    }
    const placeQuery = form.querySelector<HTMLInputElement>("#place-query");
    if (placeQuery) next.placeQuery = placeQuery.value;
    draftRef.current = next;
  }

  function restoreDraft() {
    const form = formRef.current;
    if (!form) return;
    for (const field of form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea")) {
      if (!field.name || field.type === "file") continue;
      const value = draftRef.current[field.name];
      if (value === undefined) continue;
      if (field instanceof HTMLInputElement && field.type === "radio") {
        field.checked = field.value === value;
      } else if (
        field instanceof HTMLInputElement &&
        field.type === "checkbox"
      ) {
        field.checked = field.value === value;
      } else {
        field.value = value;
        if (field instanceof HTMLInputElement && field.type === "color")
          field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    const placeQuery = form.querySelector<HTMLInputElement>("#place-query");
    if (placeQuery && draftRef.current.placeQuery !== undefined)
      placeQuery.value = draftRef.current.placeQuery;
  }

  useEffect(() => {
    restoreDraft();
  }, [step]);

  function advance() {
    const current = formRef.current?.querySelector<HTMLElement>(
      `[data-step="${step}"]`,
    );
    for (const field of current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea") || [])
      if (!field.disabled && !field.reportValidity()) return;
    captureDraft();
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function lookupPlace() {
    const query = (
      document.querySelector<HTMLInputElement>("#place-query")?.value || ""
    ).trim();
    if (!query)
      return setError(
        "Add a business name, address, or Google Maps link first.",
      );
    setSearching(true);
    setError("");
    try {
      if (!apiBase)
        throw new Error("The LaunchLoom service is not configured yet.");
      const response = await fetch(`${apiBase}/api/places`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result = (await response.json()) as {
        place?: Place;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "We couldn't find that listing.");
      if (!result.place) throw new Error("We couldn't find that listing.");
      setPlace(result.place);
      const set = (name: string, value?: string) => {
        const input = formRef.current?.elements.namedItem(
          name,
        ) as HTMLInputElement | null;
        if (input && value) {
          input.value = value;
          draftRef.current[name] = value;
        }
      };
      set("businessName", result.place.name);
      set("address", result.place.address);
      set("phone", result.place.phone);
      set("website", result.place.website);
      set("placeId", result.place.id);
      set("googleMapsUrl", result.place.mapsUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Place lookup failed.");
    } finally {
      setSearching(false);
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    for (const name of [
      "logo",
      "photoOne",
      "photoTwo",
      "photoThree",
      "teamPhoto",
    ]) {
      const file = data.get(name);
      if (file instanceof File && file.size > 0)
        data.set(name, await compressImage(file));
    }
    const bytes = [...data.values()].reduce(
      (total, value) => total + (value instanceof File ? value.size : 0),
      0,
    );
    if (bytes > 7_500_000)
      return setError(
        "Your images are still too large. Keep the total below 7.5 MB and try again.",
      );
    setStatus("Uploading your brief…");
    setSuccessMessage("");
    setError("");
    try {
      if (!apiBase)
        throw new Error("The LaunchLoom service is not configured yet.");
      const assets: Record<string, string> = {};
      for (const slot of [
        "logo",
        "photoOne",
        "photoTwo",
        "photoThree",
        "teamPhoto",
      ]) {
        const file = data.get(slot);
        if (!(file instanceof File) || !file.size) continue;
        const upload = new FormData();
        upload.set("submissionId", submissionId);
        upload.set("slot", slot);
        upload.set("file", file);
        const response = await fetch(`${apiBase}/api/upload`, {
          method: "POST",
          body: upload,
        });
        const result = (await response.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!response.ok || !result.url)
          throw new Error(
            result.error ||
              "We couldn’t upload one of your images. Please try once more.",
          );
        assets[slot] = result.url;
      }
      const intake = Object.fromEntries(
        [...data.entries()].filter(([, value]) => typeof value === "string"),
      ) as Record<string, string>;
      intake.submissionId = submissionId;
      const handoff = await fetch(`${apiBase}/api/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...intake, assets }),
      });
      const handoffResult = (await handoff.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!handoff.ok)
        throw new Error(
          handoffResult.error ||
            "We couldn’t start your preview. Please try once more.",
        );
      setStatus("");
      setSuccessMessage(
        "Received. We’ll email your preview link as soon as it’s ready.",
      );
      form.reset();
      draftRef.current = {};
      setStep(0);
      setPlace(null);
      setShowLookup(true);
      setSeoNotSure(false);
      setSubmissionId(
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submission failed.");
      setStatus("");
    }
  }

  return (
    <form
      ref={formRef}
      id="onboarding-form"
      className="onboarding-form"
      encType="multipart/form-data"
      onSubmit={submit}
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="placeId" />
      <input type="hidden" name="googleMapsUrl" />
      <input
        type="hidden"
        name="gmbSkipped"
        value={showLookup ? "no" : "yes"}
      />
      <p className="sr-only">
        <label>
          Don’t fill this out <input name="bot-field" />
        </label>
      </p>
      <div
        className="stepper"
        aria-label={`Step ${step + 1} of ${steps.length}`}
      >
        <div className="stepper-track">
          <span style={{ width: progress }} />
        </div>
        <span>
          Step {step + 1} of {steps.length} · {steps[step]}
        </span>
      </div>
      <section
        className="form-step"
        data-step="0"
        hidden={step !== 0}
        aria-hidden={step !== 0}
      >
        <span className="eyebrow">Start with the facts</span>
        <h1>Let’s meet the business.</h1>
        <p>
          Google is optional. Use it to prefill details, or enter everything
          yourself below.
        </p>
        {showLookup ? (
          <>
            <div className="lookup-row">
              <label className="field grow">
                Business name, address, or Maps URL
                <input
                  id="place-query"
                  placeholder="e.g. Harbor Glow Wellness, Austin TX"
                />
              </label>
              <button
                className="button secondary"
                type="button"
                onClick={lookupPlace}
                disabled={searching}
              >
                {searching ? "Finding…" : "Find listing"}
              </button>
            </div>
            <div className="manual-entry">
              <span>I don’t have a Google Business Profile</span>
              <button
                className="button manual-entry-button"
                type="button"
                onClick={() => {
                  setShowLookup(false);
                  setPlace(null);
                }}
              >
                Enter details manually
              </button>
            </div>
            {place && (
              <aside className="place-card">
                <div>
                  <strong>{place.name}</strong>
                  <span>{place.address}</span>
                  {place.rating && (
                    <small>
                      ★ {place.rating} from{" "}
                      {place.ratingCount?.toLocaleString()} Google reviews
                    </small>
                  )}
                </div>
                <span className="google-attribution">Data from Google</span>
              </aside>
            )}
          </>
        ) : (
          <aside className="place-card">
            <div>
              <strong>Manual details</strong>
              <span>
                No Google profile needed. We’ll use the facts you enter below.
              </span>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowLookup(true)}
            >
              Use Google lookup instead
            </button>
          </aside>
        )}
        <div className="field-grid">
          <label className="field">
            Business name
            <input
              required
              name="businessName"
              placeholder="Your business name"
            />
          </label>
          <label className="field">
            Your name
            <input required name="contactName" placeholder="Your name" />
          </label>
          <label className="field">
            Email for your preview
            <input
              required
              type="email"
              name="email"
              placeholder="you@business.com"
            />
          </label>
          <label className="field">
            Phone
            <input required name="phone" placeholder="(555) 555-5555" />
          </label>
          <label className="field full">
            Street address
            <input
              required
              name="address"
              placeholder="123 Main Street, City, ST 00000"
            />
          </label>
          <label className="field">
            Current website, if replacing
            <input name="website" placeholder="https://" />
          </label>
          <label className="field">
            Desired domain
            <input name="domain" placeholder="yourbusiness.com" />
          </label>
        </div>
      </section>
      <section
        className="form-step"
        data-step="1"
        hidden={step !== 1}
        aria-hidden={step !== 1}
      >
        <span className="eyebrow">The conversion brief</span>
        <h1>What should the site make happen?</h1>
        <div className="choice-grid">
          <label className="choice">
            <input type="radio" name="preset" value="wellness" defaultChecked />
            <span>
              <b>Premium wellness</b>
              <small>
                Care-led consultation funnel with a calm, elevated feel.
              </small>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="preset" value="home-services" />
            <span>
              <b>Home services</b>
              <small>
                Fast trust-building pages for services and local areas.
              </small>
            </span>
          </label>
        </div>
        <div className="choice-grid">
          <label className="choice">
            <input
              type="radio"
              name="businessModel"
              value="local"
              defaultChecked
            />
            <span>
              <b>Local service business</b>
              <small>
                You serve clients in person, at their home, or in your local
                area.
              </small>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="businessModel" value="online" />
            <span>
              <b>Remote or online service</b>
              <small>
                You primarily serve clients digitally or beyond one location.
              </small>
            </span>
          </label>
        </div>
        <div className="field-grid">
          <label className="field full">
            Core services
            <textarea
              required
              name="services"
              placeholder="One service per line. Put the most important service first."
            />
          </label>
          <label className="field full">
            Primary offer
            <textarea
              name="offer"
              placeholder="e.g. Free consultation, same-day service, or a new-customer offer"
            />
          </label>
          <label className="field full">
            Areas served
            <textarea
              required
              name="serviceAreas"
              placeholder="Cities, neighborhoods, regions, or ‘remote / nationwide’"
            />
          </label>
          <label className="field full">
            What makes you the obvious choice?
            <textarea
              required
              name="differentiators"
              placeholder="Experience, credentials, response time, guarantees, approach, results…"
            />
          </label>
          <label className="field">
            Business category
            <select name="industry" defaultValue="other">
              <option value="wellness">Wellness, health, or care</option>
              <option value="home-services">Home services or trades</option>
              <option value="technology">Technology or software</option>
              <option value="professional-services">
                Professional services
              </option>
              <option value="hospitality">Hospitality or food</option>
              <option value="real-estate">Real estate or property</option>
              <option value="other">Another kind of business</option>
            </select>
          </label>
        </div>
        <fieldset className="cta-options">
          <legend>What should the primary button do?</legend>
          <label>
            <input
              type="radio"
              name="primaryCta"
              value="Book a consultation"
              defaultChecked
            />{" "}
            Book a call / consultation
          </label>
          <label>
            <input type="radio" name="primaryCta" value="Call now" /> Call now
          </label>
          <label>
            <input type="radio" name="primaryCta" value="Request a quote" />{" "}
            Request a quote
          </label>
          <label>
            <input type="radio" name="primaryCta" value="Get directions" /> Get
            directions
          </label>
          <p className="form-note">
            We will add an interactive map when your exact business address or
            confirmed Google listing is available.
          </p>
        </fieldset>
        <fieldset className="cta-options">
          <legend>Optional website assistant</legend>
          <label>
            <input type="checkbox" name="conversionAiChat" value="yes" /> Add an
            AI answers widget
          </label>
          <p className="form-note">
            It answers from approved website facts and sends visitors to your
            primary next step when the site does not contain the answer.
          </p>
        </fieldset>
      </section>
      <section
        className="form-step"
        data-step="2"
        hidden={step !== 2}
        aria-hidden={step !== 2}
      >
        <span className="eyebrow">Use your customers' words</span>
        <h1>How do people search for this?</h1>
        <p>
          Share the phrases customers use when they need help. We will validate
          them before using them in the website strategy.
        </p>
        <label className="choice seo-not-sure">
          <input
            type="checkbox"
            name="seoNotSure"
            value="yes"
            checked={seoNotSure}
            onChange={(event) => setSeoNotSure(event.currentTarget.checked)}
          />
          <span>
            <b>I am not sure which keywords to use</b>
            <small>
              Start from my confirmed services, locations, and customer problems
              instead.
            </small>
          </span>
        </label>
        <div className="field-grid">
          <label className="field full">
            Priority service
            <input
              name="priorityService"
              placeholder="The service you most want customers to find"
            />
          </label>
          <label className="field full" hidden={seoNotSure}>
            Search phrases customers might use
            <textarea
              name="searchPhrases"
              disabled={seoNotSure}
              placeholder="One phrase per line, ideally 3 to 8 phrases"
            />
          </label>
          <label className="field full">
            What problem would a customer describe?
            <textarea
              name="customerProblems"
              placeholder="Use their words. Example: The drain keeps backing up after we run the dishwasher."
            />
          </label>
          <label className="field full">
            Services or claims we must not include
            <textarea name="excludedServices" placeholder="One item per line" />
          </label>
          <label className="field full">
            Priority locations
            <textarea
              name="priorityLocations"
              placeholder="The most important confirmed service areas, one per line"
            />
          </label>
          <label className="field full">
            Competitor websites for research
            <textarea
              name="competitorUrls"
              placeholder="Up to 3 public website URLs, one per line"
            />
          </label>
        </div>
        <p className="form-note">
          Your phrases are treated as client-supplied ideas, not verified search
          volume or ranking claims.
        </p>
      </section>
      <section
        className="form-step"
        data-step="3"
        hidden={step !== 3}
        aria-hidden={step !== 3}
      >
        <span className="eyebrow">Make it feel like you</span>
        <h1>Give us your visual direction.</h1>
        <fieldset className="cta-options">
          <legend>Which direction feels right?</legend>
          <label>
            <input
              type="radio"
              name="stylePreference"
              value="clean-modern"
              defaultChecked
            />{" "}
            Clean &amp; modern
          </label>
          <label>
            <input type="radio" name="stylePreference" value="warm-friendly" />{" "}
            Warm &amp; friendly
          </label>
          <label>
            <input type="radio" name="stylePreference" value="bold-premium" />{" "}
            Bold &amp; premium
          </label>
        </fieldset>
        <div className="field-grid">
          <BrandColorField />
          <label className="field">
            Tone
            <select name="tone" defaultValue="confident">
              <option value="calm">Calm and refined</option>
              <option value="confident">Confident and direct</option>
              <option value="warm">Warm and local</option>
            </select>
          </label>
          <label className="field full">
            Anything else about the brand?
            <textarea
              name="brandNotes"
              placeholder="Colors or fonts you love (or hate), competitors to avoid resembling, words we should use or avoid…"
            />
          </label>
          <ImageUploadField name="logo" label="Logo" optional />
          <ImageUploadField name="photoOne" label="Business photo 1" optional />
          <ImageUploadField name="photoTwo" label="Business photo 2" optional />
          <ImageUploadField
            name="photoThree"
            label="Business photo 3"
            optional
          />
          <ImageUploadField
            name="teamPhoto"
            label="Owner or team photo"
            optional
          />
          <label className="field full">
            Social links (optional)
            <input
              name="socialLinks"
              placeholder="Instagram, Facebook, LinkedIn, etc."
            />
          </label>
          <label className="field full">
            Lead notification email
            <input
              required
              type="email"
              name="leadEmail"
              placeholder="leads@yourbusiness.com"
            />
          </label>
        </div>
        <p className="form-note">
          Use 4–6 strong photos if you have them. Images are compressed in your
          browser; keep total uploads under 7.5 MB.
        </p>
      </section>
      <section
        className="form-step"
        data-step="4"
        hidden={step !== 4}
        aria-hidden={step !== 4}
      >
        <span className="eyebrow">One last check</span>
        <h1>You control the facts.</h1>
        <p>
          Review the brief below. We use confirmed facts and bounded search
          research to write the site.
        </p>
        <dl className="confirmation-summary">
          <div>
            <dt>Business</dt>
            <dd>{draftValue("businessName")}</dd>
          </div>
          <div>
            <dt>Priority service</dt>
            <dd>{draftValue("priorityService")}</dd>
          </div>
          <div>
            <dt>Confirmed services</dt>
            <dd>{draftValue("services")}</dd>
          </div>
          <div>
            <dt>Search phrases</dt>
            <dd>
              {seoNotSure
                ? "Research from confirmed business context"
                : draftValue("searchPhrases")}
            </dd>
          </div>
          <div>
            <dt>Priority locations</dt>
            <dd>{draftValue("priorityLocations")}</dd>
          </div>
          <div>
            <dt>Competitor websites</dt>
            <dd>{draftValue("competitorUrls")}</dd>
          </div>
          <div>
            <dt>Customer problem language</dt>
            <dd>{draftValue("customerProblems")}</dd>
          </div>
          <div>
            <dt>Do not include</dt>
            <dd>{draftValue("excludedServices")}</dd>
          </div>
        </dl>
        <label className="consent">
          <input type="checkbox" required name="confirmAccuracy" value="yes" />
          <span>
            I confirm the business details, services, and claims submitted here
            are accurate and approved for use on my website.
          </span>
        </label>
        <label className="consent">
          <input
            type="checkbox"
            required
            name="confirmSeoResearch"
            value="yes"
          />
          <span>
            I approve bounded research of the phrases, locations, and public
            competitor URLs in this brief. Research suggestions will not replace
            my confirmed business facts.
          </span>
        </label>
        <label className="consent">
          <input type="checkbox" required name="confirmRights" value="yes" />
          <span>
            I have permission to use any logo, photograph, and testimonial I
            upload.
          </span>
        </label>
      </section>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {status && <p className="form-message progress">{status}</p>}
      {successMessage && (
        <aside
          className="submission-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="submission-toast-icon" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>Brief received</strong>
            <p>{successMessage}</p>
          </div>
          <button
            type="button"
            className="submission-toast-close"
            aria-label="Dismiss confirmation"
            onClick={() => setSuccessMessage("")}
          >
            ×
          </button>
        </aside>
      )}
      <footer className="form-actions">
        {step > 0 && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              captureDraft();
              setStep(step - 1);
            }}
          >
            Back
          </button>
        )}
        {step < steps.length - 1 ? (
          <button type="button" className="button" onClick={advance}>
            Continue
          </button>
        ) : (
          <button type="submit" className="button">
            Create my preview
          </button>
        )}
      </footer>
    </form>
  );
}
