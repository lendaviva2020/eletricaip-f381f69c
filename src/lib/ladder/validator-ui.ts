import type { LadderIssue } from "./validator";

export function groupIssuesByRung(issues: LadderIssue[]): Map<string, LadderIssue[]> {
  const map = new Map<string, LadderIssue[]>();
  for (const issue of issues) {
    const arr = map.get(issue.rungId) ?? [];
    arr.push(issue);
    map.set(issue.rungId, arr);
  }
  return map;
}
