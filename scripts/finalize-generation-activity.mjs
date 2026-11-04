#!/usr/bin/env node
/**
 * Run-level finalizer for the diagnostic activity trace.
 *
 * It is deliberately the only producer allowed to declare the whole trace
 * complete. A per-script producer finishing early must not close the recording.
 * Diagnostic failure never changes the workflow outcome.
 */
import { activityFromEnv } from "./generation-activity-context.mjs";

export async function finalizeGenerationActivity({
  env = process.env,
  dependencies = {},
} = {}) {
  const producer = activityFromEnv(
    env,
    {
      stage: "handoff",
      actor: { kind: "orchestrator", role: "run_finalizer" },
    },
    dependencies,
  );
  if (producer.context() === null) return { recorded: false, complete: false };
  const outcome = String(env.GENERATION_OUTCOME || "").toLowerCase();
  const complete = outcome === "success";
  try {
    producer.emit("coverage", {
      boundary: "workflow.finalizer",
      status: complete ? "instrumented" : "limited",
      detail: complete
        ? null
        : {
            kind: "text",
            text: `Workflow ended with ${outcome || "unknown"} outcome.`,
          },
    });
    producer.emit("producer_finished", {
      status: complete ? "complete" : "incomplete",
      detail: null,
    });
    return { recorded: true, complete };
  } finally {
    await producer.close();
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const result = await finalizeGenerationActivity();
    console.log(
      `generation_activity_finalized=${
        result.recorded
          ? result.complete
            ? "complete"
            : "incomplete"
          : "disabled"
      }`,
    );
  } catch {
    // Never turn diagnostic evidence into a workflow failure.
    console.log("generation_activity_finalized=skipped");
  }
}
