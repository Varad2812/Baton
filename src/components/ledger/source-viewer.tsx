"use client";

import { useState } from "react";
import { ExternalLink, Maximize2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** "Open source": the full chunk with the quote highlighted (content rendered on the server). */
export function SourceViewer({
  title,
  description,
  uri,
  children,
}: {
  title: string;
  description: string;
  uri?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs">
          <Maximize2 className="size-3" />
          Open source
        </Button>
      }
      title={title}
      description={description}
      className="w-[min(760px,calc(100vw-32px))]"
      footer={
        uri ? (
          <a
            href={uri}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
          >
            {uri.replace(/^https?:\/\//, "")}
            <ExternalLink className="size-3" />
          </a>
        ) : undefined
      }
    >
      {children}
    </Dialog>
  );
}
