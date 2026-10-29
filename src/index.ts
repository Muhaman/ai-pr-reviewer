import * as core from "@actions/core";
import * as github from "@actions/github";
import { loadInputs } from "./config.js";
import { createPullsClient } from "./github.js";
import { createLlm } from "./llm.js";
import { run } from "./main.js";

async function main(): Promise<void> {
  const pullNumber = github.context.payload.pull_request?.number;
  if (pullNumber === undefined) {
    core.info("Not a pull_request event; nothing to review.");
    return;
  }
  const inputs = loadInputs((name) => core.getInput(name));
  core.setSecret(inputs.anthropicApiKey);
  await run({
    octokit: createPullsClient(github.getOctokit(inputs.githubToken)),
    llm: createLlm(inputs.anthropicApiKey, inputs.model),
    context: { ...github.context.repo, pullNumber },
    inputs,
  });
}

main().catch((err: unknown) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
