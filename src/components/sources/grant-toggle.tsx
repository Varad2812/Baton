"use client";

import { useTransition } from "react";
import { grantSourceToIncoming } from "@/app/_actions/pipeline";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function GrantToggle({ slug, sourceId, granted, canEdit }: { slug: string; sourceId: string; granted: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={granted}
      aria-label="Grant to incoming lead"
      disabled={!canEdit || pending}
      onClick={(e) => {
        e.stopPropagation();
        start(async () => toast(await grantSourceToIncoming({ slug, sourceId, granted: !granted })));
      }}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
        granted ? "border-primary/50 bg-primary/30" : "border-border bg-surface-2",
      )}
    >
      <span
        className={cn(
          "inline-block size-2.5 rounded-full transition-transform duration-150",
          granted ? "translate-x-3.5 bg-primary" : "translate-x-0.5 bg-subtle",
        )}
      />
    </button>
  );
  return canEdit ? sw : <Tooltip content="Only the owner can grant restricted sources">{sw}</Tooltip>;
}
