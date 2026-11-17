// Testimony provenance stored in Source.meta by Smart Draft. Pure, shared by server and client.

export type TestimonyMeta = { draftedWithAssistant?: boolean; confirmedBy?: string; confirmedAt?: string; followUpId?: string };

export function asTestimonyMeta(meta: unknown): TestimonyMeta {
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as TestimonyMeta) : {};
}

/** "Drafted with assistant, confirmed by Meera Kulkarni", or null for testimony typed by hand. */
export function provenanceLabel(meta: unknown): string | null {
  const m = asTestimonyMeta(meta);
  return m.draftedWithAssistant ? `Drafted with assistant, confirmed by ${m.confirmedBy ?? "the author"}` : null;
}
