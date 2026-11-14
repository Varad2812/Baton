import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md">
        <p className="font-mono text-xs text-subtle tabular-nums">404</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Nothing handed over here</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          This page or project does not exist. The demo project, FestFlow, is preloaded with a full pipeline result and
          needs no setup.
        </p>
        <div className="mt-6 flex gap-2">
          <Link href="/p/festflow" className={buttonVariants({ size: "sm" })}>
            Open live demo
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
