import { describe, expect, it } from "vitest";
import { repositoryBootstrapState } from "../scripts/client-repository-bootstrap.mjs";

describe("client repository bootstrap state", () => {
  it("resumes an existing review branch", () => {
    expect(
      repositoryBootstrapState(
        "abc123\trefs/heads/main\ndef456\trefs/heads/review/initial\n",
      ),
    ).toBe("review");
  });

  it("branches from an existing main after a partial failed run", () => {
    expect(repositoryBootstrapState("abc123\trefs/heads/main\n")).toBe("main");
  });

  it("initializes only a repository with no branches", () => {
    expect(repositoryBootstrapState("")).toBe("empty");
  });
});
