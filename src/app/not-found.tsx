import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md">
        <p className="font-mono text-xs text-subtle">404</p>
        <h1 className="mt-2 font-serif text-2xl font-semibold">Nothing handed over here</h1>
        <p className="mt-2 text-[13px] text-muted">
          This project or page does not exist. The demo project is FestFlow, preloaded with a full pipeline result.
        </p>
        <div className="mt-5 flex gap-2">
          <Link href="/p/festflow" className={buttonVariants({ size: "sm" })}>
            Open FestFlow
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
