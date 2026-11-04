import type {
  TraceSafeFields,
  TracePayloads,
} from "../src/lib/generation-activity";
import type { ActivityChildProducer } from "./generation-activity-client.mjs";

export function observePipelineAction<T>(options: {
  producer: Pick<ActivityChildProducer, "emit"> | null | undefined;
  actionId?: string;
  name: string;
  input?: TraceSafeFields;
  invoke(): Promise<T>;
  projectResult?(value: T): TraceSafeFields;
  now?(): number;
}): Promise<T>;
