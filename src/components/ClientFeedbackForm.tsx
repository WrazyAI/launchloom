import { useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { compressImage } from "../lib/compress-image";

export type ClientSubmitResult = {
  ok: boolean;
  queueStatus?: "started" | "queued" | "duplicate";
  error?: string;
};

const PHOTO_TARGETS = [
  { id: "hero", label: "Opening or hero image" },
  { id: "secondary", label: "About or story image" },
  { id: "tertiary", label: "Gallery image" },
  { id: "team", label: "Team photo" },
] as const;

const LOGO_TARGET = { id: "logo", label: "Logo or brand mark" };

const COLOR_ROLES = [
  { id: "primary", label: "Brand or accent color", fallback: "#205d51" },
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

  const imageCategory = category === "logo" || category === "photos";
  const targetOptions = category === "logo" ? [LOGO_TARGET] : PHOTO_TARGETS;

  function changeCategory(value: string) {
    setCategory(value);
    setReplacement(null);
    setGenerated(null);
    setPrompt("");
    setStatus("");
    if (fileInput.current) fileInput.current.value = "";
    setTarget(value === "logo" ? "logo" : "hero");
  }

  function reviewerEmail() {
    const value = email.trim().toLowerCase();
    if (!value) {
      setStatus("Enter the review email that received this link.");
      return "";
    }
    return value;
  }

  async function generateImage() {
    const submittedEmail = reviewerEmail();
    if (!submittedEmail) return;
    if (prompt.trim().length < 3) {
      setStatus("Describe the image you want first.");
      return;
    }
    setBusy(true);
    setStatus("Generating an image…");
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
        throw new Error(data.error || "Image generation failed.");
      setGenerated({
        url,
        prompt: prompt.trim(),
        model: data.model || "",
        target,
      });
      setReplacement(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Generated. Choose it as your replacement, or generate another.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Image generation failed.",
      );
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
      setStatus("Upload or generate a replacement image.");
      return;
    }
    if (
      ["text", "contact", "style", "other-small"].includes(category) &&
      !comment.trim()
    ) {
      setStatus("Describe the small change.");
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
      setStatus("Pick a colour or state a six-digit hex code in the note.");
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
    setBusy(true);
    setStatus("Sending…");
    try {
      let response: Response;
      if (replacement) {
        const form = new FormData();
        form.set("token", token);
        form.set(
          "comment",
          comment.trim() || "Replace this image with the uploaded file.",
        );
        form.set("category", category);
        form.set("email", submittedEmail);
        form.set("pageUrl", pageUrl);
        form.set("submissionId", crypto.randomUUID());
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
            submissionId: crypto.randomUUID(),
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
        onSubmitted({ ok: false, error: data.error });
        return;
      }
      setComment("");
      setReplacement(null);
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
      onSubmitted({ ok: true, queueStatus: data.queueStatus });
    } catch {
      setStatus("The request could not be sent. Please try again.");
      onSubmitted({ ok: false });
    } finally {
      setBusy(false);
    }
  }

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
          <option value="photos">Business photos</option>
          <option value="style">Font or styling</option>
          <option value="color">Colour</option>
          <option value="text">Text or factual correction</option>
          <option value="contact">Contact details</option>
          <option value="other-small">Other small change</option>
        </select>
      </label>
      {imageCategory && (
        <section className="feedback-part" aria-label="Replacement image">
          <label className="field">
            Which image?
            <select
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                setGenerated(null);
                setStatus("");
              }}
            >
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="feedback-upload">
            Upload your own image
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] || null;
                setReplacement(file);
                if (file) setGenerated(null);
                setStatus("");
              }}
            />
            <small>PNG, JPEG, or WebP under 8 MB.</small>
          </label>
          <label className="field">
            Or describe an image to generate
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="For example: a warm photo of the finished work, no text."
            />
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void generateImage()}
          >
            {busy ? "Working…" : "Generate an image"}
          </button>
          {generated && (
            <div className="feedback-part__preview">
              <img src={generated.url} alt="Generated replacement" />
              <div>
                <strong>Generated image selected</strong>
                <button
                  type="button"
                  className="feedback-part__remove"
                  onClick={() => setGenerated(null)}
                >
                  Remove image
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {category === "color" && (
        <section className="feedback-part" aria-label="Colour choice">
          <h3>Colours</h3>
          <p className="feedback-part__hint">
            Pick the colours you prefer. The rest of the palette is derived with
            readable contrast.
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
                <span>{role.label}</span>
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
                  ? "Tell us the brand colour if you know it, for example: Use #205d51."
                  : category === "style"
                    ? "Describe a small font or spacing change you would like."
                    : imageCategory
                      ? "Anything else about this image?"
                      : "Describe the small change. Requests that change the page layout are reviewed separately."
          }
        />
      </label>
      {status && (
        <p className="feedback-parts__message" role="status">
          {status}
        </p>
      )}
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
