import { useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import AttachmentThumb from "./AttachmentThumb";
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
  { id: "logo", label: "Logo", promptLabel: "Describe the logo you want" },
  {
    id: "hero",
    label: "Main image at the top",
    promptLabel: "Describe the image you want at the top of the page",
  },
  {
    id: "secondary",
    label: "About image",
    promptLabel: "Describe the image you want in the about section",
  },
  {
    id: "tertiary",
    label: "Gallery photos",
    promptLabel: "Describe a gallery photo you want",
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
    label: "Menu",
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
    label: "Common questions",
    hint: "For example: add a question about coverage.",
  },
];

const COLOR_ROLES: Array<{
  id: ColorRole;
  label: string;
  defaultHex: string;
  advanced?: boolean;
}> = [
  { id: "primary", label: "Main brand color", defaultHex: "#1f3a5f" },
  { id: "surface", label: "Page background", defaultHex: "#faf7f2" },
  {
    id: "hero",
    label: "Top section background",
    defaultHex: "#e8f0f1",
    advanced: true,
  },
  { id: "ink", label: "Main text", defaultHex: "#17242b", advanced: true },
  {
    id: "muted",
    label: "Smaller, lighter text",
    defaultHex: "#5b6b72",
    advanced: true,
  },
  {
    id: "line",
    label: "Lines and borders",
    defaultHex: "#d7e0e2",
    advanced: true,
  },
];

type ImageDraft = {
  upload?: { url: string; name: string };
  generated?: { url: string; prompt: string; model: string };
  prompt: string;
  status: string;
  error?: boolean;
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
  const submissionId = useRef("");

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
        throw new Error(data.error || "We could not upload the image.");
      updateDraft(id, {
        busy: false,
        status: "Uploaded. It will replace this image in the next update.",
        upload: { url: data.url, name: file.name },
        generated: undefined,
        error: false,
      });
    } catch (error) {
      updateDraft(id, {
        busy: false,
        error: true,
        status:
          error instanceof Error
            ? error.message
            : "We could not upload the image.",
      });
    }
  }

  async function generateImage(id: ImagePartId) {
    const reviewerEmail = reviewEmail();
    if (!reviewerEmail) return;
    const prompt = drafts[id]?.prompt.trim() || "";
    if (prompt.length < 3) {
      updateDraft(id, { status: "Describe the image first.", error: true });
      return;
    }
    updateDraft(id, { busy: true, status: "Creating an image…" });
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
        throw new Error(data.error || "We could not create the image.");
      updateDraft(id, {
        busy: false,
        status: "Created. Use this image, or create another.",
        generated: { url, prompt, model: data.model || "" },
        upload: undefined,
        error: false,
      });
    } catch (error) {
      updateDraft(id, {
        busy: false,
        error: true,
        status:
          error instanceof Error
            ? error.message
            : "We could not create the image.",
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
        setMessage(`Add a note for ${textPart.label}, or turn it off.`);
        return;
      }
    }
    const selectedColors = COLOR_ROLES.filter(
      (role) => colors[role.id].enabled,
    ).map((role) => ({ role: role.id, hex: colors[role.id].hex }));
    if (active.includes("colors") && !selectedColors.length) {
      setMessage("Pick at least one color, or turn off Colors.");
      return;
    }
    if (!textLines.length && !attachments.length && !selectedColors.length) {
      setMessage("Add a note, an image, or a color first.");
      return;
    }
    submissionId.current ||= crypto.randomUUID();
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
          submissionId: submissionId.current,
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
      submissionId.current = "";
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
        <p className="feedback-parts__lead">
          Tap a part of the site, then tell us what you want there.
        </p>
        <div className="feedback-parts__grid">
          {IMAGE_PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              className="feedback-part-chip"
              aria-pressed={active.includes(part.id)}
              onClick={() => togglePart(part.id)}
            >
              <span aria-hidden="true" className="feedback-part-chip__mark" />
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
              <span aria-hidden="true" className="feedback-part-chip__mark" />
              {part.label}
            </button>
          ))}
          <button
            type="button"
            className="feedback-part-chip"
            aria-pressed={active.includes("colors")}
            onClick={() => togglePart("colors")}
          >
            <span aria-hidden="true" className="feedback-part-chip__mark" />
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
            <header className="feedback-part__head">
              <h3>{part.label}</h3>
              <button
                type="button"
                className="feedback-part__off"
                onClick={() => togglePart(part.id)}
              >
                Turn off
              </button>
            </header>
            <div className="feedback-part__choices">
              <div className="feedback-choice">
                <span className="feedback-choice__title">Use your own image</span>
                <span className="feedback-choice__hint">
                  PNG, JPG, or WebP up to 3 MB
                </span>
                <label className="feedback-choice__file">
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
                  <span>
                    {draft.upload ? "Choose a different image" : "Choose a file"}
                  </span>
                </label>
              </div>
              <div className="feedback-choice feedback-choice--generate">
                <span className="feedback-choice__title">
                  Or create one for me
                </span>
                <label className="field">
                  <span className="visually-hidden">{part.promptLabel}</span>
                  <textarea
                    value={draft.prompt}
                    onChange={(event) =>
                      updateDraft(part.id, { prompt: event.target.value })
                    }
                    placeholder="For example: a calm, warm photo of the team at work, no text."
                  />
                </label>
                <button
                  type="button"
                  className="button secondary feedback-choice__button"
                  disabled={draft.busy || disabled}
                  onClick={() => void generateImage(part.id)}
                >
                  {draft.busy ? "Working…" : "Create an image"}
                </button>
              </div>
            </div>
            {draft.busy && !chosen && (
              <div className="feedback-attachment feedback-attachment--busy">
                <span className="feedback-attachment__thumb feedback-attachment__thumb--skeleton" />
                <div className="feedback-attachment__meta">
                  <span className="feedback-attachment__badge">
                    {draft.status || "Working…"}
                  </span>
                  <span className="feedback-attachment__name">
                    This can take a moment.
                  </span>
                </div>
              </div>
            )}
            {chosen && !draft.busy && (
              <figure className="feedback-attachment">
                <span className="feedback-attachment__thumb">
                  <AttachmentThumb
                    key={chosen.url}
                    src={chosen.url}
                    alt={`${part.label} preview`}
                  />
                </span>
                <figcaption className="feedback-attachment__meta">
                  <span className="feedback-attachment__badge">
                    {draft.generated ? "Created for you" : "Your image"}
                  </span>
                  <span className="feedback-attachment__name">
                    {draft.generated ? draft.generated?.prompt : draft.upload?.name}
                  </span>
                  <button
                    type="button"
                    className="feedback-attachment__remove"
                    onClick={() =>
                      updateDraft(part.id, {
                        upload: undefined,
                        generated: undefined,
                        status: "",
                        error: false,
                      })
                    }
                  >
                    Remove
                  </button>
                </figcaption>
              </figure>
            )}
            {!draft.busy && draft.status && (
              <p
                className={`feedback-part__status ${draft.error ? "is-error" : "is-success"}`}
                role="status"
              >
                {draft.status}
              </p>
            )}
            <label className="field">
              Note (optional)
              <textarea
                value={notes[part.id] || ""}
                onChange={(event) => setNote(part.id, event.target.value)}
                placeholder={`Anything else about the ${part.label.toLowerCase()}?`}
              />
            </label>
          </section>
        );
      })}

      {active.includes("navigation") && (
        <section className="feedback-part" aria-label="Navigation feedback">
          <header className="feedback-part__head">
            <h3>Menu</h3>
            <button
              type="button"
              className="feedback-part__off"
              onClick={() => togglePart("navigation")}
            >
              Turn off
            </button>
          </header>
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
          <header className="feedback-part__head">
            <h3>Colors</h3>
            <button
              type="button"
              className="feedback-part__off"
              onClick={() => togglePart("colors")}
            >
              Turn off
            </button>
          </header>
          <p className="feedback-part__hint">
            Pick the colors you like. We will adjust the rest so text stays
            easy to read.
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
                <span className="feedback-color__label">{role.label}</span>
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
            {advanced ? "Fewer color options" : "More color options"}
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
          <header className="feedback-part__head">
            <h3>{part.label}</h3>
            <button
              type="button"
              className="feedback-part__off"
              onClick={() => togglePart(part.id)}
            >
              Turn off
            </button>
          </header>
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
      <div className="feedback-parts__actions">
        <p className="feedback-parts__summary" aria-live="polite">
          {active.length
            ? `${active.length} change${active.length === 1 ? "" : "s"} selected`
            : "Nothing selected yet"}
        </p>
        <button
          className="button"
          type="submit"
          disabled={submitting || disabled}
        >
          {submitting ? "Sending…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
