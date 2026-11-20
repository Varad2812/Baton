"use client";
import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { TeamResult } from "@/app/_actions/team";

export function TeamForm({ action, children, label }: { action: (s: TeamResult, f: FormData) => Promise<TeamResult>; children?: ReactNode; label: string }) {
  const [state, submit, pending] = useActionState(action, { message: "" });
  return <form action={submit} className="my-4 space-y-3">
    {children}
    <Button type="submit" disabled={pending}>{pending ? "Please wait…" : label}</Button>
    <p role="status" className="text-sm text-muted">{state.message}</p>
    {state.link && <label className="block text-sm">Private invitation link
      <input readOnly value={new URL(state.link, window.location.origin).href} onFocus={e => e.currentTarget.select()} className="mt-1 w-full rounded border border-border bg-bg p-2"/>
    </label>}
  </form>;
}
