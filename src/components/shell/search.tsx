"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";

export function GlobalSearch({ slug }: { slug: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        router.push(`/p/${slug}/ledger${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      }}
      className="relative w-[280px]"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
      <input
        ref={ref}
        type="search"
        name="q"
        placeholder="Search facts, quotes, topics"
        aria-label="Search facts"
        className="h-8 w-full rounded-md border border-border bg-bg pl-8 pr-8 text-[13px] text-text placeholder:text-subtle outline-none transition-colors focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
    </form>
  );
}
