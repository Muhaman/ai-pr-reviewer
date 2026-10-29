type Entry =
  | { kind: "hunk"; text: string }
  | { kind: "add" | "context"; line: number; text: string }
  | { kind: "delete"; text: string };

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parsePatch(patch: string): Entry[] {
  const entries: Entry[] = [];
  let line = 0;
  let inHunk = false;
  for (const text of patch.split("\n")) {
    const header = HUNK_HEADER.exec(text);
    if (header) {
      line = Number(header[1]);
      inHunk = true;
      entries.push({ kind: "hunk", text });
      continue;
    }
    if (!inHunk || text === "" || text.startsWith("\\")) continue;
    if (text.startsWith("-")) {
      entries.push({ kind: "delete", text });
    } else if (text.startsWith("+")) {
      entries.push({ kind: "add", line: line++, text });
    } else {
      entries.push({ kind: "context", line: line++, text });
    }
  }
  return entries;
}

/** New-file line numbers of added and context lines across all hunks. */
export function commentableLines(patch: string): Set<number> {
  const lines = new Set<number>();
  for (const entry of parsePatch(patch)) {
    if (entry.kind === "add" || entry.kind === "context") lines.add(entry.line);
  }
  return lines;
}

/** Renders a patch with each added/context line prefixed by its new-file line number. */
export function numberDiff(patch: string): string {
  return parsePatch(patch)
    .map((entry) => {
      if (entry.kind === "hunk") return entry.text;
      const gutter = entry.kind === "delete" ? "" : String(entry.line);
      return `${gutter.padStart(4)} | ${entry.text}`;
    })
    .join("\n");
}
