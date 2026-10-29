import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commentableLines, numberDiff } from "../src/diff.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("commentableLines", () => {
  it("returns new-file line numbers of added and context lines", () => {
    const patch = "@@ -1,3 +1,4 @@\n a\n-b\n+c\n+d\n e";
    expect(commentableLines(patch)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("combines lines across multiple hunks", () => {
    expect(commentableLines(fixture("two-hunks.patch"))).toEqual(
      new Set([1, 2, 3, 4, 11, 12, 13]),
    );
  });

  it("ignores the no-newline marker", () => {
    const patch = "@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file";
    expect(commentableLines(patch)).toEqual(new Set([1]));
  });
});

describe("numberDiff", () => {
  it("prefixes added and context lines with their new-file line number", () => {
    const out = numberDiff("@@ -1,3 +1,3 @@\n a\n-b\n+c\n e");
    expect(out.split("\n")).toEqual([
      "@@ -1,3 +1,3 @@",
      "   1 |  a",
      "     | -b",
      "   2 | +c",
      "   3 |  e",
    ]);
  });
});
