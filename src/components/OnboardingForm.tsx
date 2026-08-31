import { useMemo, useState } from "react";
import type { FormEvent } from "react";

type Place = {
  id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  hours?: string[];
  rating?: number;
  ratingCount?: number;
};

const steps = ["Business", "Offer", "Look & feel", "Confirm"];

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
  return blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }) : file;
}

export default function OnboardingForm() {
  const [step, setStep] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const progress = useMemo(() => `${((step + 1) / steps.length) * 100}%`, [step]);

  async function lookupPlace() {
    const query = (document.querySelector<HTMLInputElement>("#place-query")?.value || "").trim();
    if (!query) {
      setError("Add a business name, address, or Google Maps link first.");
      return;
    }
    setSearching(true);
    setError("");
    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't find that listing.");
      setPlace(result.place);
      const form = document.querySelector<HTMLFormElement>("#onboarding-form");
      if (form) {
        const set = (name: string, value?: string) => {
          const input = form.elements.namedItem(name) as HTMLInputElement | null;
          if (input && value) input.value = value;
        };
        set("businessName", result.place.name);
        set("address", result.place.address);
        set("phone", result.place.phone);
        set("website", result.place.website);
        set("placeId", result.place.id);
        set("googleMapsUrl", result.place.mapsUrl);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Place lookup failed.");
    } finally {
      setSearching(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const photoFields = ["logo", "photoOne", "photoTwo"];
    for (const name of photoFields) {
      const file = data.get(name);
      if (file instanceof File && file.size > 0) data.set(name, await compressImage(file));
    }
    const size = [...data.values()].reduce((total, value) => total + (value instanceof File ? value.size : 0), 0);
    if (size > 7_500_000) {
      setError("Your images are still too large. Keep the total below 7.5 MB and try again.");
      return;
    }

    setStatus("Submitting your brief…");
    setError("");
    try {
      const response = await fetch("/", { method: "POST", body: data });
      if (!response.ok) throw new Error("Submission failed. Please try once more.");
      setStatus("Received. We’re building your private preview and will share the review link shortly.");
      form.reset();
      setStep(0);
      setPlace(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submission failed.");
      setStatus("");
    }
  }

  return (
    <form
      id="onboarding-form"
      className="onboarding-form"
      name="onboarding"
      method="POST"
      data-netlify="true"
      data-netlify-honeypot="bot-field"
      encType="multipart/form-data"
      onSubmit={submit}
    >
      <input type="hidden" name="form-name" value="onboarding" />
      <input type="hidden" name="placeId" />
      <input type="hidden" name="googleMapsUrl" />
      <p className="sr-only"><label>Don’t fill this out <input name="bot-field" /></label></p>

      <div className="stepper" aria-label={`Step ${step + 1} of ${steps.length}`}>
        <div className="stepper-track"><span style={{ width: progress }} /></div>
        <span>Step {step + 1} of {steps.length} · {steps[step]}</span>
      </div>

      {step === 0 && <section className="form-step">
        <span className="eyebrow">Start with the facts</span>
        <h1>Let’s meet the business.</h1>
        <p>Start with a Google Maps listing. You’ll review every imported detail before we use it.</p>
        <div className="lookup-row">
          <label className="field grow">Business name, address, or Maps URL
            <input id="place-query" placeholder="e.g. Harbor Glow Wellness, Austin TX" />
          </label>
          <button className="button secondary" type="button" onClick={lookupPlace} disabled={searching}>{searching ? "Finding…" : "Find listing"}</button>
        </div>
        {place && <aside className="place-card">
          <div><strong>{place.name}</strong><span>{place.address}</span>{place.rating && <small>★ {place.rating} from {place.ratingCount?.toLocaleString()} Google reviews</small>}</div>
          <span className="google-attribution">Data from Google</span>
        </aside>}
        <div className="field-grid">
          <label className="field">Business name<input required name="businessName" placeholder="Your business name" /></label>
          <label className="field">Primary contact<input required name="contactName" placeholder="Your name" /></label>
          <label className="field">Email<input required type="email" name="email" placeholder="you@business.com" /></label>
          <label className="field">Phone<input required name="phone" placeholder="(555) 555-5555" /></label>
          <label className="field full">Street address<input required name="address" placeholder="123 Main Street, City, ST 00000" /></label>
          <label className="field">Website, if replacing<input name="website" placeholder="https://" /></label>
          <label className="field">Desired domain<input name="domain" placeholder="yourbusiness.com" /></label>
        </div>
      </section>}

      {step === 1 && <section className="form-step">
        <span className="eyebrow">The conversion brief</span>
        <h1>What should the site make happen?</h1>
        <div className="choice-grid">
          <label className="choice"><input type="radio" name="preset" value="wellness" defaultChecked /> <span><b>Wellness</b><small>Premium treatment, provider trust, consultation funnel.</small></span></label>
          <label className="choice"><input type="radio" name="preset" value="home-services" /> <span><b>Home services</b><small>Fast help, services, service areas, quote conversion.</small></span></label>
        </div>
        <div className="field-grid">
          <label className="field full">Core services<textarea required name="services" placeholder="One service per line. Include the most important service first." /></label>
          <label className="field full">Primary offer<textarea name="offer" placeholder="e.g. Free consultation, same-day service, $99 new customer offer" /></label>
          <label className="field full">Areas served<textarea required name="serviceAreas" placeholder="Cities, neighborhoods, or regions served" /></label>
          <label className="field full">What makes you the obvious choice?<textarea required name="differentiators" placeholder="Experience, guarantees, credentials, response time, outcomes…" /></label>
          <label className="field full">Desired call to action<input required name="primaryCta" defaultValue="Request a consultation" /></label>
        </div>
      </section>}

      {step === 2 && <section className="form-step">
        <span className="eyebrow">Make it feel like you</span>
        <h1>Give us your visual direction.</h1>
        <div className="field-grid">
          <label className="field">Primary color<input name="primaryColor" type="color" defaultValue="#205d51" /></label>
          <label className="field">Tone<select name="tone" defaultValue="confident"><option value="calm">Calm and refined</option><option value="confident">Confident and direct</option><option value="warm">Warm and local</option></select></label>
          <label className="field full">Anything we should avoid?<textarea name="avoid" placeholder="Words, claims, colors, competitors, visual styles…" /></label>
          <label className="field">Logo<input name="logo" type="file" accept="image/*" /></label>
          <label className="field">Photo 1<input name="photoOne" type="file" accept="image/*" /></label>
          <label className="field">Photo 2<input name="photoTwo" type="file" accept="image/*" /></label>
          <label className="field full">Lead notification email<input required type="email" name="leadEmail" placeholder="leads@yourbusiness.com" /></label>
        </div>
        <p className="form-note">Images are compressed in your browser. Keep the combined upload under 7.5 MB.</p>
      </section>}

      {step === 3 && <section className="form-step">
        <span className="eyebrow">One last check</span>
        <h1>You control the facts.</h1>
        <p>We use the details you confirm here to write the site. Google listing data is only used to help you prefill the brief.</p>
        <label className="consent"><input type="checkbox" required name="confirmAccuracy" value="yes" /> <span>I confirm the business details, services, and claims submitted here are accurate and approved for use on my website.</span></label>
        <label className="consent"><input type="checkbox" required name="confirmRights" value="yes" /> <span>I have permission to use any logo, photograph, and testimonial I upload.</span></label>
      </section>}

      {error && <p className="form-message error" role="alert">{error}</p>}
      {status && <p className="form-message success" role="status">{status}</p>}
      <footer className="form-actions">
        {step > 0 && <button type="button" className="text-button" onClick={() => setStep(step - 1)}>Back</button>}
        {step < steps.length - 1 ? <button type="button" className="button" onClick={() => setStep(step + 1)}>Continue</button> : <button type="submit" className="button">Create my preview</button>}
      </footer>
    </form>
  );
}
