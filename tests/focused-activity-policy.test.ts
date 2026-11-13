import { describe, expect, it } from "vitest";
import {
  activityWorkflowPolicy,
  operationsWorkflowPolicy,
  TEST_GENERATION_WORKFLOW_REF,
} from "../worker/src/operations/github-auth";

const env = {
  OPERATIONS_OIDC_AUDIENCE: "launchloom-operations",
  OPERATIONS_OIDC_REPOSITORY_ID: "123456",
};

describe("focused activity OIDC policy", () => {
  it("allows the reusable focused workflow job claim", () => {
    const policy = activityWorkflowPolicy(env);
    expect(policy.jobWorkflowRefs).toContain(TEST_GENERATION_WORKFLOW_REF);
    expect(policy.jobWorkflowRefs).toContain(policy.workflowRef);
  });

  it("does not widen the operations lifecycle policy", () => {
    const policy = operationsWorkflowPolicy(env);
    expect(policy.jobWorkflowRefs).toBeUndefined();
  });
});
