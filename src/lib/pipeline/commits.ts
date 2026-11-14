// Commit-history parsing shared by single-owner detection (gaps stage) and the dashboard bus factor.
// Commit chunks hold blocks of "hash · date · Name (@handle)\nmessage\nfiles: a, b".

export type ParsedCommit = { chunkId: string; header: string; hash: string; date: string; name: string; handle: string | null; files: string[] };

const HEADER = /^([0-9a-f]{7}) · (\d{4}-\d{2}-\d{2}) · (.+?)(?: \(@([^)]+)\))?$/;

/** Repo-wide commits touching this many areas (scaffolding, formatting) say nothing about ownership. */
export const SCAFFOLD_AREAS = 4;

export function parseCommitChunks(chunks: { id: string; text: string }[]): ParsedCommit[] {
  const out: ParsedCommit[] = [];
  for (const c of chunks) {
    let cur: ParsedCommit | null = null;
    for (const line of c.text.split("\n")) {
      const h = line.match(HEADER);
      if (h) {
        cur = { chunkId: c.id, header: line, hash: h[1], date: h[2], name: h[3], handle: h[4] ?? null, files: [] };
        out.push(cur);
      } else if (cur && line.startsWith("files: ")) {
        cur.files.push(...line.slice(7).split(",").map((f) => f.trim()).filter(Boolean));
      }
    }
  }
  return out;
}

/** "services/email-templates/src/x.ts" -> "services/email-templates"; "docs/a.md" -> "docs". */
export function areaOf(file: string): string | null {
  const parts = file.split("/");
  if (parts.length < 2) return null;
  if (["services", "packages", "apps", "libs", "modules"].includes(parts[0]) && parts.length >= 3) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

/** Commits grouped by area, skipping repo-wide scaffold commits. */
export function commitsByArea(commits: ParsedCommit[]): Map<string, ParsedCommit[]> {
  const byArea = new Map<string, ParsedCommit[]>();
  for (const cm of commits) {
    const areas = new Set(cm.files.map(areaOf).filter((x): x is string => !!x));
    if (areas.size >= SCAFFOLD_AREAS) continue;
    for (const a of areas) {
      const l = byArea.get(a) ?? [];
      l.push(cm);
      byArea.set(a, l);
    }
  }
  return byArea;
}
