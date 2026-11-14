import { Globe, Lock, Users } from "lucide-react";
import type { Access } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { ACCESS_LABEL } from "@/lib/views/format";

const ICON = { PUBLIC: Globe, TEAM: Users, RESTRICTED: Lock } as const;

export function AccessChip({ access, className, iconOnly = false }: { access: Access; className?: string; iconOnly?: boolean }) {
  const Icon = ICON[access];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[4px] border px-1.5 text-[11px] font-medium uppercase tracking-wide",
        access === "RESTRICTED"
          ? "border-conflicting/30 bg-conflicting/10 text-conflicting"
          : access === "TEAM"
            ? "border-border bg-surface-2 text-muted"
            : "border-border bg-transparent text-subtle",
        className,
      )}
      title={`${ACCESS_LABEL[access]} access`}
    >
      <Icon className="size-3" aria-hidden />
      {!iconOnly && ACCESS_LABEL[access]}
    </span>
  );
}
