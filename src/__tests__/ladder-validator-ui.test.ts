import { describe, it, expect } from "vitest";
import { groupIssuesByRung } from "../lib/ladder/validator-ui";
import type { LadderIssue } from "../lib/ladder/validator";

describe("groupIssuesByRung", () => {
  it("groups issues by rungId", () => {
    const issues: LadderIssue[] = [
      { rungId: "r1", level: "error", code: "BAD_OUTPUT", message: "Output missing" },
      { rungId: "r1", level: "warn", code: "NO_INPUT", message: "No input" },
      { rungId: "r2", level: "warn", code: "DUPLICATE_COIL", message: "Double coil" },
    ];
    const map = groupIssuesByRung(issues);
    expect(map.get("r1")?.length).toBe(2);
    expect(map.get("r1")?.some((i) => i.level === "error")).toBe(true);
    expect(map.get("r2")?.length).toBe(1);
    expect(map.get("missing")).toBeUndefined();
  });

  it("returns empty map for empty issues", () => {
    const map = groupIssuesByRung([]);
    expect(map.size).toBe(0);
  });
});
