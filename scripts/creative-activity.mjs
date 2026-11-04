import { processActivity } from "./generation-activity-context.mjs";
import { observePipelineAction } from "./generation-activity-action.mjs";

export function observeCreativeAction({ activity, boundary, stage, name, candidateId = null, repairPass = null, input = {}, invoke, projectResult }) {
  let producer = null;
  try {
    producer = (activity || processActivity()).withContext({
      stage, substep: name, candidateId, repairPass,
      actor: { kind: "orchestrator", role: stage },
    });
    producer.emit("coverage", {
      boundary,
      status: "instrumented",
      detail: {
        kind: "text",
        text: "Real pipeline action wrapped at the invocation boundary.",
      },
    });
  } catch { /* Diagnostic setup must not prevent the action. */ }
  return observePipelineAction({ producer, name, input, invoke, projectResult });
}

/** Script-local context only. Never capture request bodies, findings or URLs. */
export function creativeModelActivity(boundary, semantic, activity = null) {
  try {
    const producer = (activity || processActivity()).withContext({
      ...semantic,
      actor: { kind: "model", role: semantic.stage },
    });
    producer.emit("coverage", {
      boundary,
      status: "limited",
      detail: {
        kind: "text",
        text: "OpenCode Go dispatches observed; legacy OpenRouter caller remains unobserved.",
      },
    });
    return producer;
  } catch { return null; /* Diagnostic setup must not prevent inference. */ }
}
