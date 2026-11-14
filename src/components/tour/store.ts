/** Tiny pub/sub so a TourButton anywhere can start the Tour mounted in the project layout. */
type Command = { type: "start" };
const listeners = new Set<(c: Command) => void>();

export function onTourCommand(fn: (c: Command) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Returns false when no Tour is mounted on this page (the caller should navigate to ?tour=1). */
export function requestTourStart(): boolean {
  if (listeners.size === 0) return false;
  listeners.forEach((fn) => fn({ type: "start" }));
  return true;
}

/* Persistence. Storage can throw (private mode, blocked site data), so every access is guarded. */
const DONE_KEY = "baton.tour.v1";
const ACTIVE_KEY = "baton.tour.v1.active";
const CHANGE_EVENT = "baton:tour-change";

export type TourRecord = { outcome: "completed" | "skipped"; step: number; at: string };

export function readTourRecord(): TourRecord | null {
  try {
    const raw = window.localStorage.getItem(DONE_KEY);
    return raw ? (JSON.parse(raw) as TourRecord) : null;
  } catch {
    return null;
  }
}

export function writeTourRecord(outcome: TourRecord["outcome"], step: number) {
  try {
    window.localStorage.setItem(DONE_KEY, JSON.stringify({ outcome, step, at: new Date().toISOString() } satisfies TourRecord));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

/** Raw string snapshot for useSyncExternalStore (stable between calls). */
export function tourRecordSnapshot(): string {
  try {
    return window.localStorage.getItem(DONE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function subscribeTourRecord(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

/** The in-progress step survives a hard reload within the tab. */
export function readActiveStep(): number | null {
  try {
    const v = window.sessionStorage.getItem(ACTIVE_KEY);
    return v === null ? null : Number.parseInt(v, 10);
  } catch {
    return null;
  }
}

export function writeActiveStep(i: number | null) {
  try {
    if (i === null) window.sessionStorage.removeItem(ACTIVE_KEY);
    else window.sessionStorage.setItem(ACTIVE_KEY, String(i));
  } catch {
    /* ignore */
  }
}
