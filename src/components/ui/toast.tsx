"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "danger";
type ToastItem = { id: number; title: string; body?: string; tone: Tone };

const Ctx = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

/** Shows the result of a server action in a small, neutral toast. */
export function useActionToast() {
  const toast = useToast();
  return useCallback(
    (r: { ok: boolean; message: string; pending?: boolean; forbidden?: boolean }, title?: string) =>
      toast({
        title: title ?? (r.ok ? "Done" : r.pending ? "Not connected yet" : r.forbidden ? "Not allowed" : "Could not complete"),
        body: r.message,
        tone: r.ok ? "success" : r.pending ? "neutral" : "danger",
      }),
    [toast],
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[360px] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.tone === "success" ? CircleCheck : t.tone === "danger" ? CircleAlert : Info;
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 shadow-xl shadow-black/40 animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  t.tone === "success" ? "text-verified" : t.tone === "danger" ? "text-conflicting" : "text-muted",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text">{t.title}</p>
                {t.body && <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.body}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
                className="rounded p-0.5 text-subtle hover:text-text"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
