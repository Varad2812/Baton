"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { BookOpen, ChevronDown, CircleHelp, Compass, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { requestTourStart, subscribeTourRecord, tourRecordSnapshot } from "@/components/tour/store";
import { TOUR_SLUG } from "@/components/tour/steps";
import { GlossaryDialog } from "@/components/shell/glossary";

/** Opens the Start here guide drawer from anywhere (the guide listens for this event). */
export const GUIDE_OPEN_EVENT = "baton:guide-open";
export function openGuide() {
  window.dispatchEvent(new Event(GUIDE_OPEN_EVENT));
}

/** Help: the guided tour, the Start here guide and the glossary. Top bar and sidebar footer. */
export function HelpMenu({ variant = "topbar", slug = TOUR_SLUG }: { variant?: "topbar" | "sidebar"; slug?: string }) {
  const router = useRouter();
  const [glossary, setGlossary] = useState(false);
  // Server snapshot "seen" so SSR never renders the dot (no hydration mismatch).
  const record = useSyncExternalStore(subscribeTourRecord, tourRecordSnapshot, () => "seen");
  const unseen = record === "";
  const item = "flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-text outline-none data-[highlighted]:bg-surface";
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          data-help-menu={variant}
          aria-label={unseen ? "Help (tour not taken yet)" : "Help"}
          className={cn(
            "relative flex items-center gap-1.5 rounded-md text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
            variant === "topbar"
              ? "h-8 px-2 text-muted hover:bg-surface-2 hover:text-text data-[popup-open]:bg-surface-2"
              : "h-8 w-full px-2.5 text-muted hover:bg-surface-2/60 hover:text-text data-[popup-open]:bg-surface-2",
          )}
        >
          <CircleHelp className="size-4 text-subtle" aria-hidden />
          <span className={variant === "topbar" ? "hidden lg:inline" : "flex-1 text-left"}>Help</span>
          {variant === "topbar" && <ChevronDown aria-hidden className="hidden size-3.5 text-subtle lg:block" />}
          {unseen && <span aria-hidden className="absolute left-5 top-1.5 size-1.5 rounded-full bg-primary" />}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align={variant === "topbar" ? "end" : "start"} side={variant === "topbar" ? "bottom" : "top"} className="z-[70]">
            <Menu.Popup className="w-[260px] rounded-lg border border-border bg-surface-2 p-1 shadow-xl shadow-black/50 outline-none transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
              <Menu.Item
                data-tour-button
                className={item}
                onClick={() => {
                  if (!requestTourStart()) router.push(`/p/${slug}?tour=1`);
                }}
              >
                <Compass className="size-4 text-primary" aria-hidden />
                <span className="flex-1">
                  Take the 60-second tour
                  <span className="block text-xs text-muted">Nine steps through a finished handover</span>
                </span>
              </Menu.Item>
              <Menu.Item data-help="guide" className={item} onClick={openGuide}>
                <ListChecks className="size-4 text-subtle" aria-hidden />
                <span className="flex-1">
                  Start here guide
                  <span className="block text-xs text-muted">Eight steps you click through yourself</span>
                </span>
              </Menu.Item>
              <Menu.Item data-help="glossary" className={item} onClick={() => setGlossary(true)}>
                <BookOpen className="size-4 text-subtle" aria-hidden />
                <span className="flex-1">
                  Glossary
                  <span className="block text-xs text-muted">Grades and terms in plain words</span>
                </span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <GlossaryDialog open={glossary} onOpenChange={setGlossary} />
    </>
  );
}
