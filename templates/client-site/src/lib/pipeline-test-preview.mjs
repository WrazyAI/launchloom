const previewMessages = Object.freeze({
  "seo-only": "Creative evaluation and visual promotion skipped",
  "creative-only": "SEO research skipped",
  "full-preview": "SEO and creative lanes ran",
});

export function pipelineTestBannerMessage(profile) {
  return previewMessages[profile] || "Unknown pipeline lane";
}
