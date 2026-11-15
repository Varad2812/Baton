import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Info } from "@/components/ui/info";
import { Sparkline } from "@/components/ui/sparkline";

export function Stat({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  deltaGood = "up",
  spark,
  sparkColor,
  footer,
  className,
  info,
  help,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  deltaGood?: "up" | "down";
  spark?: number[];
  sparkColor?: string;
  footer?: React.ReactNode;
  className?: string;
  info?: React.ReactNode;
  /** One plain sentence; renders an (i) tooltip next to the label. */
  help?: string;
}) {
  const good = delta === undefined ? null : deltaGood === "up" ? delta >= 0 : delta <= 0;
  return (
    <div className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-surface px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1 truncate">{label}</span>
        {help ? <Info text={help} /> : info}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-[26px] font-medium leading-none tracking-tight text-text tabular-nums">{value}</span>
          {unit && <span className="font-mono text-sm text-subtle">{unit}</span>}
        </div>
        {spark && <Sparkline values={spark} color={sparkColor} className="mb-0.5" />}
      </div>
      {(delta !== undefined || footer) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-subtle">
          {delta !== undefined && (
            <span className={cn("inline-flex items-center gap-0.5 font-mono", good ? "text-verified" : "text-conflicting")}>
              {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
          {deltaLabel && <span>{deltaLabel}</span>}
          {footer}
        </div>
      )}
    </div>
  );
}
