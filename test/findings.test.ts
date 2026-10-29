import { describe, expect, it } from "vitest";
import { filterFindings, type Finding } from "../src/review.js";

const finding = (over: Partial<Finding>): Finding => ({
  path: "src/a.ts",
  line: 2,
  severity: "major",
  title: "t",
  body: "b",
  ...over,
});

describe("filterFindings", () => {
  const commentable = new Map([["src/a.ts", new Set([1, 2, 3])]]);

  it("drops findings on lines that are not in the diff", () => {
    const out = filterFindings([finding({ line: 99 }), finding({ line: 3 })], commentable, "minor");
    expect(out.map((f) => f.line)).toEqual([3]);
  });

  it("drops findings for files without commentable lines", () => {
    expect(filterFindings([finding({ path: "other.ts" })], commentable, "minor")).toEqual([]);
  });

  it("drops findings below the minimum severity", () => {
    const out = filterFindings(
      [finding({ severity: "info" }), finding({ severity: "minor" }), finding({ severity: "critical" })],
      commentable,
      "minor",
    );
    expect(out.map((f) => f.severity)).toEqual(["minor", "critical"]);
  });
});
