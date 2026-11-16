"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function ResetDemo() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; ms?: number; counts?: { claims?: number } };
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Reset failed (HTTP ${res.status}). Please retry.`);
        return;
      }
      setOpen(false);
      toast({
        title: "Demo restored",
        body: `Your copy of the demo was reloaded from the seed in ${((body.ms ?? 0) / 1000).toFixed(1)} s.`,
        tone: "success",
      });
      router.refresh();
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
      trigger={
        <Button variant="outline" size="sm">
          <RotateCcw className="size-3.5" />
          Reset demo
        </Button>
      }
      title="Reset your copy of the demo?"
      description="Restores every source, fact, conflict, answer and approval in your private copy to the original seed. Other visitors have their own copy and are not affected."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={reset} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {busy ? "Restoring…" : "Reset demo"}
          </Button>
        </>
      }
    >
      <ul className="space-y-1.5 text-[13px] text-muted">
        <li>· Your edits, rejections, conflict resolutions and approvals are discarded.</li>
        <li>· Interview answers and follow-ups return to the seeded state (2 answered, 8 open).</li>
        <li>· The audit log keeps one <span className="font-mono text-xs text-text">demo.reset</span> entry.</li>
      </ul>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-conflicting/30 bg-conflicting/10 px-3 py-2 text-xs text-conflicting">
          {error}
        </p>
      )}
    </Dialog>
  );
}
