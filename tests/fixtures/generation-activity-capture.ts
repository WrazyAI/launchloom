import type { TraceContext } from "../../src/lib/generation-activity";
import { BASE_CONTEXT } from "./generation-activity";

export function captureActivity() {
  const events: { kind: string; payload: any; context: TraceContext }[] = [];
  function scope(context: TraceContext): any {
    return {
      context: () => context,
      withContext: (next: Partial<TraceContext>) => scope({ ...context, ...next }),
      emit: (kind: string, payload: any) => {
        events.push({ kind, payload, context });
        return true;
      },
      close: async () => {},
      flush: async () => {},
    };
  }
  return { events, producer: scope(BASE_CONTEXT) };
}
