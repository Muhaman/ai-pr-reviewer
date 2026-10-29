import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const SEVERITIES = ["info", "minor", "major", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ReviewOutputSchema = z.object({
  findings: z.array(
    z.object({
      line: z.number().int().describe("New-file line number the comment applies to"),
      severity: z.enum(SEVERITIES),
      title: z.string().describe("One-line summary of the issue"),
      body: z.string().describe("Explanation and suggested fix"),
    }),
  ),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export interface ReviewRequest {
  system: string;
  user: string;
}

export interface Llm {
  review(request: ReviewRequest): Promise<ReviewOutput>;
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

const MAX_TOKENS = 16_000;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

/** Server-side refusal fallback is only accepted on these models; others reject the parameter. */
export function supportsServerFallback(model: string): boolean {
  return FALLBACK_MODELS.has(model);
}

export interface ParseClient {
  beta: { messages: { parse: Anthropic["beta"]["messages"]["parse"] } };
}

type FallbackParams = { betas: string[]; fallbacks: "default" } | Record<string, never>;

export function createLlm(
  apiKey: string,
  model: string,
  client: ParseClient = new Anthropic({ apiKey }),
): Llm {
  const fallback: FallbackParams = supportsServerFallback(model)
    ? { betas: [FALLBACK_BETA], fallbacks: "default" }
    : {};
  return {
    async review({ system, user }) {
      let response;
      try {
        response = await client.beta.messages.parse({
          model,
          max_tokens: MAX_TOKENS,
          ...fallback,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: "high", format: zodOutputFormat(ReviewOutputSchema) },
        });
      } catch (err) {
        if (err instanceof SyntaxError || err instanceof z.ZodError) {
          throw new LlmError(`Claude returned invalid or truncated output: ${err.message}`);
        }
        throw err;
      }
      if (response.stop_reason === "refusal") {
        const category = response.stop_details?.category ?? "unspecified";
        throw new LlmError(`Claude declined to review this file (category: ${category})`);
      }
      if (response.stop_reason === "max_tokens") {
        throw new LlmError("Claude's review was cut off at max_tokens");
      }
      if (!response.parsed_output) {
        throw new LlmError("Claude returned output that did not match the review schema");
      }
      return response.parsed_output;
    },
  };
}
