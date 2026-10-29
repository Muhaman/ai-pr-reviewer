import picomatch from "picomatch";

export interface ChangedFile {
  filename: string;
  status: string;
  patch?: string | undefined;
}

export interface FilterOptions {
  exclude: string[];
  maxPatchChars: number;
}

const LOCKFILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum",
]);

const isGenerated = picomatch(["dist/**", "*.min.*"], { matchBase: true });

export function shouldReview(file: ChangedFile, options: FilterOptions): boolean {
  if (file.status === "removed" || !file.patch) return false;
  if (file.patch.length > options.maxPatchChars) return false;
  const basename = file.filename.split("/").pop() ?? file.filename;
  if (LOCKFILES.has(basename)) return false;
  if (isGenerated(file.filename)) return false;
  if (options.exclude.length > 0 && picomatch.isMatch(file.filename, options.exclude, { dot: true })) {
    return false;
  }
  return true;
}
