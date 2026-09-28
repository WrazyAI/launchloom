import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { createClientIntakeV2Submission } from "../lib/client-intake-v2.mjs";
import {
  addIntakeService,
  MAX_INTAKE_SERVICES,
  normalizeIntakeServices,
  removeIntakeService,
} from "../lib/intake-service-list";

type Place = {
  id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  rating?: number;
  ratingCount?: number;
  primaryType?: string;
  types?: string[];
  location?: { latitude: number; longitude: number } | null;
};
type InviteState = "loading" | "valid" | "invalid" | "accepted";
const steps = ["Business", "Services", "Brand"];
const apiBase = (import.meta.env.PUBLIC_LAUNCHLOOM_API_URL || "").replace(
  /\/$/,
  "",
);

function decodeInviteId(token: string) {
  try {
    const encoded = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(encoded)) as { inviteId?: string }).inviteId || "unknown";
  } catch {
    return "unknown";
  }
}

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
  const [inviteToken, setInviteToken] = useState("");
  const [inviteState, setInviteState] = useState<InviteState>("loading");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [servicesValue, setServicesValue] = useState("");
  const [serviceEntry, setServiceEntry] = useState("");
  const [suggestedServices, setSuggestedServices] = useState<string[]>([]);
  const [suggestingServices, setSuggestingServices] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [brandColorPicker, setBrandColorPicker] = useState("#245d51");
  const [hasExistingBrandColor, setHasExistingBrandColor] = useState(false);
  const [submissionId, setSubmissionId] = useState<string>(
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
  const selectedServices = useMemo(
    () => normalizeIntakeServices(servicesValue),
    [servicesValue],
  );
  const draftValue = (name: string) => draftRef.current[name] || "Not provided";

  useEffect(() => {
    const tokenKey = "launchloom-onboarding-invite";
    let token = new URLSearchParams(window.location.hash.slice(1)).get("invite") || "";
    if (!token) {
      try {
        token = (JSON.parse(sessionStorage.getItem(tokenKey) || "{}") as { token?: string }).token || "";
      } catch {
        token = "";
      }
    }
    if (!token) {
      setInviteState("invalid");
      return;
    }
    setInviteToken(token);
    let inviteId = "unknown";
    try {
      const encoded = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(encoded)) as { inviteId?: string };
      if (claims.inviteId) inviteId = claims.inviteId;
    } catch {
      sessionStorage.removeItem(tokenKey);
      setInviteState("invalid");
      return;
    }
    sessionStorage.setItem(tokenKey, JSON.stringify({ inviteId, token }));
    const storageKey = `launchloom-onboarding-submission:${inviteId}`;
    const payloadKey = `launchloom-onboarding-payload:${inviteId}`;
    const savedSubmissionId = sessionStorage.getItem(storageKey);
    const currentSubmissionId = savedSubmissionId || submissionId;
    if (!savedSubmissionId) sessionStorage.setItem(storageKey, currentSubmissionId);
    setSubmissionId(currentSubmissionId);

    let cancelled = false;
    void (async () => {
      try {
        if (!apiBase) throw new Error("The LaunchLoom service is unavailable.");
        const response = await fetch(`${apiBase}/api/onboarding-invites/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, submissionId: currentSubmissionId }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          valid?: boolean;
          accepted?: boolean;
          clientEmail?: string | null;
        };
        if (cancelled) return;
        const savedPayload = sessionStorage.getItem(payloadKey);
        if (savedPayload) {
          const pending = JSON.parse(savedPayload) as Record<string, unknown>;
          draftRef.current = Object.fromEntries(
            Object.entries(pending).filter(([, value]) => typeof value === "string"),
          ) as Record<string, string>;
          setServicesValue(
            normalizeIntakeServices(String(pending.services || "")).join("\n"),
          );
          const savedBrandColor = String(pending.brandColor || "");
          if (/^#[0-9a-f]{6}$/iu.test(savedBrandColor)) {
            setBrandColorPicker(savedBrandColor);
            setHasExistingBrandColor(true);
          }
        }
        if (result.accepted) {
          if (savedPayload) {
            const pending = JSON.parse(savedPayload) as Record<string, unknown>;
            try {
              const retry = await fetch(`${apiBase}/api/intake`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...pending, inviteToken: token, submissionId: currentSubmissionId }),
              });
              if (!retry.ok) {
                const failure = (await retry.json().catch(() => ({}))) as { error?: string };
                throw new Error(failure.error || "The saved submission could not be retried yet.");
              }
              sessionStorage.removeItem(payloadKey);
              sessionStorage.removeItem(tokenKey);
              sessionStorage.removeItem(storageKey);
              setInviteState("accepted");
              return;
            } catch (retryError) {
              if (cancelled) return;
              setError(retryError instanceof Error ? retryError.message : "The saved submission could not be retried yet.");
              setInviteState("valid");
              return;
            }
          }
          sessionStorage.removeItem(tokenKey);
          sessionStorage.removeItem(storageKey);
          setInviteState("accepted");
          return;
        }
        if (!response.ok || !result.valid) throw new Error("Invitation is unavailable.");
        setInvitedEmail(result.clientEmail || "");
        if (result.clientEmail) draftRef.current.email = result.clientEmail;
        setInviteState("valid");
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      } catch {
        if (!cancelled) setInviteState("invalid");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function captureDraft(overrides: Record<string, string> = {}) {
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
    Object.assign(next, overrides);
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
      if (field.name === "brandColorPicker" && field instanceof HTMLInputElement) {
        if (/^#[0-9a-f]{6}$/iu.test(value)) setBrandColorPicker(value);
      }
      if (field.name === "brandColor" && /^#[0-9a-f]{6}$/iu.test(value)) {
        setBrandColorPicker(value);
        setHasExistingBrandColor(true);
      }
      if (field instanceof HTMLInputElement && field.type === "radio") {
        field.checked = field.value === value;
      } else if (
        field instanceof HTMLInputElement &&
        field.type === "checkbox"
      ) {
        field.checked = field.value === value;
      } else {
        field.value = value;
      }
    }
    const placeQuery = form.querySelector<HTMLInputElement>("#place-query");
    if (placeQuery && draftRef.current.placeQuery !== undefined)
      placeQuery.value = draftRef.current.placeQuery;
  }

  useEffect(() => {
    restoreDraft();
  }, [step, inviteState]);

  function advance() {
    let normalizedServices: string | undefined;
    if (step === 1) {
      let nextServices = selectedServices;
      if (serviceEntry.trim()) {
        const result = addIntakeService(servicesValue, serviceEntry);
        if (result.status === "limit") {
          setSuggestionMessage("Remove a service before adding another. Choose up to five.");
          return;
        }
        nextServices = result.services;
        setServicesValue(nextServices.join("\n"));
        setServiceEntry("");
      }
      normalizedServices = nextServices.join("\n");
      if (!nextServices.length) {
        formRef.current
          ?.querySelector<HTMLInputElement>("[data-service-entry]")
          ?.reportValidity();
        return;
      }
    }
    const current = formRef.current?.querySelector<HTMLElement>(
      `[data-step="${step}"]`,
    );
    for (const field of current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea") || [])
      if (!field.disabled && !field.reportValidity()) return;
    captureDraft(
      normalizedServices === undefined ? {} : { services: normalizedServices },
    );
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  function commitServiceEntry() {
    const result = addIntakeService(servicesValue, serviceEntry);
    if (result.status === "empty") return;
    if (result.status === "limit") {
      setSuggestionMessage("Remove a service before adding another. Choose up to five.");
      return;
    }
    if (result.status === "added") {
      setServicesValue(result.services.join("\n"));
      setSuggestionMessage("");
    } else {
      setSuggestionMessage("That service is already on your list.");
    }
    setServiceEntry("");
  }

  function removeServiceChip(service: string) {
    setServicesValue(removeIntakeService(servicesValue, service).join("\n"));
    setSuggestionMessage("");
  }

  async function suggestServices() {
    const form = formRef.current;
    const value = (name: string) => {
      const field = form?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      return field?.value?.trim() || "";
    };
    setSuggestingServices(true);
    setSuggestionMessage("");
    try {
      const response = await fetch(`${apiBase}/api/service-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteToken,
          businessName: value("businessName"),
          category: value("industry"),
          primaryType: place?.primaryType || "",
          placeTypes: place?.types || [],
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        suggestions?: string[];
        warning?: string | null;
      };
      if (!response.ok) throw new Error(result.warning || "Suggestions are unavailable.");
      setSuggestedServices(Array.isArray(result.suggestions) ? result.suggestions.slice(0, 5) : []);
      setSuggestionMessage(result.warning || "Select only services your business offers.");
    } catch (cause) {
      setSuggestedServices([]);
      setSuggestionMessage(cause instanceof Error ? cause.message : "Enter your services manually.");
    } finally {
      setSuggestingServices(false);
    }
  }

  function toggleSuggestedService(service: string, selected: boolean) {
    if (selected) {
      const result = addIntakeService(servicesValue, service);
      if (result.status === "limit") {
        setSuggestionMessage("Remove a service before adding another. Choose up to five.");
        return;
      }
      setServicesValue(result.services.join("\n"));
      setSuggestionMessage("");
      return;
    }
    removeServiceChip(service);
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
        body: JSON.stringify({ query, inviteToken }),
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
      const payloadKey = `launchloom-onboarding-payload:${decodeInviteId(inviteToken)}`;
      let assets: Record<string, string> = {};
      try {
        const saved = JSON.parse(sessionStorage.getItem(payloadKey) || "{}") as { assets?: Record<string, string> };
        if (saved.assets && typeof saved.assets === "object") assets = { ...saved.assets };
      } catch { /* the current file selections remain available */ }
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
        upload.set("inviteToken", inviteToken);
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
      const formFields = Object.fromEntries(
        [...data.entries()].filter(([, value]) => typeof value === "string"),
      ) as Record<string, string>;
      const payload = createClientIntakeV2Submission(formFields, {
        submissionId,
        inviteToken,
        assets,
      });
      sessionStorage.setItem(payloadKey, JSON.stringify(payload));
      const handoff = await fetch(`${apiBase}/api/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      setSuccessMessage("Received. We’ll email your preview link as soon as it’s ready.");
      sessionStorage.removeItem(payloadKey);
      sessionStorage.removeItem(`launchloom-onboarding-submission:${decodeInviteId(inviteToken)}`);
      sessionStorage.removeItem("launchloom-onboarding-invite");
      setInviteState("accepted");
      form.reset();
      draftRef.current = {};
      setStep(0);
      setPlace(null);
      setShowLookup(true);
      setSubmissionId(
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submission failed.");
      setStatus("");
    }
  }

  if (inviteState !== "valid")
    return (
      <section className="invite-gate" role="status" aria-live="polite">
        <span className="eyebrow">Private business intake</span>
        <h1>{inviteState === "accepted" ? "Your details are with us." : inviteState === "loading" ? "Checking your invitation…" : "This invitation is unavailable."}</h1>
        <p>{inviteState === "accepted" ? "Your intake has been received and processing has started. We’ll email you with an update." : inviteState === "loading" ? "Please wait while we verify this private link." : "Ask the person who invited you for a current onboarding link."}</p>
      </section>
    );

  return (
    <form
      ref={formRef}
      id="onboarding-form"
      className="onboarding-form"
      encType="multipart/form-data"
      onSubmit={submit}
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="inviteToken" value={inviteToken} />
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
              defaultValue={invitedEmail}
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
        <span className="eyebrow">Your services and area</span>
        <h1>What should customers find you for?</h1>
        <p>
          Tell us what you actually offer and where you work. We&apos;ll learn
          about the local market and plan the website after you submit.
        </p>
        <div className="field-grid">
          <div className="field full service-picker">
            <label htmlFor="service-entry">
              What services do you want people to find you for?
            </label>
            <input type="hidden" name="services" value={servicesValue} />
            <div className="service-chips" role="list" aria-label="Confirmed services">
              {selectedServices.length ? selectedServices.map((service) => (
                <span className="service-chip" role="listitem" key={service}>
                  <span>{service}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${service}`}
                    onClick={() => removeServiceChip(service)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              )) : <span className="service-chips-empty">Your confirmed services will appear here.</span>}
            </div>
            <div className="service-entry-row">
              <input
                id="service-entry"
                data-service-entry
                aria-label="Add a core service"
                aria-describedby="service-picker-help"
                type="text"
                value={serviceEntry}
                disabled={selectedServices.length >= MAX_INTAKE_SERVICES}
                required={selectedServices.length === 0}
                placeholder={selectedServices.length >= MAX_INTAKE_SERVICES ? "Remove a service to add another" : "Type a service and press Enter"}
                onChange={(event) => setServiceEntry(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitServiceEntry();
                  }
                }}
                onBlur={() => {
                  if (serviceEntry.trim()) commitServiceEntry();
                }}
              />
              <button
                className="button secondary service-add-button"
                type="button"
                disabled={!serviceEntry.trim() || selectedServices.length >= MAX_INTAKE_SERVICES}
                onClick={commitServiceEntry}
              >
                Add service
              </button>
            </div>
            <small id="service-picker-help">
              {selectedServices.length} of {MAX_INTAKE_SERVICES} selected. Three to five is a good target; put the most important first.
            </small>
          </div>
          <div className="service-suggestion-box field full">
            <button className="button secondary" type="button" onClick={suggestServices} disabled={suggestingServices}>
              {suggestingServices ? "Looking at your business details…" : "Suggest services from my listing"}
            </button>
            <p className="form-note">Suggestions are not added unless you select them. Confirm that each one is a service you actually offer.</p>
            {suggestionMessage && <p role="status">{suggestionMessage}</p>}
            {suggestedServices.length > 0 && (
              <fieldset className="suggested-services">
                <legend>Choose any suggested services you offer</legend>
                {suggestedServices.map((service) => (
                  <label className="suggested-service" key={service}>
                    <input
                      type="checkbox"
                      checked={selectedServices.some((item) => item.toLowerCase() === service.toLowerCase())}
                      onChange={(event) => toggleSuggestedService(service, event.currentTarget.checked)}
                    />
                    <span>{service}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          <label className="field">
            What kind of business is this?
            <select required name="industry" defaultValue="">
              <option value="" disabled>
                Choose the closest match
              </option>
              <option value="home-services">Home services or trades</option>
              <option value="wellness">Care, wellness, or health</option>
              <option value="professional-services">
                Professional services
              </option>
              <option value="hospitality">Hospitality or food</option>
              <option value="real-estate">Real estate or property</option>
              <option value="technology">Technology or online service</option>
              <option value="other">Another kind of business</option>
            </select>
          </label>
          <label className="field">
            What city do you mainly serve?
            <input
              required
              name="serviceAreas"
              placeholder="e.g. Charleston, SC"
            />
          </label>
          <label className="field">
            How far do you normally travel?
            <select required name="serviceRadius" defaultValue="">
              <option value="" disabled>Select your usual travel distance</option>
              <option value="10">Up to 10 miles</option>
              <option value="20">Up to 20 miles</option>
              <option value="30">Up to 30 miles</option>
              <option value="50">Up to 50 miles</option>
              <option value="50+">More than 50 miles</option>
            </select>
          </label>
          <label className="field full">
            Why do customers choose you?
            <textarea
              required
              name="differentiators"
              placeholder="For example: 15 years of experience, tidy work, clear communication, fast response, specialist expertise."
            />
          </label>
        </div>
        <fieldset className="cta-options">
          <legend>What should customers do when they&apos;re interested?</legend>
          <label>
            <input
              type="radio"
              name="primaryCta"
              value="Call now"
              defaultChecked
            />{" "}
            Call now
          </label>
          <label>
            <input type="radio" name="primaryCta" value="Request a quote" />{" "}
            Request a quote
          </label>
          <label>
            <input
              type="radio"
              name="primaryCta"
              value="Book an appointment"
            />{" "}
            Book an appointment
          </label>
          <label>
            <input
              type="radio"
              name="primaryCta"
              value="Send us your details"
            />{" "}
            Send us your details
          </label>
        </fieldset>
        <p className="form-note">
          We&apos;ll use your main city and travel radius to research nearby
          coverage areas. That does not automatically create a page for every
          nearby town.
        </p>
      </section>
      <section
        className="form-step"
        data-step="2"
        hidden={step !== 2}
        aria-hidden={step !== 2}
      >
        <span className="eyebrow">Brand details</span>
        <h1>Add the pieces only you can provide.</h1>
        <p>
          Your logo and real business photos are ideal. You can skip anything
          you do not have yet.
        </p>
        <div className="field-grid">
          <label className="field full">
            Anything we should know about how your business should look or feel?
            <textarea
              name="brandNotes"
              placeholder="Optional: fonts you already use or anything you want us to avoid."
            />
          </label>
          <div className="field">
            <label htmlFor="existing-brand-color">
              Existing brand colour, if you already use one
            </label>
            <div className="brand-color-control">
              <input
                id="existing-brand-color"
                name="brandColorPicker"
                type="color"
                value={brandColorPicker}
                aria-describedby="brand-color-note"
                onChange={(event) => {
                  setBrandColorPicker(event.currentTarget.value);
                  setHasExistingBrandColor(true);
                  draftRef.current.brandColor = event.currentTarget.value;
                }}
              />
              <div className="brand-color-value" aria-live="polite">
                <strong>{brandColorPicker.toUpperCase()}</strong>
                <small>{hasExistingBrandColor ? "Selected existing colour" : "Click the swatch to choose"}</small>
              </div>
            </div>
            <input
              type="hidden"
              name="brandColor"
              value={hasExistingBrandColor ? brandColorPicker : ""}
            />
            {hasExistingBrandColor && (
              <button
                className="text-button brand-color-clear"
                type="button"
                onClick={() => {
                  setHasExistingBrandColor(false);
                  setBrandColorPicker("#245d51");
                  draftRef.current.brandColor = "";
                }}
              >
                Clear selected brand colour
              </button>
            )}
            <small id="brand-color-note" className="brand-color-note">
              Leave the swatch untouched if you do not have a brand colour you want us to keep.
            </small>
          </div>
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
            Where should new website leads be sent?
            <input
              required
              type="email"
              name="leadEmail"
              placeholder="leads@yourbusiness.com"
            />
          </label>
        </div>
        <div className="review-divider" />
        <span className="eyebrow">One last check</span>
        <h2>Confirm the essentials.</h2>
        <dl className="confirmation-summary">
          <div>
            <dt>Business</dt>
            <dd>{draftValue("businessName")}</dd>
          </div>
          <div>
            <dt>Core services</dt>
            <dd>{draftValue("services")}</dd>
          </div>
          <div>
            <dt>Main service city</dt>
            <dd>{draftValue("serviceAreas")}</dd>
          </div>
          <div>
            <dt>Travel radius</dt>
            <dd>{draftValue("serviceRadius")} miles</dd>
          </div>
          <div>
            <dt>Main customer action</dt>
            <dd>{draftValue("primaryCta")}</dd>
          </div>
          <div>
            <dt>Existing brand colour</dt>
            <dd>{draftValue("brandColor")}</dd>
          </div>
        </dl>
        <input type="hidden" name="confirmSeoResearch" value="yes" />
        <input type="hidden" name="confirmRights" value="yes" />
        <label className="consent">
          <input type="checkbox" required name="confirmAccuracy" value="yes" />
          <span>
            I confirm the business details are accurate, that I&apos;m allowed
            to share these files, and that LaunchLoom may use public information
            to prepare my website.
          </span>
        </label>
        <p className="form-note">
          We use public information to plan helpful website content and nearby
          coverage details. You decide which business facts and services are
          accurate.
        </p>
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
