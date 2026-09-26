export type TransactionalEmailEnvironment = {
  RESEND_API_KEY?: string;
  LAUNCHLOOM_FROM_EMAIL?: string;
};

export type TransactionalEmail = {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  tag: string;
  idempotencyKey?: string;
  required?: boolean;
};

export async function sendEmail(
  env: TransactionalEmailEnvironment,
  input: TransactionalEmail,
) {
  if (!env.RESEND_API_KEY || !env.LAUNCHLOOM_FROM_EMAIL) {
    if (input.required)
      throw new Error("Transactional email is not configured.");
    return;
  }
  const request: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      from: env.LAUNCHLOOM_FROM_EMAIL,
      to: [input.to],
      reply_to: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: [{ name: "launchloom_kind", value: input.tag }],
    }),
  };
  let response: Response | undefined;
  let lastError: unknown;
  const maxAttempts = input.idempotencyKey ? 3 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch("https://api.resend.com/emails", request);
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status))
        break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < maxAttempts)
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  if (!response)
    throw new Error(
      `Email delivery failed: ${lastError instanceof Error ? lastError.message : "network error"}`,
    );
  if (!response.ok)
    throw new Error(`Email delivery failed: ${response.status}`);
}
