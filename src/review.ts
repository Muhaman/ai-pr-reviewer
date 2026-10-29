import { numberDiff } from "./diff.js";
import { SEVERITIES, type Llm, type Severity } from "./llm.js";

export type { Severity };

export interface Finding {
  path: string;
  line: number;
  severity: Severity;
  title: string;
  body: string;
}

const SYSTEM_PROMPT = `You are a senior engineer reviewing one file of a pull request.
You receive a unified diff in which every added or unchanged line is prefixed with its line number in the new version of the file; removed lines have no number.

Report only real problems introduced or exposed by the change: bugs, security issues, data loss, race conditions, broken error handling, missing validation, and clear maintainability hazards. Do not comment on style, formatting or naming preferences, and do not praise.
Each finding must point at a line number shown in the diff (an added or unchanged line). Severity: critical = exploitable or data-destroying, major = likely bug in normal use, minor = edge case or hazard, info = optional note.
If the change looks correct, return an empty findings list.`;

export async function reviewFile(
  llm: Llm,
  file: { filename: string; patch: string },
): Promise<Finding[]> {
  const user = `File: ${file.filename}\n\n${numberDiff(file.patch)}`;
  const { findings } = await llm.review({ system: SYSTEM_PROMPT, user });
  return findings.map((finding) => ({ ...finding, path: file.filename }));
}

export function filterFindings(
  findings: Finding[],
  commentable: Map<string, Set<number>>,
  min: Severity,
): Finding[] {
  const minRank = SEVERITIES.indexOf(min);
  return findings.filter(
    (f) => SEVERITIES.indexOf(f.severity) >= minRank && commentable.get(f.path)?.has(f.line) === true,
  );
}
