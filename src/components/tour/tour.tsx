"use client";

/**
 * Guided tour of the FestFlow demo (no library). Mounted once in /p/[slug]/layout.tsx.
 * Starts on ?tour=1 or from <TourButton />. Each step navigates to its page, switches the demo
 * persona through the existing setPersona action when needed, waits for `[data-tour="…"]`, and
 * cuts it out of a dimmed backdrop. A missing target never breaks the tour: the popover is centred.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";
import { setPersona } from "@/app/_actions/persona";
import type { PersonaKey } from "@/lib/authz";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { TOUR_PERSONAS, TOUR_SLUG, TOUR_STEPS } from "./steps";
import { onTourCommand, readActiveStep, writeActiveStep, writeTourRecord } from "./store";

type Rect = { top: number; left: number; width: number; height: number };

const POP_W = 344;
const PAD = 6; // spotlight padding around the target
const GAP = 12; // distance between spotlight and popover
const EDGE = 16; // keep the popover this far from the viewport edge
const MISSING_AFTER_MS = 1600;

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Spotlight box: target rect + padding, clipped to the viewport. */
function spotlight(r: Rect): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = Math.max(4, r.top - PAD);
  const left = Math.max(4, r.left - PAD);
  const bottom = Math.min(vh - 4, r.top + r.height + PAD);
  const right = Math.min(vw - 4, r.left + r.width + PAD);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function placePopover(s: Rect | null, size: { w: number; h: number }, prefer: "bottom" | "top" | "left" | "right" = "bottom") {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - size.w - EDGE);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), vh - size.h - EDGE);
  if (!s) return { left: (vw - size.w) / 2, top: Math.max(EDGE, (vh - size.h) / 2) };
  const options = {
    bottom: { left: clampX(s.left + s.width / 2 - size.w / 2), top: s.top + s.height + GAP, fits: s.top + s.height + GAP + size.h <= vh - EDGE },
    top: { left: clampX(s.left + s.width / 2 - size.w / 2), top: s.top - GAP - size.h, fits: s.top - GAP - size.h >= EDGE },
    right: { left: s.left + s.width + GAP, top: clampY(s.top), fits: s.left + s.width + GAP + size.w <= vw - EDGE },
    left: { left: s.left - GAP - size.w, top: clampY(s.top), fits: s.left - GAP - size.w >= EDGE },
  };
  const order = [prefer, ...(["bottom", "top", "right", "left"] as const).filter((p) => p !== prefer)];
  for (const p of order) if (options[p].fits) return { left: options[p].left, top: options[p].top };
  // Target fills the screen: sit inside it, bottom-right, over the dim edge.
  return { left: vw - size.w - EDGE * 2, top: vh - size.h - EDGE * 2 };
}

export function Tour() {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<number | null>(null);
  // null = idle; otherwise what the popover says while switching persona / navigating.
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  // The route the current step pushed; the step stays busy until it commits (or 8s pass).
  const [nav, setNav] = useState<{ path: string; id: number } | null>(null);
  const [gaveUp, setGaveUp] = useState<number | null>(null);
  const navigating = nav !== null && pathname !== nav.path && gaveUp !== nav.id;
  const busy = busyLabel !== null || navigating;
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const [switched, setSwitched] = useState<PersonaKey | null>(null);
  const [popSize, setPopSize] = useState({ w: POP_W, h: 220 });
  const personaSet = useRef<PersonaKey | null>(null);
  const navToken = useRef(0);
  const pop = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const indexRef = useRef<number | null>(null);

  const step = index === null ? null : TOUR_STEPS[index];

  const goTo = useCallback(
    async (i: number) => {
      const s = TOUR_STEPS[i];
      if (!s) return;
      const token = ++navToken.current;
      setIndex(i);
      indexRef.current = i;
      writeActiveStep(i);
      setRect(null);
      setMissing(false);
      const href = `/p/${TOUR_SLUG}${s.path}${s.query ?? ""}`;
      const needsPersona = personaSet.current !== s.persona;
      setBusyLabel(needsPersona && personaSet.current !== null ? `Switching to ${TOUR_PERSONAS[s.persona].name}…` : "Opening the page…");
      try {
        if (needsPersona) {
          await setPersona(s.persona);
          if (token !== navToken.current) return;
          setSwitched(personaSet.current === null ? null : s.persona);
          personaSet.current = s.persona;
        } else {
          setSwitched(null);
        }
      } catch {
        // Persona switch failed: still show the step; the page explains what this persona sees.
      }
      if (token !== navToken.current) return;
      const path = `/p/${TOUR_SLUG}${s.path}`;
      setBusyLabel(null);
      if (window.location.pathname + window.location.search === href) return;
      // Stay busy (Next disabled) until the route commits, so quick clicks can't outrun navigation.
      setNav({ path, id: token });
      router.push(href, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    if (!nav) return;
    const t = window.setTimeout(() => setGaveUp(nav.id), 8000);
    return () => window.clearTimeout(t);
  }, [nav]);

  const start = useCallback(
    (at = 0) => {
      if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
      personaSet.current = null;
      void goTo(at);
    },
    [goTo],
  );

  const close = useCallback((outcome: "completed" | "skipped") => {
    navToken.current++;
    writeTourRecord(outcome, indexRef.current ?? 0);
    indexRef.current = null;
    setIndex(null);
    writeActiveStep(null);
    setBusyLabel(null);
    setNav(null);
    setRect(null);
    setSwitched(null);
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el?.isConnected) requestAnimationFrame(() => el.focus());
  }, []);

  // Entry points: ?tour=1, a resumed step after a hard reload, and TourButton commands.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resume = readActiveStep();
    const t = setTimeout(() => {
      if (params.get("tour") === "1") start(0);
      else if (resume !== null && resume >= 0 && resume < TOUR_STEPS.length) start(resume);
    }, 0);
    const off = onTourCommand(() => start(0));
    return () => {
      clearTimeout(t);
      off();
    };
  }, [start]);

  // Track the target: poll briefly (pages stream in, drawers animate) and follow scroll/resize.
  useEffect(() => {
    if (!step || busy) return;
    const expected = `/p/${TOUR_SLUG}${step.path}`;
    const began = performance.now();
    let scrolled = false;
    const tick = () => {
      const onPage = pathname === expected;
      const el = onPage ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      const r = el?.getBoundingClientRect();
      if (el && r && r.width > 0 && r.height > 0) {
        const vh = window.innerHeight;
        if (!scrolled && (r.top < 96 || r.bottom > vh - 24)) {
          scrolled = true;
          el.scrollIntoView({ block: r.height > vh - 160 ? "start" : "center", behavior: reducedMotion() ? "auto" : "smooth" });
        }
        scrolled = true;
        const next = { top: r.top, left: r.left, width: r.width, height: r.height };
        setRect((prev) => (sameRect(prev, next) ? prev : next));
        setMissing(false);
      } else {
        setRect(null);
        if (performance.now() - began > (onPage ? MISSING_AFTER_MS : MISSING_AFTER_MS * 3)) setMissing(true);
      }
    };
    tick();
    const id = window.setInterval(tick, 120);
    window.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", tick, true);
      window.removeEventListener("resize", tick);
    };
  }, [step, busy, pathname]);

  const ready = !!step && !busy && (rect !== null || missing);

  // Measure the popover so placement accounts for its real height.
  const open = index !== null;
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    const measure = () => {
      const { offsetWidth: w, offsetHeight: h } = el;
      setPopSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Focus the primary action when a step becomes ready.
  useEffect(() => {
    if (!ready) return;
    const focus = () => {
      if (!pop.current?.contains(document.activeElement)) nextBtn.current?.focus({ preventScroll: true });
    };
    focus();
    // A modal drawer on the page moves focus into itself when it opens; take it back once it settles.
    const t = window.setTimeout(focus, 350);
    return () => window.clearTimeout(t);
  }, [ready, index]);

  const next = useCallback(() => {
    if (index === null) return;
    if (index >= TOUR_STEPS.length - 1) close("completed");
    else void goTo(index + 1);
  }, [index, goTo, close]);
  const back = useCallback(() => {
    if (index !== null && index > 0) void goTo(index - 1);
  }, [index, goTo]);

  // Keys in the capture phase, so Escape closes the tour and not the drawer underneath.
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close("skipped");
      } else if (e.key === "ArrowRight" && !busy) {
        e.preventDefault();
        e.stopPropagation();
        next();
      } else if (e.key === "ArrowLeft" && !busy) {
        e.preventDefault();
        e.stopPropagation();
        back();
      } else if (e.key === "Tab" && pop.current) {
        // Keep focus inside the popover while the tour is open.
        const items = [...pop.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        e.stopPropagation();
        const to = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === -1 || at === items.length - 1 ? 0 : at + 1;
        items[to].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, busy, next, back, close]);

  if (!step || index === null || typeof document === "undefined") return null;

  const hole = rect && !missing ? spotlight(rect) : null;
  const pos = placePopover(hole, popSize, step.placement);
  const persona = TOUR_PERSONAS[step.persona];
  const last = index === TOUR_STEPS.length - 1;

  return createPortal(
    // aria-live keeps this region readable even while a modal drawer hides the rest of the page.
    <div data-tour-root data-state={busy ? "loading" : hole ? "anchored" : missing ? "centred" : "searching"} data-step={index + 1} aria-live="polite">
      {/* Click shield: the page stays visible but inert while the tour is open. */}
      <div
        aria-hidden
        className={cn("fixed inset-0 z-[90] transition-colors duration-200", hole ? "bg-transparent" : "bg-[#05060a]/60")}
        onPointerDown={(e) => e.preventDefault()}
      />
      {hole && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[91] rounded-lg ring-1 ring-primary/70 transition-[top,left,width,height] duration-200 ease-out"
          style={{ ...hole, boxShadow: "0 0 0 9999px rgba(5,6,10,0.62)" }}
        />
      )}
      <div
        ref={pop}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={cn(
          "fixed z-[92] rounded-lg border border-border bg-surface-2 shadow-2xl shadow-black/60 outline-none transition-[top,left,opacity] duration-200 ease-out",
          ready ? "opacity-100" : "opacity-95",
        )}
        style={{ width: POP_W, maxWidth: "calc(100vw - 32px)", top: pos.top, left: pos.left }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <span className="font-mono text-[11px] text-subtle">
            Step {index + 1} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => close("skipped")}
            aria-label="Close tour"
            className="-mr-1 rounded p-1 text-subtle outline-none hover:bg-surface hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="px-4 pb-3 pt-1">
          <h2 id="tour-title" className="text-[14px] font-semibold leading-snug text-text">
            {step.title}
          </h2>
          {busy ? (
            <p id="tour-body" className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              {busyLabel ?? "Opening the page…"}
            </p>
          ) : (
            <p id="tour-body" className="mt-1.5 text-[13px] leading-relaxed text-muted">
              {step.body}
            </p>
          )}
          {switched && !busy && (
            <div className="mt-2.5 flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-muted">
              <Avatar name={persona.name} size={18} />
              <span>
                Viewing as <span className="text-text">{persona.name}</span>
              </span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-subtle">{persona.role}</span>
            </div>
          )}
          {missing && !busy && (
            <p className="mt-2 text-xs text-subtle">This part of the page isn&apos;t on screen for this view, so the step is shown here instead.</p>
          )}
          {last && !busy && (
            <p className="mt-2 text-xs text-subtle">Switch identity any time from &ldquo;Viewing as&rdquo;, or press Reset demo to restore the seed.</p>
          )}
        </div>
        <div className="flex gap-1 px-4 pb-3" aria-hidden>
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className={cn("h-[3px] flex-1 rounded-full", i < index ? "bg-primary/50" : i === index ? "bg-primary" : "bg-border")} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
          <button
            type="button"
            onClick={() => close("skipped")}
            className="rounded px-1.5 py-1 text-xs text-subtle outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-1.5">
            <span className="mr-1 hidden items-center gap-1 text-[10px] text-subtle sm:flex">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
              <Kbd>Esc</Kbd>
            </span>
            {index > 0 && (
              <Button variant="ghost" size="sm" onClick={back} disabled={busy}>
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
            )}
            <Button ref={nextBtn} size="sm" onClick={next} disabled={busy}>
              {last ? "Finish" : "Next"}
              {!last && <ArrowRight className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
