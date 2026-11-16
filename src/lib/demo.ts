// Demo project naming (client-safe, no Node APIs). The seeded demo "festflow" is a TEMPLATE; each
// visitor works on a private copy at /p/festflow-<key> whose seeded ids end in "~<key>".

export const DEMO_SLUG = "festflow";
export const SANDBOX_RE = /^festflow-([0-9a-f]{10})$/;

/** The template or a visitor's copy of it. */
export const isDemoSlug = (slug: string | null | undefined): boolean => !!slug && (slug === DEMO_SLUG || SANDBOX_RE.test(slug));

/** "~<key>" for a sandbox slug, "" otherwise. */
export function demoSuffix(slug: string): string {
  const m = slug.match(SANDBOX_RE);
  return m ? `~${m[1]}` : "";
}

/** A fixed demo id ("clm_auth_supabase") as it exists in this project. Ids that already carry a suffix pass through. */
export function demoId(slug: string, id: string): string;
export function demoId(slug: string, id: string | undefined): string | undefined;
export function demoId(slug: string, id: string | undefined): string | undefined {
  if (!id || id.includes("~")) return id;
  return `${id}${demoSuffix(slug)}`;
}

/** "clm_auth_supabase~ab12cd34ef" -> "clm_auth_supabase". */
export const baseId = (id: string) => id.split("~")[0];

/** Slug of the project in a /p/<slug>/... path, or null. */
export function slugFromPath(pathname: string | null | undefined): string | null {
  return pathname?.match(/^\/p\/([^/?#]+)/)?.[1] ?? null;
}
