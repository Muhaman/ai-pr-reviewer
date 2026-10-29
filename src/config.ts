import { z } from "zod";
import { SEVERITIES, type Severity } from "./llm.js";

export interface ActionInputs {
  anthropicApiKey: string;
  githubToken: string;
  model: string;
  maxFiles: number;
  minSeverity: Severity;
  exclude: string[];
}

const RawInputsSchema = z.object({
  anthropic_api_key: z.string().min(1, "input anthropic_api_key is required"),
  github_token: z.string().min(1, "input github_token is required"),
  model: z.string().min(1),
  max_files: z.coerce.number().int().positive(),
  min_severity: z.enum(SEVERITIES),
  exclude: z.string(),
});

/** `read` is `core.getInput` in production; injected so tests need no process env. */
export function loadInputs(read: (name: string) => string): ActionInputs {
  const raw = RawInputsSchema.parse({
    anthropic_api_key: read("anthropic_api_key"),
    github_token: read("github_token"),
    model: read("model"),
    max_files: read("max_files"),
    min_severity: read("min_severity"),
    exclude: read("exclude"),
  });
  return {
    anthropicApiKey: raw.anthropic_api_key,
    githubToken: raw.github_token,
    model: raw.model,
    maxFiles: raw.max_files,
    minSeverity: raw.min_severity,
    exclude: raw.exclude
      .split("\n")
      .map((glob) => glob.trim())
      .filter(Boolean),
  };
}
