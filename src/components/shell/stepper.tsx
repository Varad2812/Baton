import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShellData } from "@/lib/views/project";

const HREF: Record<string, string> = {
  connect: "/sources",
  reconstruct: "/ledger",
  verify: "/conflicts",
  review: "/review",
  handover: "/handover",
};

export function Stepper({ slug, stages }: { slug: string; stages: ShellData["stages"] }) {
  return (
    <ol className="flex h-9 items-center gap-0 overflow-hidden border-b border-border bg-bg px-6" aria-label="Handover progress">
      {stages.map((s, i) => (
        <li key={s.key} className="flex items-center">
          <Link
            href={`/p/${slug}${HREF[s.key]}`}
            aria-current={s.state === "active" ? "step" : undefined}
            className="group flex items-center gap-2 rounded-sm px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full border text-[9px] font-semibold",
                s.state === "done" && "border-verified/50 bg-verified/15 text-verified",
                s.state === "active" && "border-primary bg-primary/15 text-primary",
                s.state === "todo" && "border-border text-subtle",
              )}
            >
              {s.state === "done" ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-xs font-medium",
                s.state === "active" ? "text-text" : s.state === "done" ? "text-muted" : "text-subtle",
                "group-hover:text-text",
              )}
            >
              {s.label}
            </span>
            <span className="whitespace-nowrap font-mono text-[11px] text-subtle max-[1680px]:hidden">{s.detail}</span>
          </Link>
          {i < stages.length - 1 && (
            <span
              aria-hidden
              className={cn("mx-3 h-px w-10 max-[1680px]:w-8", s.state === "done" ? "bg-verified/40" : "bg-border")}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
