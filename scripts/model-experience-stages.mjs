const contentSchema = (name) => ({
  name,
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["content"],
    properties: { content: { type: "string" } },
  },
});

export function createSplitExperienceStages() {
  return [
    {
      id: "contract",
      maxTokens: 4500,
      reasoningEffort: "medium",
      schema: {
        name: "launchloom_design_contract",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["designContract", "designRationale"],
          properties: {
            designContract: { type: "string", maxLength: 9000 },
            designRationale: { type: "string", maxLength: 1400 },
          },
        },
      },
    },
    {
      id: "appJsx",
      maxTokens: 10000,
      reasoningEffort: "low",
      schema: contentSchema("launchloom_app_jsx"),
    },
    {
      id: "stylesCss",
      maxTokens: 10000,
      reasoningEffort: "low",
      schema: contentSchema("launchloom_styles_css"),
    },
    {
      id: "indexHtml",
      maxTokens: 2500,
      reasoningEffort: "low",
      schema: contentSchema("launchloom_index_html"),
    },
  ];
}

export function assembleSplitExperience(results) {
  const files = {
    appJsx: results.appJsx?.content,
    stylesCss: results.stylesCss?.content,
    indexHtml: results.indexHtml?.content,
    designRationale: results.contract?.designRationale,
    designContract: results.contract?.designContract,
  };
  for (const [key, value] of Object.entries(files)) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`Split model output missing ${key}`);
  }
  return files;
}
