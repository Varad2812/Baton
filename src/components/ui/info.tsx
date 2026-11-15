import { Info as InfoIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

/** Small (i) with one plain sentence. Use next to every metric and grade. */
export function Info({ text, className }: { text: React.ReactNode; className?: string }) {
  return (
    <Tooltip content={text} className={className}>
      <InfoIcon className="size-3.5 text-subtle hover:text-muted" aria-label="What is this?" />
    </Tooltip>
  );
}
