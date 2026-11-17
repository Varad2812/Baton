import { PenLine } from "lucide-react";
import { provenanceLabel } from "@/lib/assistant/provenance";
import { cn } from "@/lib/utils";

/** Small provenance line for testimony written with Smart Draft (renders nothing otherwise). */
export function AssistedLabel({ meta, text, className }: { meta?: unknown; text?: string; className?: string }) {
  const label = text ?? provenanceLabel(meta);
  if (!label) return null;
  return (
    <span data-assisted-label className={cn("inline-flex items-center gap-1 text-[11px] text-subtle", className)}>
      <PenLine className="size-3" aria-hidden />
      {label}
    </span>
  );
}
