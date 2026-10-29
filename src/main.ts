import type { ActionInputs } from "./config.js";
import { commentableLines } from "./diff.js";
import { shouldReview } from "./filter.js";
import { toReviewComment, type PullRef, type PullsClient } from "./github.js";
import type { Llm } from "./llm.js";
import { filterFindings, reviewFile, type Finding } from "./review.js";

export type { PullRef, PullsClient };

export interface RunDeps {
  octokit: PullsClient;
  llm: Llm;
  context: PullRef;
  inputs: Pick<ActionInputs, "maxFiles" | "minSeverity" | "exclude">;
}

const MAX_PATCH_CHARS = 20_000;
const CONCURRENCY = 4;

interface Outcome {
  filename: string;
  findings: Finding[];
  error?: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function summarize(reviewed: number, outcomes: Outcome[], posted: Finding[], notReviewed: number): string {
  const failed = outcomes.filter((o) => o.error !== undefined);
  const succeeded = reviewed - failed.length;
  const lines = ["## AI review", ""];
  if (posted.length > 0) {
    const counts = new Map<string, number>();
    for (const f of posted) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
    const breakdown = [...counts].map(([severity, n]) => `${n} ${severity}`).join(", ");
    lines.push(`Reviewed ${succeeded} file(s) and left ${posted.length} inline comment(s) (${breakdown}).`);
  } else if (succeeded > 0) {
    lines.push(`Reviewed ${succeeded} file(s). No issues found at or above the configured severity.`);
  } else {
    lines.push("No files were reviewed.");
  }
  if (notReviewed > 0) {
    lines.push("", `${notReviewed} file(s) were not reviewed because of the \`max_files\` limit.`);
  }
  if (failed.length > 0) {
    lines.push("", "Skipped after errors:");
    for (const o of failed) lines.push(`- \`${o.filename}\`: ${o.error}`);
  }
  return lines.join("\n");
}

export async function run({ octokit, llm, context, inputs }: RunDeps): Promise<void> {
  const changed = await octokit.listFiles(context);
  const eligible = changed.filter((f) =>
    shouldReview(f, { exclude: inputs.exclude, maxPatchChars: MAX_PATCH_CHARS }),
  );
  const selected = eligible.slice(0, inputs.maxFiles);

  const commentable = new Map<string, Set<number>>();
  const outcomes = await mapWithConcurrency(selected, CONCURRENCY, async (file): Promise<Outcome> => {
    const patch = file.patch as string;
    commentable.set(file.filename, commentableLines(patch));
    try {
      return { filename: file.filename, findings: await reviewFile(llm, { filename: file.filename, patch }) };
    } catch (err) {
      return { filename: file.filename, findings: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  const posted = filterFindings(outcomes.flatMap((o) => o.findings), commentable, inputs.minSeverity);
  await octokit.createReview(context, {
    event: "COMMENT",
    body: summarize(selected.length, outcomes, posted, eligible.length - selected.length),
    comments: posted.map(toReviewComment),
  });
}
