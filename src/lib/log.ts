// Structured server logs: one JSON object per line (Render's log viewer and grep both work with it).
type Level = "info" | "warn" | "error";

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, msg, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const errorFields = (e: unknown) => ({
  error: (e as Error)?.message ?? String(e),
  name: (e as Error)?.name,
  code: (e as { code?: string })?.code,
});
