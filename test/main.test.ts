import { describe, expect, it, vi } from "vitest";
import type { Llm } from "../src/llm.js";
import { run, type PullsClient, type RunDeps } from "../src/main.js";

const patch = "@@ -1,2 +1,3 @@\n a\n+b\n c";
const files = [
  { filename: "src/a.ts", status: "modified", patch },
  { filename: "src/b.ts", status: "modified", patch },
  { filename: "package-lock.json", status: "modified", patch },
];

const inputs: RunDeps["inputs"] = {
  maxFiles: 20,
  minSeverity: "minor",
  exclude: [],
};
const context = { owner: "o", repo: "r", pullNumber: 7 };

const makeClient = (): PullsClient & { createReview: ReturnType<typeof vi.fn> } => ({
  listFiles: vi.fn(async () => files),
  createReview: vi.fn(async () => undefined),
});

const finding = { line: 2, severity: "major" as const, title: "Bug", body: "Fix it" };

describe("run", () => {
  it("posts one COMMENT review with an inline comment per reviewed file", async () => {
    const octokit = makeClient();
    const llm: Llm = { review: vi.fn(async () => ({ findings: [finding] })) };

    await run({ octokit, llm, context, inputs });

    expect(llm.review).toHaveBeenCalledTimes(2);
    expect(octokit.createReview).toHaveBeenCalledTimes(1);
    const [pr, review] = octokit.createReview.mock.calls[0] ?? [];
    expect(pr).toEqual(context);
    expect(review.event).toBe("COMMENT");
    expect(review.comments).toHaveLength(2);
    expect(review.comments[0]).toMatchObject({ path: "src/a.ts", line: 2, side: "RIGHT" });
  });

  it("keeps reviewing other files when one fails and reports the skipped file", async () => {
    const octokit = makeClient();
    const llm: Llm = {
      review: vi.fn(async ({ user }: { user: string }) => {
        if (user.includes("src/a.ts")) throw new Error("boom");
        return { findings: [finding] };
      }),
    };

    await run({ octokit, llm, context, inputs });

    const [, review] = octokit.createReview.mock.calls[0] ?? [];
    expect(review.comments).toHaveLength(1);
    expect(review.comments[0].path).toBe("src/b.ts");
    expect(review.body).toContain("src/a.ts");
    expect(review.body).toContain("boom");
  });

  it("posts a summary-only review when there are no findings", async () => {
    const octokit = makeClient();
    const llm: Llm = { review: vi.fn(async () => ({ findings: [] })) };

    await run({ octokit, llm, context, inputs });

    const [, review] = octokit.createReview.mock.calls[0] ?? [];
    expect(review.comments).toEqual([]);
    expect(review.body).toContain("No issues");
  });

  it("limits the number of reviewed files to max_files", async () => {
    const octokit = makeClient();
    const llm: Llm = { review: vi.fn(async () => ({ findings: [] })) };

    await run({ octokit, llm, context, inputs: { ...inputs, maxFiles: 1 } });

    expect(llm.review).toHaveBeenCalledTimes(1);
  });
});
