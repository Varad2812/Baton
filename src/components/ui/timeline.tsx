import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  date: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Earlier state this item replaced (rendered as "from → to"). */
  from?: React.ReactNode;
  color?: string;
  dashed?: boolean;
  aside?: React.ReactNode;
};

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {items.map((it, i) => (
        <li key={it.id} className="relative grid grid-cols-[52px_16px_1fr] gap-x-2 pb-3 last:pb-0">
          <time className="pt-px text-right font-mono text-[11px] text-subtle">{it.date}</time>
          <div className="relative flex justify-center">
            {i < items.length - 1 && <span aria-hidden className="absolute top-3 bottom-[-12px] w-px bg-border" />}
            <span
              aria-hidden
              className={cn("relative mt-[5px] size-2 rounded-full ring-4 ring-surface", it.dashed && "bg-transparent")}
              style={it.dashed ? { boxShadow: `inset 0 0 0 1.5px ${it.color}` } : { background: it.color ?? "var(--subtle)" }}
            />
          </div>
          <div className="min-w-0">
            {it.from && (
              <div className="mb-0.5 flex items-center gap-1.5 text-xs text-subtle">
                <span className="truncate line-through decoration-subtle/60">{it.from}</span>
                <ArrowRight className="size-3 shrink-0 text-verified" aria-label="superseded by" />
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 text-[13px] leading-snug text-text">{it.title}</div>
              {it.aside && <div className="shrink-0">{it.aside}</div>}
            </div>
            {it.meta && <div className="mt-0.5 text-xs text-subtle">{it.meta}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
