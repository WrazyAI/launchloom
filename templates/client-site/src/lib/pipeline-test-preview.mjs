const previewMessages = Object.freeze({
  "seo-only": "Creative evaluation and visual promotion skipped",
  "creative-only": "SEO research skipped",
  "full-preview": "SEO and creative lanes ran",
  "fictional-demo": "Fictional demo data; SEO and creative results are diagnostic only",
});

export function pipelineTestBannerMessage(profile) {
  return previewMessages[profile] || "Unknown pipeline lane";
}
