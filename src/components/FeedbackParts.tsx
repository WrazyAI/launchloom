import { useState } from "react";
import type { SyntheticEvent } from "react";
import { compressImage } from "../lib/compress-image";

export type FeedbackSubmitResult = {
  ok: boolean;
  queueStatus?: "started" | "queued" | "duplicate";
  error?: string;
};

type ImagePartId = "logo" | "hero" | "secondary" | "tertiary" | "team";
type TextPartId = "navigation" | "wording" | "services" | "phone" | "faq";
type PartId = ImagePartId | TextPartId | "colors";
type ColorRole = "primary" | "surface" | "hero" | "ink" | "muted" | "line";

const IMAGE_PARTS: Array<{
  id: ImagePartId;
  label: string;
  promptLabel: string;
}> = [
  { id: "logo", label: "Logo", promptLabel: "Describe the logo or brand mark you want" },
  {
    id: "hero",
    label: "Hero image",
    promptLabel: "Describe the opening image you want",
  },
  {
    id: "secondary",
    label: "About or story image",
    promptLabel: "Describe the story or about image you want",
  },
  {
    id: "tertiary",
    label: "Gallery photos",
    promptLabel: "Describe the gallery image you want",
  },
  {
    id: "team",
    label: "Team photo",
    promptLabel: "Describe the team photo you want",
  },
];

const TEXT_PARTS: Array<{
  id: TextPartId;
  label: string;
  hint: string;
}> = [
  {
    id: "navigation",
    label: "Navigation",
    hint: "For example: keep the menu short and put Contact last.",
  },
  {
    id: "wording",
    label: "Wording",
    hint: "For example: make the headline more direct.",
  },
  {
    id: "services",
    label: "Services",
    hint: "For example: rename a service or clarify what it covers.",
  },
  {
    id: "phone",
    label: "Phone number",
    hint: "For example: make the phone number easier to find.",
  },
  {
    id: "faq",
    label: "FAQ",
    hint: "For example: add a question about coverage.",
  },
];

const COLOR_ROLES: Array<{
  id: ColorRole;
  label: string;
  defaultHex: string;
  advanced?: boolean;
}> = [
  { id: "primary", label: "Brand or accent color", defaultHex: "#1f3a5f" },
  { id: "surface", label: "Page background", defaultHex: "#faf7f2" },
  { id: "hero", label: "Hero surface", defaultHex: "#e8f0f1", advanced: true },
  { id: "ink", label: "Body text", defaultHex: "#17242b", advanced: true },
  { id: "muted", label: "Muted text", defaultHex: "#5b6b72", advanced: true },
  { id: "line", label: "Divider lines", defaultHex: "#d7e0e2", advanced: true },
];

type ImageDraft = {
  upload?: { url: string; name: string };
  generated?: { url: string; prompt: string; model: string };
  prompt: string;
  status: string;
  busy: boolean;
};

const emptyDraft = (): ImageDraft => ({
  prompt: "",
  status: "",
  busy: false,
});

const labelFor = (id: PartId) =>
  [...IMAGE_PARTS, ...TEXT_PARTS].find((part) => part.id === id)?.label ||
  (id === "colors" ? "Colors" : id);

function initialColors() {
  return Object.fromEntries(
    COLOR_ROLES.map((role) => [
      role.id,
      { enabled: false, hex: role.defaultHex },
    ]),
  ) as Record<ColorRole, { enabled: boolean; hex: string }>;
}

export default function FeedbackParts({
  apiBase,
  endpoint,
  creative = false,
  token,
  email,
  onEmailChange,
  pageUrl,
  disabled = false,
  submitLabel,
  onSubmitted,
}: {
  apiBase: string;
  endpoint: string;
  creative?: boolean;
  token: string;
  email: string;
  onEmailChange: (value: string) => void;
  pageUrl: string;
  disabled?: boolean;
  submitLabel: string;
  onSubmitted: (result: FeedbackSubmitResult) => void;
}) {
  const [active, setActive] = useState<PartId[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Partial<Record<ImagePartId, ImageDraft>>>(
    {},
  );
  const [showName, setShowName] = useState(false);
  const [colors, setColors] = useState(initialColors);
  const [advanced, setAdvanced] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const togglePart = (id: PartId) => {
    setMessage("");
    setActive((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const updateDraft = (id: ImagePartId, patch: Partial<ImageDraft>) =>
    setDrafts((current) => ({
      ...current,
      [id]: { ...emptyDraft(), ...current[id], ...patch },
    }));

  const setNote = (id: PartId, value: string) =>
    setNotes((current) => ({ ...current, [id]: value }));

  const updateColor = (
    id: ColorRole,
    patch: Partial<{ enabled: boolean; hex: string }>,
  ) =>
    setColors((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));

  function reviewEmail() {
    const value = email.trim().toLowerCase();
    if (!value) {
      setMessage("Enter the review email that received this link.");
      return "";
    }
    return value;
  }

  async function uploadImage(id: ImagePartId, file: File) {
    const reviewerEmail = reviewEmail();
    if (!reviewerEmail) return;
    updateDraft(id, { busy: true, status: "Uploading the image…" });
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.set("token", token);
      form.set("email", reviewerEmail);
      form.set("pageUrl", pageUrl);
      form.set("target", id);
      form.set("file", compressed);
      const response = await fetch(`${apiBase}/api/feedback-image`, {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };
      if (!response.ok || !data.url)
        throw new Error(data.error || "The image upload failed.");
      updateDraft(id, {
        busy: false,
        status: "Uploaded. It replaces this image in the next revision.",
        upload: { url: data.url, name: file.name },
        generated: undefined,
      });
    } catch (error) {
      updateDraft(id, {
        busy: false,
        status:
          error instanceof Error ? error.message : "The image upload failed.",
      });
    }
  }

  async function generateImage(id: ImagePartId) {
    const reviewerEmail = reviewEmail();
    if (!reviewerEmail) return;
    const prompt = drafts[id]?.prompt.trim() || "";
    if (prompt.length < 3) {
      updateDraft(id, { status: "Describe the image you want first." });
      return;
    }
    updateDraft(id, { busy: true, status: "Generating an image…" });
    try {
      const response = await fetch(`${apiBase}/api/feedback-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: reviewerEmail,
          pageUrl,
          target: id,
          prompt,
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
      updateDraft(id, {
        busy: false,
        status:
          "Generated. Choose it as your replacement, or generate another.",
        generated: { url, prompt, model: data.model || "" },
        upload: undefined,
      });
    } catch (error) {
      updateDraft(id, {
        busy: false,
        status:
          error instanceof Error ? error.message : "Image generation failed.",
      });
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (submitting || disabled) return;
    const reviewerEmail = reviewEmail();
    if (!reviewerEmail) return;
    if (!active.length) {
      setMessage("Choose at least one part of the site to change.");
      return;
    }
    const textLines: string[] = [];
    const attachments: Array<Record<string, string>> = [];
    for (const id of active) {
      const imagePart = IMAGE_PARTS.find((part) => part.id === id);
      if (imagePart) {
        const draft = drafts[imagePart.id];
        const chosen = draft?.generated || draft?.upload;
        if (chosen) {
          attachments.push({
            target: imagePart.id,
            kind: draft?.generated ? "generated" : "upload",
            url: chosen.url,
            ...(draft?.generated
              ? { prompt: draft.generated.prompt, model: draft.generated.model }
              : {}),
          });
        }
        const note = (notes[id] || "").trim();
        if (note) textLines.push(`${imagePart.label}: ${note}`);
        if (!chosen && !note) {
          setMessage(
            `Add an image or a note for ${imagePart.label}, or turn it off.`,
          );
          return;
        }
        continue;
      }
      if (id === "colors") continue;
      const textPart = TEXT_PARTS.find((part) => part.id === id)!;
      const note = (notes[id] || "").trim();
      if (id === "navigation" && showName)
        textLines.push("Show the business name in the header.");
      if (note) textLines.push(`${textPart.label}: ${note}`);
      if (!note && !(id === "navigation" && showName)) {
        setMessage(
          `Add a note for ${textPart.label}, or turn it off.`,
        );
        return;
      }
    }
    const selectedColors = COLOR_ROLES.filter(
      (role) => colors[role.id].enabled,
    ).map((role) => ({ role: role.id, hex: colors[role.id].hex }));
    if (
      active.includes("colors") &&
      !selectedColors.length
    ) {
      setMessage("Choose at least one color, or turn the Colors part off.");
      return;
    }
    if (!textLines.length && !attachments.length && !selectedColors.length) {
      setMessage("Add a note, an image, or a color first.");
      return;
    }
    setSubmitting(true);
    setMessage("Sending your request…");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          ...(creative ? { action: "feedback" } : {}),
          email: reviewerEmail,
          pageUrl,
          submissionId: crypto.randomUUID(),
          comment: textLines.join("\n"),
          category: active.map(labelFor).join(", ").slice(0, 80),
          details: { attachments, colors: selectedColors },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        queueStatus?: FeedbackSubmitResult["queueStatus"];
      };
      if (!response.ok) {
        setMessage(data.error || "The request could not be sent.");
        onSubmitted({ ok: false, error: data.error });
        return;
      }
      setActive([]);
      setNotes({});
      setDrafts({});
      setShowName(false);
      setColors(initialColors());
      setMessage("");
      onSubmitted({ ok: true, queueStatus: data.queueStatus });
    } catch {
      setMessage("The request could not be sent. Please try again.");
      onSubmitted({ ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  const visibleColorRoles = COLOR_ROLES.filter(
    (role) => advanced || !role.advanced,
  );

  return (
    <form className="feedback-parts" onSubmit={submit}>
      <label className="field">
        Review email
        <input
          required
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="The email that received this review link"
        />
      </label>
      <fieldset className="feedback-parts__picker">
        <legend>What should change?</legend>
        <div className="feedback-parts__grid">
          {IMAGE_PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              className="feedback-part-chip"
              aria-pressed={active.includes(part.id)}
              onClick={() => togglePart(part.id)}
            >
              {part.label}
            </button>
          ))}
          {TEXT_PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              className="feedback-part-chip"
              aria-pressed={active.includes(part.id)}
              onClick={() => togglePart(part.id)}
            >
              {part.label}
            </button>
          ))}
          <button
            type="button"
            className="feedback-part-chip"
            aria-pressed={active.includes("colors")}
            onClick={() => togglePart("colors")}
          >
            Colors
          </button>
        </div>
      </fieldset>

      {IMAGE_PARTS.filter((part) => active.includes(part.id)).map((part) => {
        const draft = drafts[part.id] || emptyDraft();
        const chosen = draft.generated || draft.upload;
        return (
          <section
            key={part.id}
            className="feedback-part"
            aria-label={`${part.label} feedback`}
          >
            <h3>{part.label}</h3>
            <label className="field">
              Note (optional)
              <textarea
                value={notes[part.id] || ""}
                onChange={(event) => setNote(part.id, event.target.value)}
                placeholder={`Anything else about the ${part.label.toLowerCase()}?`}
              />
            </label>
            <div className="feedback-part__images">
              <label className="feedback-upload">
                Upload your own image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={draft.busy || disabled}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadImage(part.id, file);
                  }}
                />
              </label>
              <div className="feedback-generate">
                <label className="field">
                  {part.promptLabel}
                  <textarea
                    value={draft.prompt}
                    onChange={(event) =>
                      updateDraft(part.id, { prompt: event.target.value })
                    }
                    placeholder="For example: a calm, warm photo of the team workspace, no text."
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={draft.busy || disabled}
                  onClick={() => void generateImage(part.id)}
                >
                  {draft.busy ? "Working…" : "Generate an image"}
                </button>
              </div>
              {chosen && (
                <div className="feedback-part__preview">
                  <img
                    src={chosen.url}
                    alt={`Selected ${part.label} replacement`}
                  />
                  <div>
                    <strong>
                      {draft.generated
                        ? "Generated image selected"
                        : "Uploaded image selected"}
                    </strong>
                    <button
                      type="button"
                      className="feedback-part__remove"
                      onClick={() =>
                        updateDraft(part.id, {
                          upload: undefined,
                          generated: undefined,
                          status: "",
                        })
                      }
                    >
                      Remove image
                    </button>
                  </div>
                </div>
              )}
              {draft.status && (
                <p className="feedback-part__status" role="status">
                  {draft.status}
                </p>
              )}
            </div>
          </section>
        );
      })}

      {active.includes("navigation") && (
        <section className="feedback-part" aria-label="Navigation feedback">
          <h3>Navigation</h3>
          <label className="feedback-toggle">
            <input
              type="checkbox"
              checked={showName}
              onChange={(event) => setShowName(event.target.checked)}
            />
            Show the business name in the header
          </label>
          <label className="field">
            Note (optional)
            <textarea
              value={notes.navigation || ""}
              onChange={(event) => setNote("navigation", event.target.value)}
              placeholder="For example: keep the menu short and put Contact last."
            />
          </label>
        </section>
      )}

      {active.includes("colors") && (
        <section className="feedback-part" aria-label="Color feedback">
          <h3>Colors</h3>
          <p className="feedback-part__hint">
            Pick the colors you prefer. The rest of the palette is derived with
            readable contrast.
          </p>
          <div className="feedback-colors">
            {visibleColorRoles.map((role) => (
              <label key={role.id} className="feedback-color">
                <input
                  type="checkbox"
                  checked={colors[role.id].enabled}
                  onChange={(event) =>
                    updateColor(role.id, { enabled: event.target.checked })
                  }
                />
                <span>{role.label}</span>
                <input
                  type="color"
                  aria-label={`Choose ${role.label}`}
                  value={colors[role.id].hex}
                  disabled={!colors[role.id].enabled}
                  onChange={(event) =>
                    updateColor(role.id, {
                      hex: event.target.value,
                      enabled: true,
                    })
                  }
                />
                <code>{colors[role.id].hex.toUpperCase()}</code>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="feedback-advanced-toggle"
            aria-expanded={advanced}
            onClick={() => setAdvanced((value) => !value)}
          >
            {advanced ? "Hide advanced colors" : "Advanced colors"}
          </button>
        </section>
      )}

      {TEXT_PARTS.filter(
        (part) => active.includes(part.id) && part.id !== "navigation",
      ).map((part) => (
        <section
          key={part.id}
          className="feedback-part"
          aria-label={`${part.label} feedback`}
        >
          <h3>{part.label}</h3>
          <label className="field">
            What should change?
            <textarea
              value={notes[part.id] || ""}
              onChange={(event) => setNote(part.id, event.target.value)}
              placeholder={part.hint}
            />
          </label>
        </section>
      ))}

      {message && (
        <p className="feedback-parts__message" role="status">
          {message}
        </p>
      )}
      <button className="button" type="submit" disabled={submitting || disabled}>
        {submitting ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
