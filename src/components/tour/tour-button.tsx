"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requestTourStart, subscribeTourRecord, tourRecordSnapshot } from "./store";
import { TOUR_SLUG } from "./steps";

/**
 * Starts the guided tour. Inside /p/[slug] it talks to the mounted <Tour />; anywhere else it
 * navigates to /p/festflow?tour=1. Shows a small amber dot until the tour was finished or skipped.
 */
export function TourButton({ slug = TOUR_SLUG, label = "Tour", className }: { slug?: string; label?: string; className?: string }) {
  const router = useRouter();
  // Server snapshot "seen" so SSR never renders the dot (no hydration mismatch).
  const record = useSyncExternalStore(subscribeTourRecord, tourRecordSnapshot, () => "seen");
  const unseen = record === "";
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("relative", className)}
      data-tour-button
      onClick={() => {
        if (!requestTourStart()) router.push(`/p/${slug}?tour=1`);
      }}
      aria-label={unseen ? `${label} (not taken yet)` : label}
    >
      <Compass className="size-3.5" />
      {label}
      {unseen && <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />}
    </Button>
  );
}
