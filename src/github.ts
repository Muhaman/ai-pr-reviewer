import type { getOctokit } from "@actions/github";
import type { ChangedFile } from "./filter.js";
import type { Finding } from "./review.js";

export interface PullRef {
  owner: string;
  repo: string;
  pullNumber: number;
}

export interface Review {
  event: "COMMENT";
  body: string;
  comments: { path: string; line: number; side: "RIGHT"; body: string }[];
}

/** The slice of the GitHub API this action needs; keeps `run` testable. */
export interface PullsClient {
  listFiles(pr: PullRef): Promise<ChangedFile[]>;
  createReview(pr: PullRef, review: Review): Promise<void>;
}

export function createPullsClient(octokit: ReturnType<typeof getOctokit>): PullsClient {
  return {
    async listFiles(pr) {
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner: pr.owner,
        repo: pr.repo,
        pull_number: pr.pullNumber,
        per_page: 100,
      });
      return files.map((f) => ({ filename: f.filename, status: f.status, patch: f.patch }));
    },
    async createReview(pr, review) {
      await octokit.rest.pulls.createReview({
        owner: pr.owner,
        repo: pr.repo,
        pull_number: pr.pullNumber,
        event: review.event,
        body: review.body,
        comments: review.comments,
      });
    },
  };
}

export function toReviewComment(finding: Finding): Review["comments"][number] {
  return {
    path: finding.path,
    line: finding.line,
    side: "RIGHT",
    body: `**${finding.severity.toUpperCase()}: ${finding.title}**\n\n${finding.body}`,
  };
}
