"use client";

import { useState, useTransition } from "react";
import { usePeople } from "@/components/common/people-context";
import { Loader2 } from "lucide-react";
import { answerFollowUp } from "@/app/_actions/handover";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/ui/toast";
import { fieldClass } from "@/components/ledger/claim-actions";
import { DraftButton } from "@/components/assistant/draft-button";
import { AssistedLabel } from "@/components/assistant/assisted-label";

export function FollowUpAnswer({ slug, followUpId }: { slug: string; followUpId: string }) {
  const people = usePeople();
  const [text, setTextRaw] = useState("");
  const [assisted, setAssisted] = useState(false);
  const setText = (v: string) => {
    setTextRaw(v);
    if (!v.trim()) setAssisted(false);
  };
  const [pending, start] = useTransition();
  const toast = useActionToast();
  return (
    <div className="mt-2 space-y-2">
      <div className="relative">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Answer this follow-up"
          placeholder={`Answer for ${people.successor}. Saved as testimony and cited like any other source.`}
          className={`${fieldClass} pr-16`}
        />
        <DraftButton
          className="absolute right-1.5 top-1.5"
          field="followup_answer"
          slug={slug}
          target={{ followUpId }}
          value={text}
          onApply={(next) => {
            setTextRaw(next);
            setAssisted(true);
          }}
        />
      </div>
      {assisted && <AssistedLabel text={`Drafted with assistant from your notes. Sending confirms it as your testimony, ${people.owner}.`} />}
      <div className="flex items-center justify-end gap-2">
        <span className="font-mono text-[11px] text-subtle">{text.length}/4000</span>
        <Button
          size="sm"
          disabled={pending || text.trim().length < 10}
          onClick={() =>
            start(async () => {
              const r = await answerFollowUp({ slug, followUpId, answer: text, assisted });
              toast(r, r.ok ? "Follow-up answered" : undefined);
              if (r.ok) setText("");
            })
          }
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          Send answer
        </Button>
      </div>
    </div>
  );
}
