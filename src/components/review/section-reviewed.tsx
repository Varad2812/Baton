"use client";

import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { markSectionReviewed } from "@/app/_actions/review";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

export function SectionReviewed({ slug, section, reviewed, canEdit }: { slug: string; section: string; reviewed: { by: string; at: string } | null; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const toggle = () => start(async () => toast(await markSectionReviewed({ slug, section, reviewed: !reviewed })));
  const b = reviewed ? (
    <Button size="sm" variant="ghost" disabled={!canEdit || pending} onClick={toggle} className="text-verified hover:text-verified" aria-pressed>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      Reviewed
    </Button>
  ) : (
    <Button size="sm" variant="outline" disabled={!canEdit || pending} onClick={toggle} aria-pressed={false}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      Mark reviewed
    </Button>
  );
  const tip = !canEdit ? "Only the owner or reviewer marks sections reviewed" : reviewed ? `Marked by ${reviewed.by} · click to undo` : null;
  return tip ? <Tooltip content={tip}>{b}</Tooltip> : b;
}
