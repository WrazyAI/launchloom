import { useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import AttachmentThumb from "./AttachmentThumb";
import { compressImage } from "../lib/compress-image";

export type ClientSubmitResult = {
  ok: boolean;
  queueStatus?: "started" | "queued" | "duplicate";
  error?: string;
};

const PHOTO_TARGETS = [
  { id: "hero", label: "Main image at the top" },
  { id: "secondary", label: "About image" },
  { id: "tertiary", label: "Gallery photo" },
  { id: "team", label: "Team photo" },
] as const;

const LOGO_TARGET = { id: "logo", label: "Logo" };

const COLOR_ROLES = [
  { id: "primary", label: "Main brand color", fallback: "#205d51" },
  { id: "surface", label: "Page background", fallback: "#f8f6f0" },
] as const;

type ColorRole = (typeof COLOR_ROLES)[number]["id"];

export default function ClientFeedbackForm({
  apiBase,
  token,
  email,
  onEmailChange,
  pageUrl,
  onSubmitted,
}: {
  apiBase: string;
  token: string;
  email: string;
  onEmailChange: (value: string) => void;
  pageUrl: string;
  onSubmitted: (result: ClientSubmitResult) => void;
}) {
  const [category, setCategory] = useState("text");
  const [comment, setComment] = useState("");
  const [replacement, setReplacement] = useState<File | null>(null);
  const [replacementUrl, setReplacementUrl] = useState("");
  const [generated, setGenerated] = useState<{
    url: string;
    prompt: string;
    model: string;
    target: string;
  } | null>(null);
  const [target, setTarget] = useState<string>("hero");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [colors, setColors] = useState<
    Record<ColorRole, { enabled: boolean; hex: string }>
  >(() =>
    Object.fromEntries(
      COLOR_ROLES.map((role) => [
        role.id,
        { enabled: false, hex: role.fallback },
      ]),
    ) as Record<ColorRole, { enabled: boolean; hex: string }>,
  );
  const fileInput = useRef<HTMLInputElement | null>(null);
  const submissionId = useRef("");

  const imageCategory = category === "logo" || category === "photos";
  const targetOptions = category === "logo" ? [LOGO_TARGET] : PHOTO_TARGETS;

  function chooseReplacement(file: File | null) {
    setReplacementUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : "";
    });
    setReplacement(file);
    if (file) setGenerated(null);
    setStatus("");
    setError(false);
  }

  function changeCategory(value: string) {
    setCategory(value);
    chooseReplacement(null);
    setGenerated(null);
    setPrompt("");
    setStatus("");
    setError(false);
    if (fileInput.current) fileInput.current.value = "";
    setTarget(value === "logo" ? "logo" : "hero");
  }

  function reviewerEmail() {
    const value = email.trim().toLowerCase();
    if (!value) {
      setStatus("Enter the review email that received this link.");
      setError(true);
      return "";
    }
    return value;
  }

  async function generateImage() {
    const submittedEmail = reviewerEmail();
    if (!submittedEmail) return;
    if (prompt.trim().length < 3) {
      setStatus("Describe the image first.");
      setError(true);
      return;
    }
    setBusy(true);
    setStatus("Creating an image…");
    setError(false);
    try {
      const response = await fetch(`${apiBase}/api/feedback-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: submittedEmail,
          pageUrl,
          target,
          prompt: prompt.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        model?: string;
        images?: Array<{ url?: string }>;
      };
      const url = data.images?.[0]?.url;
      if (!response.ok || !url)
        throw new Error(data.error || "We could not create the image.");
      setGenerated({
        url,
        prompt: prompt.trim(),
        model: data.model || "",
        target,
      });
      chooseReplacement(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Created. Use this image, or create another.");
      setError(false);
    } catch (caught) {
      setStatus(
        caught instanceof Error ? caught.message : "We could not create the image.",
      );
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (busy) return;
    const submittedEmail = reviewerEmail();
    if (!submittedEmail) return;
    if (imageCategory && !replacement && !generated) {
      setStatus("Add a photo or create one.");
      setError(true);
      return;
    }
    if (
      ["text", "contact", "style", "other-small"].includes(category) &&
      !comment.trim()
    ) {
      setStatus("Describe the small change.");
      setError(true);
      return;
    }
    const colorSelections = COLOR_ROLES.filter(
      (role) => colors[role.id].enabled,
    ).map((role) => ({ role: role.id, hex: colors[role.id].hex.toLowerCase() }));
    if (
      category === "color" &&
      !colorSelections.length &&
      !/#[0-9a-f]{6}/iu.test(comment)
    ) {
      setStatus("Pick a color, or type a color code like #205d51 in the note.");
      setError(true);
      return;
    }
    const attachments = generated
      ? [
          {
            target: generated.target,
            kind: "generated",
            url: generated.url,
            prompt: generated.prompt,
            model: generated.model,
          },
        ]
      : [];
    const details = { attachments, colors: colorSelections };
    submissionId.current ||= crypto.randomUUID();
    setBusy(true);
    setStatus("Sending…");
    setError(false);
    try {
      let response: Response;
      if (replacement) {
        const form = new FormData();
        form.set("token", token);
        form.set(
          "comment",
          comment.trim() || "Please replace this image with the one I uploaded.",
        );
        form.set("category", category);
        form.set("email", submittedEmail);
        form.set("pageUrl", pageUrl);
        form.set("submissionId", submissionId.current);
        form.set("replacementAsset", replacement);
        form.set("replacementTarget", target);
        if (colorSelections.length)
          form.set("details", JSON.stringify(details));
        response = await fetch(`${apiBase}/api/feedback`, {
          method: "POST",
          body: form,
        });
      } else {
        response = await fetch(`${apiBase}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            comment,
            category,
            email: submittedEmail,
            pageUrl,
            submissionId: submissionId.current,
            details,
          }),
        });
      }
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        queueStatus?: ClientSubmitResult["queueStatus"];
      };
      if (!response.ok) {
        setStatus(data.error || "The request could not be sent.");
        setError(true);
        onSubmitted({ ok: false, error: data.error });
        return;
      }
      setComment("");
      chooseReplacement(null);
      setGenerated(null);
      setPrompt("");
      setColors(
        Object.fromEntries(
          COLOR_ROLES.map((role) => [
            role.id,
            { enabled: false, hex: role.fallback },
          ]),
        ) as Record<ColorRole, { enabled: boolean; hex: string }>,
      );
      setStatus("");
      setError(false);
      submissionId.current = "";
      onSubmitted({ ok: true, queueStatus: data.queueStatus });
    } catch {
      setStatus("The request could not be sent. Please try again.");
      setError(true);
      onSubmitted({ ok: false });
    } finally {
      setBusy(false);
    }
  }

  const chosenUpload = replacement && replacementUrl ? replacementUrl : "";

  return (
    <form className="client-feedback-form" onSubmit={submit}>
      <label className="field">
        Your review email
        <input
          required
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="The email that received this review link"
        />
      </label>
      <label className="field">
        What kind of change is this?
        <select
          value={category}
          onChange={(event) => changeCategory(event.target.value)}
        >
          <option value="logo">Logo</option>
          <option value="photos">Photos</option>
          <option value="style">Fonts or spacing</option>
          <option value="color">Colors</option>
          <option value="text">Wording or facts</option>
          <option value="contact">Contact details</option>
          <option value="other-small">Something else small</option>
        </select>
      </label>
      {imageCategory && (
        <section className="feedback-part" aria-label="Replacement image">
          <header className="feedback-part__head">
            <h3>Which image?</h3>
          </header>
          <label className="field">
            <span className="visually-hidden">Choose the image to replace</span>
            <select
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                setGenerated(null);
                setStatus("");
                setError(false);
              }}
            >
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="feedback-part__choices">
            <div className="feedback-choice">
              <span className="feedback-choice__title">Use your own photo</span>
              <span className="feedback-choice__hint">
                PNG, JPG, or WebP up to 8 MB
              </span>
              <label className="feedback-choice__file">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(event) =>
                    chooseReplacement(event.currentTarget.files?.[0] || null)
                  }
                />
                <span>
                  {replacement ? "Choose a different photo" : "Choose a file"}
                </span>
              </label>
            </div>
            <div className="feedback-choice feedback-choice--generate">
              <span className="feedback-choice__title">Or create one for me</span>
              <label className="field">
                <span className="visually-hidden">Describe the image</span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="For example: a warm photo of the finished work, no text."
                />
              </label>
              <button
                type="button"
                className="button secondary feedback-choice__button"
                disabled={busy}
                onClick={() => void generateImage()}
              >
                {busy ? "Working…" : "Create an image"}
              </button>
            </div>
          </div>
          {busy && !generated && !chosenUpload && (
            <div className="feedback-attachment feedback-attachment--busy">
              <span className="feedback-attachment__thumb feedback-attachment__thumb--skeleton" />
              <div className="feedback-attachment__meta">
                <span className="feedback-attachment__badge">
                  {status || "Working…"}
                </span>
                <span className="feedback-attachment__name">
                  This can take a moment.
                </span>
              </div>
            </div>
          )}
          {!busy && (generated || chosenUpload) && (
            <figure className="feedback-attachment">
              <span className="feedback-attachment__thumb">
                <AttachmentThumb
                  key={generated?.url || chosenUpload}
                  src={generated?.url || chosenUpload}
                  alt="Your selected image"
                />
              </span>
              <figcaption className="feedback-attachment__meta">
                <span className="feedback-attachment__badge">
                  {generated ? "Created for you" : "Your photo"}
                </span>
                <span className="feedback-attachment__name">
                  {generated ? generated.prompt : replacement?.name}
                </span>
                <button
                  type="button"
                  className="feedback-attachment__remove"
                  onClick={() => {
                    if (generated) setGenerated(null);
                    else chooseReplacement(null);
                    if (fileInput.current) fileInput.current.value = "";
                    setStatus("");
                    setError(false);
                  }}
                >
                  Remove
                </button>
              </figcaption>
            </figure>
          )}
        </section>
      )}
      {category === "color" && (
        <section className="feedback-part" aria-label="Color choice">
          <header className="feedback-part__head">
            <h3>Colors</h3>
          </header>
          <p className="feedback-part__hint">
            Pick the colors you like. We will adjust the rest so text stays
            easy to read.
          </p>
          <div className="feedback-colors">
            {COLOR_ROLES.map((role) => (
              <label key={role.id} className="feedback-color">
                <input
                  type="checkbox"
                  checked={colors[role.id].enabled}
                  onChange={(event) =>
                    setColors((current) => ({
                      ...current,
                      [role.id]: {
                        ...current[role.id],
                        enabled: event.target.checked,
                      },
                    }))
                  }
                />
                <span className="feedback-color__label">{role.label}</span>
                <input
                  type="color"
                  aria-label={`Choose ${role.label}`}
                  value={colors[role.id].hex}
                  disabled={!colors[role.id].enabled}
                  onChange={(event) =>
                    setColors((current) => ({
                      ...current,
                      [role.id]: {
                        enabled: true,
                        hex: event.target.value,
                      },
                    }))
                  }
                />
                <code>{colors[role.id].hex.toUpperCase()}</code>
              </label>
            ))}
          </div>
        </section>
      )}
      <label className="field">
        {imageCategory ? "Note (optional)" : "Describe the small change"}
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={
            category === "text"
              ? 'Quote the exact text and replacement, for example: Replace text "Same day service" with "Prompt scheduling".'
              : category === "contact"
                ? "Name one field and its new value, for example: Phone: (555) 555-0144."
                : category === "color"
                  ? "Tell us the main color if you know it, for example: Use #205d51."
                  : category === "style"
                    ? "Describe a small change to fonts or spacing."
                    : imageCategory
                      ? "Anything else about this image?"
                      : "Tell us what you would like changed. Bigger redesigns are handled separately."
          }
        />
      </label>
      {status && (
        <p
          className={`feedback-parts__message ${error ? "is-error" : "is-success"}`}
          role="status"
        >
          {status}
        </p>
      )}
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send these changes"}
      </button>
    </form>
  );
}
