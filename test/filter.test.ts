import { describe, expect, it } from "vitest";
import { shouldReview } from "../src/filter.js";

const opts = { exclude: [] as string[], maxPatchChars: 20_000 };
const file = (
  filename: string,
  extra: { status?: string; patch?: string | undefined } = {},
) => ({
  filename,
  status: "modified",
  patch: "@@ -1 +1 @@\n-a\n+b",
  ...extra,
});

describe("shouldReview", () => {
  it("skips lockfiles", () => {
    expect(shouldReview(file("package-lock.json"), opts)).toBe(false);
    expect(shouldReview(file("services/api/uv.lock"), opts)).toBe(false);
  });

  it("accepts ordinary source files", () => {
    expect(shouldReview(file("src/a.ts"), opts)).toBe(true);
  });

  it("skips removed files", () => {
    expect(shouldReview(file("src/a.ts", { status: "removed" }), opts)).toBe(false);
  });

  it("skips files without a patch", () => {
    expect(shouldReview(file("src/a.ts", { patch: undefined }), opts)).toBe(false);
  });

  it("skips dist output and minified files", () => {
    expect(shouldReview(file("dist/index.js"), opts)).toBe(false);
    expect(shouldReview(file("web/app.min.js"), opts)).toBe(false);
  });

  it("applies exclude globs", () => {
    const o = { ...opts, exclude: ["docs/**"] };
    expect(shouldReview(file("docs/x.md"), o)).toBe(false);
    expect(shouldReview(file("src/x.md"), o)).toBe(true);
  });

  it("skips oversized patches", () => {
    const patch = "+".repeat(20_001);
    expect(shouldReview(file("src/big.ts", { patch }), opts)).toBe(false);
  });
});
