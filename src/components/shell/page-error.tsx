"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Error boundary for one page: the shell (sidebar, top bar) stays usable; "Try again" re-renders just this page. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ slug?: string }>();
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", msg: "page error", digest: error.digest, error: error.message }));
  }, [error]);
  return (
    <div role="alert" className="mx-auto mt-16 max-w-lg rounded-lg border border-conflicting/30 bg-surface p-6">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 text-conflicting" />
        <div>
          <h1 className="text-[15px] font-semibold text-text">This page could not load</h1>
          <p className="mt-1 text-[13px] text-muted">
            The database did not answer in time or returned something unexpected. Your data is safe and the rest of the app still works;
            trying again usually fixes it. If the demo looks broken, use Reset demo in the top bar.
          </p>
          {error.digest && <p className="mt-2 font-mono text-[11px] text-subtle">ref {error.digest}</p>}
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={reset}>
              <RotateCcw className="size-3.5" /> Try again
            </Button>
            {params.slug && (
              <Link href={`/p/${params.slug}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                Go to dashboard
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
