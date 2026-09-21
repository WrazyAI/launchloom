export const CREATIVE_TYPOGRAPHY_PALETTE = Object.freeze({
  editorialSerif: {
    id: "editorial-serif",
    stack:
      '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    use: "high-contrast editorial display, architecture, luxury, hospitality",
  },
  modernGrotesk: {
    id: "modern-grotesk",
    stack:
      '"Avenir Next", Avenir, "Helvetica Neue", Helvetica, Arial, sans-serif',
    use: "quiet premium sans, cinematic overlays, contemporary editorial",
  },
  condensedDisplay: {
    id: "condensed-display",
    stack:
      '"Arial Narrow", "Liberation Sans Narrow", "Helvetica Neue Condensed", Arial, sans-serif',
    use: "kinetic posters, athletic typography, compressed monument text",
  },
  humanistSans: {
    id: "humanist-sans",
    stack:
      'Optima, Candara, "Segoe UI", "Trebuchet MS", sans-serif',
    use: "care, professional services, calm body copy",
  },
  technicalMono: {
    id: "technical-mono",
    stack:
      '"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace',
    use: "micro-labels, utility diagnostics, technical captions",
  },
});

export function typographyPalettePrompt() {
  return Object.values(CREATIVE_TYPOGRAPHY_PALETTE)
    .map(
      (item) =>
        `${item.id}: ${item.stack} | intended use: ${item.use}`,
    )
    .join("\n");
}
