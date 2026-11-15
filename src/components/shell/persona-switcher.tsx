"use client";

import { useTransition } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { setPersona } from "@/app/_actions/persona";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type P = { key: string; name: string; role: string; roleTitle: string; sees: string };

export function PersonaSwitcher({ current, personas }: { current: string; personas: P[] }) {
  const [pending, start] = useTransition();
  const me = personas.find((p) => p.key === current) ?? personas[0];
  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex h-8 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface px-2 text-[13px] outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary data-[popup-open]:bg-surface-2"
        aria-label={`Viewing as ${me.name}. Switch persona`}
      >
        <span className="hidden text-xs text-subtle 2xl:inline">Viewing as</span>
        {pending ? <Loader2 className="size-4 animate-spin text-subtle" /> : <Avatar name={me.name} size={20} />}
        <span className="font-medium text-text">{me.name}</span>
        <span className="rounded bg-surface-2 px-1 font-mono text-[10px] uppercase tracking-wide text-muted">{me.role}</span>
        <ChevronDown className="size-3.5 text-subtle" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-[70]">
          <Menu.Popup className="w-[320px] rounded-lg border border-border bg-surface-2 p-1 shadow-xl shadow-black/50 outline-none transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <div className="px-2.5 pb-1.5 pt-1 text-[11px] uppercase tracking-wide text-subtle">Switch who you are viewing as · no login</div>
            {personas.map((p) => (
              <Menu.Item
                key={p.key}
                onClick={() => start(async () => void (await setPersona(p.key)))}
                className={cn(
                  "mb-1 flex cursor-default items-start gap-2.5 rounded-md border px-2.5 py-2 outline-none data-[highlighted]:bg-surface",
                  p.key === current ? "border-primary/40 bg-surface" : "border-border",
                )}
              >
                <Avatar name={p.name} size={26} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-text">{p.name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-subtle">{p.role}</span>
                  </div>
                  <div className="text-xs text-muted">{p.roleTitle}</div>
                  <div className="mt-1 text-xs leading-snug text-muted">{p.sees}</div>
                </div>
                {p.key === current && <Check className="mt-1 size-4 text-primary" />}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
