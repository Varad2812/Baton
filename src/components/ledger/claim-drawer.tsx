"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Drawer } from "@/components/ui/drawer";

/** URL-driven drawer shell: `?claim=` opens it, closing removes the param. Content is server-rendered. */
export function ClaimDrawerShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <Drawer
      open
      onOpenChange={(o) => {
        if (o) return;
        const next = new URLSearchParams(sp.toString());
        next.delete("claim");
        const qs = next.toString();
        router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      }}
      title={title}
      subtitle={subtitle}
      footer={footer}
      width={640}
    >
      {children}
    </Drawer>
  );
}
