"use client";

import { useState } from "react";
import Link from "next/link";
import { actOnRiskItem } from "@/app/_actions/radar";
import { ActionButton } from "@/components/common/action-button";
import { LazyRiskRadar } from "@/components/three/lazy";
import type { RadarTower } from "@/components/three/RiskRadar";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RiskItem } from "@/lib/radar/score";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<RiskItem["kind"], string> = {
  single_owner: "Single owner",
  one_source_decision: "One source",
  no_written_doc: "No written doc",
  secret_no_owner: "Secret, no owner",
  stale_task: "Stale task",
  missing: "Missing",
  conflict: "Conflict",
};

export function RadarView({
  slug,
  towers,
  items,
  canAct,
  actReason,
}: {
  slug: string;
  towers: RadarTower[];
  items: RiskItem[];
  canAct: boolean;
  actReason: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const shown = selected ? items.filter((i) => i.area === selected || `section:${i.area}` === selected) : items;
  const sel = towers.find((t) => t.key === selected);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Card className="overflow-hidden" data-testid="radar-3d">
        <CardHeader title="Risk by area" description="Each tower is a code area or handover section. Taller = riskier; red = one person holds it." />
        <LazyRiskRadar towers={towers} selected={selected} onSelect={(k) => setSelected((s) => (s === k ? null : k))} className="h-[380px] border-t border-border" />
      </Card>
      <Card>
        <CardHeader
          title={sel ? `${sel.label}: what to do` : "What to hand over first"}
          description={sel ? sel.detail : `${items.length} findings, riskiest first. Each has one action.`}
          actions={
            selected ? (
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-muted hover:text-text">
                Show all
              </button>
            ) : null
          }
        />
        {shown.length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-muted">{selected ? "Nothing to act on in this area at your access level." : "Nothing at risk at your access level."}</p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto border-t border-border" data-testid="risk-items">
            {shown.slice(0, 30).map((i) => (
              <li key={i.id} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-2.5" data-risk-item={i.kind}>
                <span
                  className={cn(
                    "mt-0.5 rounded px-1 text-center font-mono text-[11px] leading-[18px]",
                    i.severity >= 65 ? "bg-conflicting/15 text-conflicting" : i.severity >= 40 ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted",
                  )}
                  title="Severity 0-100"
                >
                  {i.severity}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" size="sm">
                      {KIND_LABEL[i.kind]}
                    </Badge>
                    {i.claimId ? (
                      <Link href={`/p/${slug}/ledger?claim=${encodeURIComponent(i.claimId)}`} className="truncate text-[13px] text-text hover:underline">
                        {i.title}
                      </Link>
                    ) : (
                      <span className="truncate text-[13px] text-text">{i.title}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{i.detail}</p>
                </div>
                {i.action.kind === "resolve" ? (
                  <Link href={`/p/${slug}/conflicts`} className="shrink-0 text-xs text-primary hover:underline">
                    {i.action.label}
                  </Link>
                ) : (
                  <ActionButton action={() => actOnRiskItem({ slug, itemId: i.id })} disabledReason={canAct ? null : actReason} className="shrink-0">
                    {i.action.label}
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
