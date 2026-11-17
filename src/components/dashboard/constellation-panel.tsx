"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LazyEvidenceConstellation } from "@/components/three/lazy";
import type { ConstellationEdge, ConstellationNode } from "@/components/three/EvidenceConstellation";

/** Evidence map: clicking a fact opens the evidence drawer in place (?claim=); a source opens Facts filtered to it. */
export function ConstellationPanel({ nodes, edges, hiddenCount, base, className = "h-[300px]" }: { nodes: ConstellationNode[]; edges: ConstellationEdge[]; hiddenCount: number; base: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <LazyEvidenceConstellation
      className={className}
      nodes={nodes}
      edges={edges}
      hiddenCount={hiddenCount}
      onSourceClick={(id) => router.push(`${base}/ledger?source=${encodeURIComponent(id)}`)}
      highlightClaimId={sp.get("claim") ?? undefined}
      onClaimClick={(id) => {
        const next = new URLSearchParams(sp.toString());
        next.set("claim", id);
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    />
  );
}
