"use client";

import { useTransition } from "react";
import { FileJson, FileText, Link2, Loader2 } from "lucide-react";
import { createShareLink } from "@/app/_actions/share";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

/** Markdown / JSON downloads of your role view, and a read-only share link to the approved version. */
export function ExportButtons({ slug, canShare, shareReason }: { slug: string; canShare: boolean; shareReason: string | null }) {
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const share = (
    <Button
      size="sm"
      variant="outline"
      disabled={!canShare || pending}
      data-share-link
      onClick={() =>
        start(async () => {
          const r = await createShareLink(slug);
          if (r.ok && r.data) {
            const url = `${window.location.origin}${r.data.path}`;
            try {
              await navigator.clipboard.writeText(url);
            } catch {
              window.prompt("Copy this read-only link:", url);
            }
          }
          toast(r);
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
      Share link
    </Button>
  );
  return (
    <>
      <a href={`/api/projects/${slug}/handover/export?format=md`} className={buttonVariants({ size: "sm", variant: "outline" })} data-export="md" download>
        <FileText className="size-3.5" /> Markdown
      </a>
      <a href={`/api/projects/${slug}/handover/export?format=json`} className={buttonVariants({ size: "sm", variant: "outline" })} data-export="json" download>
        <FileJson className="size-3.5" /> JSON
      </a>
      {shareReason ? <Tooltip content={shareReason}>{share}</Tooltip> : share}
    </>
  );
}
