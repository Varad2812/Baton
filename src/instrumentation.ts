// Runs once when the server starts (Next instrumentation hook). Removes expired sandboxes and
// visitor projects now and then every hour. The guard keeps one timer per process.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __batonCleanup?: ReturnType<typeof setInterval> };
  if (g.__batonCleanup) return;
  const { cleanupExpired } = await import("@/lib/sandbox");
  const { errorFields, log } = await import("@/lib/log");
  // Never crash the server on a stray promise; log it with enough context to find it.
  process.on("unhandledRejection", (e) => log("error", "unhandled rejection", errorFields(e)));
  const run = () =>
    cleanupExpired()
      .then((r) => r.deleted && console.log(JSON.stringify({ level: "info", msg: "cleanup", ...r })))
      .catch((e) => console.error(JSON.stringify({ level: "error", msg: "cleanup failed", error: (e as Error)?.message })));
  setTimeout(run, 5_000);
  g.__batonCleanup = setInterval(run, 60 * 60_000);
  g.__batonCleanup.unref?.();
}
