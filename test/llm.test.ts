import { describe, expect, it, vi } from "vitest";
import { createLlm, LlmError, supportsServerFallback, type ParseClient } from "../src/llm.js";

const request = { system: "s", user: "u" };
const parsed = { findings: [{ line: 1, severity: "minor", title: "t", body: "b" }] };

function stub(impl: (params: unknown) => Promise<unknown>) {
  const parse = vi.fn(impl);
  return { client: { beta: { messages: { parse } } } as unknown as ParseClient, parse };
}

const ok = async (_params?: unknown) => ({ stop_reason: "end_turn", stop_details: null, parsed_output: parsed });

describe("supportsServerFallback", () => {
  it("is true for opus and sonnet 5.5 and false for haiku", () => {
    expect(supportsServerFallback("claude-opus-5-5")).toBe(true);
    expect(supportsServerFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsServerFallback("claude-haiku-5-5")).toBe(false);
  });
});

describe("createLlm", () => {
  it("sends no betas or fallbacks for a model without server-side fallback", async () => {
    const { client, parse } = stub(ok);
    await createLlm("k", "claude-haiku-5-5", client).review(request);
    const params = parse.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).not.toHaveProperty("betas");
    expect(params).not.toHaveProperty("fallbacks");
    expect(params.model).toBe("claude-haiku-5-5");
  });

  it("opts into server-side fallback on opus", async () => {
    const { client, parse } = stub(ok);
    await createLlm("k", "claude-opus-5-5", client).review(request);
    const params = parse.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
  });

  it("returns the parsed findings", async () => {
    const { client } = stub(ok);
    await expect(createLlm("k", "claude-opus-5-5", client).review(request)).resolves.toEqual(parsed);
  });

  it("throws a typed error on refusal", async () => {
    const { client } = stub(async () => ({
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber" },
      parsed_output: null,
    }));
    const err = await createLlm("k", "claude-opus-5-5", client).review(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as Error).message).toContain("cyber");
  });

  it("throws a typed error on max_tokens", async () => {
    const { client } = stub(async () => ({ stop_reason: "max_tokens", stop_details: null, parsed_output: null }));
    await expect(createLlm("k", "claude-opus-5-5", client).review(request)).rejects.toThrow(/max_tokens/);
  });

  it("turns a SyntaxError from parsing into a typed invalid-output error", async () => {
    const { client } = stub(async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    });
    const err = await createLlm("k", "claude-opus-5-5", client).review(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as Error).message).toContain("invalid or truncated");
  });

  it("rethrows unrelated errors unchanged", async () => {
    const boom = new Error("network down");
    const { client } = stub(async () => {
      throw boom;
    });
    await expect(createLlm("k", "claude-opus-5-5", client).review(request)).rejects.toBe(boom);
  });
});
