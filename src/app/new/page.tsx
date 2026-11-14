import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { NewProjectWizard } from "@/components/new-project/wizard";
import { TourButton } from "@/components/tour/tour-button";

export const metadata: Metadata = {
  title: "New handover · Baton",
  description: "Create a project, label its sources and build a verified handover.",
};

function BatonMark() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <rect x="3" y="14" width="14" height="2" rx="0.5" fill="#4C7BD9" opacity="0.8" />
      <rect x="3" y="10.5" width="14" height="2" rx="0.5" fill="#7A4FD1" opacity="0.8" />
      <rect x="3" y="7" width="14" height="2" rx="0.5" fill="#1F9E89" opacity="0.8" />
      <rect x="3" y="2.5" width="14" height="3" rx="0.75" fill="#E8A33D" />
    </svg>
  );
}

export default function NewProjectPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-[2px]">
        <div className="flex h-12 items-center justify-between gap-4 px-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
            <Link href="/" prefetch={false} className="flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <BatonMark />
              <span className="font-serif text-[15px] font-semibold tracking-tight text-text">Baton</span>
            </Link>
            <span className="text-subtle">/</span>
            <span className="text-muted">New handover</span>
          </nav>
          <div className="flex items-center gap-2">
            <TourButton slug="festflow" label="Tour the demo" />
            <Link href="/p/festflow" prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open FestFlow demo
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <NewProjectWizard />
      </main>
    </div>
  );
}
