"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LazyEvidenceConstellation } from "@/components/three/lazy";
import type { ConstellationEdge, ConstellationNode } from "@/components/three/EvidenceConstellation";

/** Dashboard constellation: clicking a claim opens the evidence drawer in place (?claim=). */
export function ConstellationPanel({ nodes, edges, hiddenCount }: { nodes: ConstellationNode[]; edges: ConstellationEdge[]; hiddenCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <LazyEvidenceConstellation
      className="h-[300px]"
      nodes={nodes}
      edges={edges}
      hiddenCount={hiddenCount}
      onSourceClick={(id) => router.push(`${pathname.replace(/\/?$/, "")}/ledger?source=${encodeURIComponent(id)}`)}
      highlightClaimId={sp.get("claim") ?? undefined}
      onClaimClick={(id) => {
        const next = new URLSearchParams(sp.toString());
        next.set("claim", id);
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    />
  );
}
