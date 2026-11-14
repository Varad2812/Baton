"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { GradeChip } from "@/components/ui/grade-chip";

export function InteractiveDemos() {
  const [drawer, setDrawer] = useState(false);
  const [seg, setSeg] = useState<"all" | "open" | "resolved">("open");
  const toast = useToast();
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-4">
        <SegmentedControl
          ariaLabel="Conflict filter"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "all", label: "All", count: 6 },
            { value: "open", label: "Open", count: 3 },
            { value: "resolved", label: "Resolved", count: 0 },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Dialog
            trigger={<Button variant="outline" size="sm">Open dialog</Button>}
            title="Reject claim"
            description="Rejected claims are excluded from every compiled handover."
            footer={<Button size="sm" variant="destructive">Reject claim</Button>}
          >
            <p className="text-[13px] text-muted">Hosting moved from Vercel to Render on 14 Feb</p>
          </Dialog>
          <Button variant="outline" size="sm" onClick={() => setDrawer(true)}>
            Open drawer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast({ title: "Not connected yet", body: "Resolving a conflict is wired to the pipeline branch.", tone: "neutral" })}
          >
            Show toast
          </Button>
          <Tooltip content="2 independent sources: PR #84 (merged), #dev 12-Mar">
            <GradeChip grade="VERIFIED" />
          </Tooltip>
        </div>
      </div>
      <Tabs
        items={[
          { value: "upload", label: "Upload", content: <p className="text-[13px] text-muted">.md .txt .csv .json .docx</p> },
          { value: "github", label: "GitHub", content: <p className="text-[13px] text-muted">festflow-club/festflow</p> },
          { value: "fixtures", label: "Fixtures", count: 9, content: <p className="text-[13px] text-muted">9 fixture files</p> },
        ]}
      />
      <Drawer
        open={drawer}
        onOpenChange={setDrawer}
        title="Auth moved from Firebase to Supabase on 12 Mar"
        subtitle={<GradeChip grade="VERIFIED" />}
      >
        <p className="text-[13px] text-muted">Firebase free tier hit limits during fest sign-ups. PR #84, #dev 12-Mar, notes 14-Mar.</p>
      </Drawer>
    </div>
  );
}
