"use client";

import { useEffect } from "react";

/** "Try this:" line. Marks the target element with data-try so CSS draws an amber ring around it. */
export function TryHint({ text, selector }: { text: string; selector?: string }) {
  useEffect(() => {
    if (!selector) return;
    let el: Element | null = null;
    const find = () => {
      if (el) return;
      el = document.querySelector(selector);
      el?.setAttribute("data-try", "1");
    };
    find();
    const t = setTimeout(find, 600);
    return () => {
      clearTimeout(t);
      el?.removeAttribute("data-try");
    };
  }, [selector]);
  return (
    <p className="mt-1.5 text-[13px] text-text" data-testid="try-this">
      <span className="mr-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">Try this</span>
      {text}
    </p>
  );
}
