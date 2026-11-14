import { randomBytes } from "node:crypto";

export type IdGen = (prefix: string) => string;

/** Short random ids with a readable prefix: clm_3f9a1c2b7d4e. */
export const randomId: IdGen = (prefix) => `${prefix}_${randomBytes(6).toString("hex")}`;

/** Deterministic ids for tests and reproducible scripts. */
export function counterIds(): IdGen {
  const n = new Map<string, number>();
  return (prefix) => {
    const i = (n.get(prefix) ?? 0) + 1;
    n.set(prefix, i);
    return `${prefix}_${String(i).padStart(3, "0")}`;
  };
}

export function slugKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}
