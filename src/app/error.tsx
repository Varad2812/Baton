"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md">
        <p className="font-mono text-xs text-subtle tabular-nums">
          Error{error.digest ? ` · ${error.digest}` : ""}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">This page failed to load</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Nothing was lost. The seeded demo data is untouched. Try again, or head back to the demo. If the server was
          asleep, the first request can take up to a minute.
        </p>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => reset()} className={buttonVariants({ size: "sm" })}>
            Try again
          </button>
          <Link href="/p/festflow" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open live demo
          </Link>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
