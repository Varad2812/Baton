"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-lg border border-conflicting/30 bg-surface p-6">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 text-conflicting" />
        <div>
          <h1 className="text-[15px] font-semibold text-text">This view could not load</h1>
          <p className="mt-1 text-[13px] text-muted">
            The database did not answer in time or returned something unexpected. Your data is safe; retrying usually
            works. If the demo looks broken, use Reset demo in the top bar.
          </p>
          {error.digest && <p className="mt-2 font-mono text-[11px] text-subtle">ref {error.digest}</p>}
          <Button size="sm" className="mt-4" onClick={reset}>
            <RotateCcw className="size-3.5" /> Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
