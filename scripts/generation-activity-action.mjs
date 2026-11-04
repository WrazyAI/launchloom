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
  const id = actionId || crypto.randomUUID();
  producer.emit("action_started", { actionId: id, name, input });
  const startedAt = now();
  try {
    const value = await invoke();
    producer.emit("action_finished", {
      actionId: id,
      name,
      status: "succeeded",
      durationMs: Math.max(0, now() - startedAt),
      result: projectResult(value) || {},
    });
    return value;
  } catch (error) {
    producer.emit("action_finished", {
      actionId: id,
      name,
      status: "failed",
      durationMs: Math.max(0, now() - startedAt),
      result: {},
    });
    const code = String(error?.code ?? "");
    producer.emit("error", {
      scope: "action",
      code: CODE.test(code) ? code : "action_failed",
      message: {
        kind: "text",
        text: String(error?.message || `${name} failed.`),
      },
    });
    throw error;
  }
}
