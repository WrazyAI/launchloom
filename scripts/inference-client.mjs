// Provider-neutral, non-streaming text/image inference. Profiles are trusted
// application configuration, never client input or inferred model capabilities.
const PROTOCOLS = new Set(["chat-completions", "responses", "messages"]);
const REQUEST_KEYS = [
  "messages",
  "maxOutputTokens",
  "temperature",
  "reasoning",
  "outputFormat",
  "sessionId",
];
const IMAGE =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/u;

export class InferenceContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "InferenceContractError";
  }
}

function assert(condition, message) {
  if (!condition) throw new InferenceContractError(message);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keys(value, allowed, label) {
  assert(object(value), `${label} must be an object.`);
  assert(
    Object.keys(value).every((key) => allowed.includes(key)),
    `${label} contains unsupported fields.`,
  );
}

function text(value, label) {
  assert(
    typeof value === "string" && value.trim().length > 0,
    `${label} is required.`,
  );
  return value;
}

function integer(value, label) {
  assert(
    Number.isSafeInteger(value) && value > 0,
    `${label} must be a positive integer.`,
  );
  return value;
}

function headerValue(value, label) {
  text(value, label);
  assert(
    value.length <= 256 && !/[\r\n\x00-\x1f\x7f]/u.test(value),
    `${label} is invalid.`,
  );
  return value;
}

export function validateInferenceProfile(profile) {
  keys(
    profile,
    [
      "provider",
      "model",
      "protocol",
      "endpoint",
      "auth",
      "capabilities",
      "userAgent",
      "sessionHeader",
      "apiVersion",
    ],
    "Inference profile",
  );
  text(profile.provider, "Provider");
  text(profile.model, "Model");
  assert(PROTOCOLS.has(profile.protocol), "Unsupported inference protocol.");
  let endpoint;
  try {
    endpoint = new URL(profile.endpoint);
  } catch {
    throw new InferenceContractError("Invalid inference endpoint.");
  }
  assert(
    endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash,
    "Inference endpoints must use HTTPS without credentials, query or fragment.",
  );
  const suffix = {
    "chat-completions": "/chat/completions",
    responses: "/responses",
    messages: "/messages",
  }[profile.protocol];
  assert(
    endpoint.pathname.endsWith(suffix),
    "Endpoint does not match the declared protocol.",
  );
  assert(
    ["bearer", "api-key"].includes(profile.auth),
    "An explicit inference auth scheme is required.",
  );
  keys(
    profile.capabilities,
    [
      "images",
      "imageDetail",
      "temperature",
      "outputFormats",
      "maxOutputTokens",
      "reasoning",
      "completionTokenField",
    ],
    "Capabilities",
  );
  integer(profile.capabilities.maxOutputTokens, "Profile output ceiling");
  for (const flag of ["images", "imageDetail", "temperature"])
    assert(
      profile.capabilities[flag] === undefined ||
        typeof profile.capabilities[flag] === "boolean",
      "Capability flags must be booleans.",
    );
  assert(
    Array.isArray(profile.capabilities.outputFormats) &&
      profile.capabilities.outputFormats.includes("text") &&
      profile.capabilities.outputFormats.every((mode) =>
        ["text", "json", "json-schema"].includes(mode),
      ),
    "Explicit output formats are required.",
  );
  if (profile.protocol === "messages")
    assert(
      !profile.capabilities.outputFormats.includes("json"),
      "Messages does not implement schema-free JSON mode.",
    );
  if (profile.protocol === "chat-completions")
    assert(
      ["max_tokens", "max_completion_tokens"].includes(
        profile.capabilities.completionTokenField,
      ),
      "Chat completion token field must be explicit.",
    );
  if (profile.userAgent !== undefined)
    headerValue(profile.userAgent, "User-Agent");
  if (profile.sessionHeader !== undefined) {
    assert(
      typeof profile.sessionHeader === "string" &&
        /^x-[a-z0-9-]+$/u.test(profile.sessionHeader),
      "Session header must be an explicit x- header.",
    );
    assert(
      !["x-api-key", "x-goog-api-key"].includes(profile.sessionHeader),
      "Session header must not overwrite authentication.",
    );
    assert(
      profile.userAgent !== undefined,
      "A session-aware client must identify itself.",
    );
  }
  if (profile.apiVersion !== undefined) {
    assert(
      profile.protocol === "messages",
      "API version is only supported for Messages.",
    );
    headerValue(profile.apiVersion, "API version");
  }
  if (profile.capabilities.reasoning !== undefined) {
    const config = profile.capabilities.reasoning;
    keys(config, ["mode", "efforts"], "Reasoning capability");
    assert(
      ["effort", "budget", "adaptive"].includes(config.mode),
      "Unsupported reasoning mode.",
    );
    assert(
      profile.protocol === "messages"
        ? config.mode !== "effort"
        : config.mode === "effort",
      "Reasoning mode does not match protocol.",
    );
    if (config.mode !== "budget")
      assert(
        Array.isArray(config.efforts) &&
          config.efforts.length > 0 &&
          config.efforts.every((effort) =>
            [
              "none",
              "minimal",
              "low",
              "medium",
              "high",
              "xhigh",
              "max",
            ].includes(effort),
          ),
        "Supported reasoning efforts must be explicit.",
      );
  }
  return profile;
}

function contentParts(content, role, profile) {
  const parts =
    typeof content === "string" ? [{ type: "text", text: content }] : content;
  assert(
    Array.isArray(parts) && parts.length > 0,
    "Message content is required.",
  );
  return parts.map((part) => {
    if (part?.type === "text") {
      keys(part, ["type", "text"], "Text part");
      return { type: "text", text: text(part.text, "Message text") };
    }
    keys(part, ["type", "url", "detail"], "Image part");
    assert(
      part.type === "image" &&
        role === "user" &&
        profile.capabilities.images === true,
      "Image input is unsupported for this role or model profile.",
    );
    // Local retained bytes only: avoid source hotlinks, remote asset fetches,
    // filesystem references, and undocumented image URL transport differences.
    const match = typeof part.url === "string" && part.url.match(IMAGE);
    assert(
      match && match[2].length % 4 === 0,
      "Images must be supported base64 data URLs.",
    );
    if (part.detail !== undefined)
      assert(
        profile.protocol !== "messages" &&
          profile.capabilities.imageDetail === true &&
          ["low", "high", "auto"].includes(part.detail),
        "Image detail cannot be silently dropped.",
      );
    return {
      type: "image",
      url: part.url,
      ...(part.detail !== undefined ? { detail: part.detail } : {}),
    };
  });
}

function serializeParts(parts, protocol) {
  return parts.map((part) => {
    if (part.type === "text")
      return {
        type: protocol === "responses" ? "input_text" : "text",
        text: part.text,
      };
    if (protocol === "chat-completions")
      return {
        type: "image_url",
        image_url: {
          url: part.url,
          ...(part.detail !== undefined ? { detail: part.detail } : {}),
        },
      };
    if (protocol === "responses")
      return {
        type: "input_image",
        image_url: part.url,
        detail: part.detail || "auto",
      };
    const [, mediaType, data] = part.url.match(IMAGE);
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    };
  });
}

/** @param {Record<string, any>} profile @param {Record<string, any>} request */
export function buildInferenceRequest(profile, request) {
  validateInferenceProfile(profile);
  keys(request, REQUEST_KEYS, "Inference request");
  const limit = integer(request.maxOutputTokens, "Requested output ceiling");
  assert(
    limit <= profile.capabilities.maxOutputTokens,
    "Requested output exceeds the profile ceiling; refusing to truncate it.",
  );
  assert(
    Array.isArray(request.messages) && request.messages.length > 0,
    "Messages are required.",
  );
  let conversationStarted = false;
  const messages = request.messages.map((message) => {
    keys(message, ["role", "content"], "Message");
    assert(
      ["system", "user", "assistant"].includes(message.role),
      "Unsupported message role; tool/reasoning replay needs a separate adapter.",
    );
    if (message.role === "system")
      assert(
        !conversationStarted,
        "System instructions must precede conversation messages.",
      );
    else conversationStarted = true;
    return {
      role: message.role,
      content: serializeParts(
        contentParts(message.content, message.role, profile),
        profile.protocol,
      ),
    };
  });
  assert(
    messages.some((message) => message.role === "user"),
    "At least one user message is required.",
  );
  const format = request.outputFormat || { type: "text" };
  keys(format, ["type", "name", "schema"], "Output format");
  assert(
    profile.capabilities.outputFormats.includes(format.type),
    "Requested output format is not supported by this profile.",
  );
  if (format.type === "json-schema") {
    assert(
      typeof format.name === "string" &&
        /^[a-zA-Z0-9_-]{1,64}$/u.test(format.name),
      "Schema name is required.",
    );
    assert(object(format.schema), "Output schema must be an object.");
  } else
    assert(
      format.name === undefined && format.schema === undefined,
      "Schema fields require json-schema mode.",
    );
  const body = { model: profile.model };
  if (profile.protocol === "responses")
    Object.assign(body, {
      input: messages,
      max_output_tokens: limit,
      store: false,
    });
  else if (profile.protocol === "messages") {
    Object.assign(body, {
      messages: messages.filter((message) => message.role !== "system"),
      max_tokens: limit,
    });
    const system = messages
      .filter((message) => message.role === "system")
      .flatMap((message) => message.content);
    if (system.length) body.system = system;
  } else
    Object.assign(body, {
      messages,
      [profile.capabilities.completionTokenField]: limit,
    });
  if (request.temperature !== undefined) {
    assert(
      profile.capabilities.temperature === true &&
        typeof request.temperature === "number" &&
        Number.isFinite(request.temperature) &&
        request.temperature >= 0 &&
        request.temperature <= 1,
      "Temperature is unsupported or invalid.",
    );
    body.temperature = request.temperature;
  }
  if (format.type !== "text") {
    if (profile.protocol === "chat-completions")
      body.response_format =
        format.type === "json"
          ? { type: "json_object" }
          : {
              type: "json_schema",
              json_schema: {
                name: format.name,
                strict: true,
                schema: format.schema,
              },
            };
    else if (profile.protocol === "responses")
      body.text = {
        format:
          format.type === "json"
            ? { type: "json_object" }
            : {
                type: "json_schema",
                name: format.name,
                strict: true,
                schema: format.schema,
              },
      };
    else
      body.output_config = {
        format: { type: "json_schema", schema: format.schema },
      };
  }
  if (request.reasoning !== undefined) {
    keys(request.reasoning, ["effort", "budgetTokens"], "Reasoning request");
    const capability = profile.capabilities.reasoning;
    assert(capability, "Reasoning is not supported by this profile.");
    if (capability.mode === "budget") {
      assert(
        request.reasoning.effort === undefined,
        "Budget reasoning does not accept effort.",
      );
      const budget = integer(
        request.reasoning.budgetTokens,
        "Reasoning budget",
      );
      assert(
        budget >= 1024 && budget < limit,
        "Reasoning budget must leave room for visible output.",
      );
      body.thinking = { type: "enabled", budget_tokens: budget };
    } else {
      assert(
        request.reasoning.budgetTokens === undefined &&
          capability.efforts.includes(request.reasoning.effort),
        "Reasoning effort is unsupported; refusing to downgrade.",
      );
      if (profile.protocol === "responses")
        body.reasoning = { effort: request.reasoning.effort };
      else if (profile.protocol === "messages") {
        body.thinking = { type: "adaptive" };
        body.output_config = {
          ...body.output_config,
          effort: request.reasoning.effort,
        };
      } else body.reasoning_effort = request.reasoning.effort;
    }
  }
  const headers = { "Content-Type": "application/json" };
  if (profile.userAgent) headers["User-Agent"] = profile.userAgent;
  if (profile.apiVersion) headers["anthropic-version"] = profile.apiVersion;
  if (profile.sessionHeader)
    headers[profile.sessionHeader] = headerValue(
      request.sessionId,
      "Conversation session ID",
    );
  else
    assert(
      request.sessionId === undefined,
      "Session routing was requested without a declared header.",
    );
  // Deep snapshot prevents mutation of a schema/profile after preflight.
  return {
    url: profile.endpoint,
    headers,
    body: JSON.parse(JSON.stringify(body)),
  };
}

/**
 * Shared raw transport: no retries, provider selection, parsing or implicit credentials.
 * @param {{url: string, headers: Record<string, string>, body: Record<string, any>, signal?: AbortSignal, fetchImpl?: typeof fetch, rejectRedirects?: boolean}} options
 */
export function postInferenceJson({
  url,
  headers,
  body,
  signal = undefined,
  fetchImpl = fetch,
  rejectRedirects = false,
}) {
  return fetchImpl(url, {
    method: "POST",
    ...(signal ? { signal } : {}),
    headers,
    body: JSON.stringify(body),
    ...(rejectRedirects ? { redirect: "error" } : {}),
  });
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function usageFor(protocol, usage) {
  const source = object(usage) ? usage : {};
  if (protocol === "messages") {
    const fresh = number(source.input_tokens);
    const read = number(source.cache_read_input_tokens);
    const write = number(source.cache_creation_input_tokens);
    return {
      inputTokens: fresh === null ? null : fresh + (read || 0) + (write || 0),
      outputTokens: number(source.output_tokens),
      cachedInputTokens: read,
      cacheWriteTokens: write,
      reasoningTokens: null,
      costUsd: number(source.cost),
      costKind:
        number(source.cost) === null ? "unreported" : "provider-reported",
    };
  }
  const input =
    protocol === "responses" ? source.input_tokens : source.prompt_tokens;
  const output =
    protocol === "responses" ? source.output_tokens : source.completion_tokens;
  const inputDetails =
    protocol === "responses"
      ? source.input_tokens_details
      : source.prompt_tokens_details;
  const outputDetails =
    protocol === "responses"
      ? source.output_tokens_details
      : source.completion_tokens_details;
  return {
    inputTokens: number(input),
    outputTokens: number(output),
    cachedInputTokens: number(inputDetails?.cached_tokens),
    cacheWriteTokens: number(inputDetails?.cache_write_tokens),
    reasoningTokens: number(outputDetails?.reasoning_tokens),
    costUsd: number(source.cost),
    costKind: number(source.cost) === null ? "unreported" : "provider-reported",
  };
}

function retryAfter(headers, now) {
  const value = headers?.get?.("retry-after");
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - now) / 1000))
    : null;
}

/**
 * Normalize state, not just the first text-looking value. Raw/private provider prose is not exposed.
 * @param {Record<string, any>} profile
 * @param {any} payload
 * @param {{httpStatus?: number, headers?: Headers, now?: number}} options
 */
export function normalizeInferenceResponse(
  profile,
  payload,
  { httpStatus = 200, headers = undefined, now = Date.now() } = {},
) {
  validateInferenceProfile(profile);
  const result = {
    provider: profile.provider,
    model: profile.model,
    protocol: profile.protocol,
    id: typeof payload?.id === "string" ? payload.id : null,
    status: "error",
    text: "",
    annotations: [],
    usage: usageFor(profile.protocol, payload?.usage),
    error: null,
    retryAfterSeconds: retryAfter(headers, now),
  };
  const error = (code) => ({
    ...result,
    status: "error",
    text: "",
    error: { code, httpStatus },
  });
  const choiceError =
    Array.isArray(payload?.choices) &&
    payload.choices.some((choice) => choice?.error);
  if (
    httpStatus < 200 ||
    httpStatus >= 300 ||
    payload?.error ||
    choiceError ||
    payload?.type === "error"
  ) {
    const quota = /quota|credit|balance|billing|usage_limit/iu.test(
      String(payload?.error?.code || payload?.error?.type || ""),
    );
    return error(
      httpStatus === 401 || httpStatus === 403
        ? "authentication"
        : httpStatus === 402 || quota
          ? "quota"
          : httpStatus === 429
            ? "rate-limit"
            : httpStatus === 408
              ? "timeout"
              : httpStatus >= 500
                ? "upstream"
                : httpStatus >= 400
                  ? "invalid-request"
                  : "provider-error",
    );
  }
  if (!object(payload)) return error("malformed-response");
  let parts = [];
  let finish;
  let refused = false;
  let action = false;
  let incomplete = false;
  if (profile.protocol === "chat-completions") {
    if (
      !Array.isArray(payload.choices) ||
      payload.choices.length !== 1 ||
      !object(payload.choices[0]?.message) ||
      payload.choices[0].message.role !== "assistant"
    )
      return error("malformed-response");
    const choice = payload.choices[0];
    finish = choice.finish_reason;
    refused = Boolean(choice.message.refusal) || finish === "content_filter";
    action =
      Boolean(choice.message.tool_calls?.length) ||
      ["tool_calls", "function_call"].includes(finish);
    incomplete = ["length", "max_tokens"].includes(finish);
    parts =
      typeof choice.message.content === "string"
        ? [
            {
              type: "text",
              text: choice.message.content,
              annotations: choice.message.annotations,
            },
          ]
        : choice.message.content || [];
    if (!refused && !action && !incomplete && finish !== "stop")
      return error("unknown-finish-state");
  } else if (profile.protocol === "responses") {
    if (!Array.isArray(payload.output)) return error("malformed-response");
    finish = payload.status;
    incomplete = finish === "incomplete";
    if (!["completed", "incomplete"].includes(finish))
      return error("unknown-finish-state");
    for (const item of payload.output) {
      if (
        item?.type === "message" &&
        item.role === "assistant" &&
        Array.isArray(item.content)
      ) {
        if (!["completed", "incomplete"].includes(item.status))
          return error("unknown-finish-state");
        parts.push(...item.content);
        incomplete ||= item.status === "incomplete";
      } else if (item?.type === "reasoning") continue;
      else if (item?.type === "function_call") action = true;
      else return error("unsupported-output-block");
    }
  } else {
    if (
      payload.type !== "message" ||
      payload.role !== "assistant" ||
      !Array.isArray(payload.content)
    )
      return error("malformed-response");
    finish = payload.stop_reason;
    refused = finish === "refusal";
    incomplete = finish === "max_tokens";
    action = finish === "tool_use" || finish === "pause_turn";
    parts = payload.content;
    if (
      !refused &&
      !incomplete &&
      !action &&
      !["end_turn", "stop_sequence"].includes(finish)
    )
      return error("unknown-finish-state");
  }
  if (!Array.isArray(parts)) return error("malformed-response");
  const visible = [];
  const annotations = [];
  for (const part of parts) {
    if (
      ["text", "output_text"].includes(part?.type) &&
      typeof part.text === "string"
    ) {
      visible.push(part.text);
      if (Array.isArray(part.annotations))
        annotations.push(...part.annotations);
      if (Array.isArray(part.citations)) annotations.push(...part.citations);
    } else if (part?.type === "refusal") refused = true;
    else if (
      ["thinking", "redacted_thinking"].includes(part?.type) &&
      profile.protocol === "messages"
    )
      continue;
    else if (part?.type === "tool_use" && profile.protocol === "messages")
      action = true;
    else return error("unsupported-output-block");
  }
  const status = refused
    ? "refused"
    : incomplete
      ? "incomplete"
      : action
        ? "requires-action"
        : "completed";
  const visibleText = visible.join("");
  if (status === "completed" && !visibleText.trim())
    return error("empty-output");
  return {
    ...result,
    status,
    text: status === "completed" ? visibleText : "",
    annotations: status === "completed" ? annotations : [],
  };
}

/** Fail closed before a source/config parser can consume partial or refused output. */
export function requireCompletedInference(result) {
  assert(
    result?.status === "completed" &&
      typeof result.text === "string" &&
      result.text.trim(),
    `Inference did not complete (${result?.status || "unknown"}).`,
  );
  return result.text;
}

/**
 * Explicit opt-in API for new callers; no environment-controlled provider cutover.
 * @param {{profile: Record<string, any>, request: Record<string, any>, apiKey: string, signal?: AbortSignal, fetchImpl?: typeof fetch}} options
 */
export async function inferenceCompletion({
  profile,
  request,
  apiKey,
  signal = undefined,
  fetchImpl = fetch,
}) {
  const wire = buildInferenceRequest(profile, request);
  // Freeze response provenance/capabilities for this dispatch even if the
  // caller later updates its shared role configuration while a request is in flight.
  const target = structuredClone(profile);
  headerValue(apiKey, "Inference credential");
  wire.headers[target.auth === "bearer" ? "Authorization" : "x-api-key"] =
    target.auth === "bearer" ? `Bearer ${apiKey}` : apiKey;
  const transportFailure = () => ({
    ...normalizeInferenceResponse(target, null),
    error: {
      code: signal?.aborted ? "cancelled" : "transport",
      httpStatus: null,
    },
  });
  if (signal?.aborted) return transportFailure();
  let response;
  try {
    response = await postInferenceJson({
      ...wire,
      signal,
      fetchImpl,
      rejectRedirects: true,
    });
  } catch {
    // Fetch errors can embed URLs/provider diagnostics. Do not leak them into
    // user-visible errors, and never retry/fallback at this boundary.
    return transportFailure();
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    if (signal?.aborted) return transportFailure();
    payload = null;
  }
  return normalizeInferenceResponse(target, payload, {
    httpStatus: response.status,
    headers: response.headers,
  });
}
