import crypto from "node:crypto";

const CODE = /^[a-z0-9_.-]{1,80}$/u;

/**
 * Run one real orchestration action as observable evidence.
 *
 * The action still runs exactly once. Invalid or dropped evidence never blocks
 * it, and failures are rethrown unchanged after being recorded.
 */
export async function observePipelineAction({
  producer,
  actionId,
  name,
  input = {},
  invoke,
  projectResult = () => ({}),
  now = () => Date.now(),
}) {
  if (!producer) return invoke();
  const emit = (kind, payload) => {
    try { producer.emit(kind, payload); } catch { /* Diagnostic evidence is best effort. */ }
  };
  const id = actionId || crypto.randomUUID();
  emit("action_started", { actionId: id, name, input });
  const startedAt = now();
  try {
    const value = await invoke();
    let result = {};
    try { result = projectResult(value) || {}; } catch { /* Never turn success into failure. */ }
    emit("action_finished", {
      actionId: id,
      name,
      status: "succeeded",
      durationMs: Math.max(0, now() - startedAt),
      result,
    });
    return value;
  } catch (error) {
    emit("action_finished", {
      actionId: id,
      name,
      status: "failed",
      durationMs: Math.max(0, now() - startedAt),
      result: {},
    });
    const code = String(error?.code ?? "");
    emit("error", {
      scope: "action",
      code: CODE.test(code) ? code : "action_failed",
      message: {
        kind: "text",
        // Action errors can echo prompts, candidate source or provider URLs.
        // Keep the trace to a code and point at authoritative evidence.
        text: "Pipeline action failed. See authoritative generation evidence for details.",
      },
    });
    throw error;
  }
}
