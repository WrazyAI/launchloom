// OpenCode Go is the only inference upstream for Worker AI features.
// The provider exposes the Responses protocol, not chat completions, so this
// module owns the small request/response boundary used by intake suggestions
// and the visitor assistant.

export const OPENCODE_GO_RESPONSES_URL =
  "https://opencode.ai/inference/go/v1/responses";
export const OPENCODE_GO_WORKER_MODEL = "deepseek-v4.1-flash";

type ResponsesPart = {
  type?: string;
  text?: string;
};

type ResponsesOutput = {
  content?: ResponsesPart[];
};

type ResponsesPayload = {
  status?: string;
  model?: string;
  output?: ResponsesOutput[];
  usage?: Record<string, unknown> | null;
  error?: { message?: string; code?: string; type?: string } | null;
};

export type OpenCodeGoCompletion = {
  text: string;
  model: string;
  usage: Record<string, unknown> | null;
};

export async function opencodeGoCompletion({
  apiKey,
  system,
  user,
  model = OPENCODE_GO_WORKER_MODEL,
  outputFormat,
  maxOutputTokens,
  signal,
  sessionId = "launchloom-worker",
}: {
  apiKey: string;
  system: string;
  user: string;
  model?: string;
  outputFormat?:
    | { type: "json" }
    | { type: "json-schema"; name: string; schema: Record<string, unknown> };
  maxOutputTokens: number;
  signal?: AbortSignal;
  sessionId?: string;
}): Promise<OpenCodeGoCompletion> {
  const response = await fetch(OPENCODE_GO_RESPONSES_URL, {
    method: "POST",
    // Workers does not support redirect:"error". A manual 3xx response is
    // rejected by the !response.ok check below without forwarding credentials.
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "x-opencode-session": sessionId,
      "User-Agent": "launchloom-worker/0.1",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: user }],
        },
      ],
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: "low" },
      store: false,
      ...(outputFormat
        ? {
            text: {
              format:
                outputFormat.type === "json"
                  ? { type: "json_object" }
                  : {
                      type: "json_schema",
                      name: outputFormat.name,
                      strict: true,
                      schema: outputFormat.schema,
                    },
            },
          }
        : {}),
    }),
    signal,
  });

  if (!response.ok) throw new Error(`OpenCode Go returned ${response.status}.`);
  const payload = (await response.json()) as ResponsesPayload;
  if (payload.error)
    throw new Error(
      `OpenCode Go returned ${payload.error.code || payload.error.type || "an error"}.`,
    );
  if (payload.status !== "completed")
    throw new Error(
      `OpenCode Go did not complete (${payload.status || "unknown"}).`,
    );

  const text = (payload.output || [])
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((part) => part?.type === "output_text")
    .map((part) => String(part.text || ""))
    .join("")
    .trim();
  if (!text) throw new Error("OpenCode Go returned an empty answer.");

  return {
    text,
    model: String(payload.model || model),
    usage: payload.usage || null,
  };
}
