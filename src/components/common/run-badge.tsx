import { cn } from "@/lib/utils";

export function RunBadge({
  mode,
  model,
  calls,
  ms,
  fellBack,
  className,
}: {
  mode: "LIVE" | "CACHED";
  model: string;
  calls?: number | null;
  ms?: number | null;
  fellBack?: boolean;
  className?: string;
}) {
  const live = mode === "LIVE";
  const text = live
    ? `LIVE · ${model} · ${calls ?? 0} call${calls === 1 ? "" : "s"}${ms != null ? ` · ${(ms / 1000).toFixed(1)}s` : ""}`
    : fellBack
      ? "CACHED (AI quota reached)"
      : `CACHED · replay${ms != null ? ` · ${(ms / 1000).toFixed(1)}s` : ""}`;
  return (
    <span
      data-testid="run-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums",
        live ? "border-verified/40 bg-verified/10 text-verified" : "border-border bg-surface-2 text-muted",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", live ? "bg-verified" : "bg-subtle")} />
      {text}
    </span>
  );
}
