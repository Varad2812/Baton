import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/authz";
import { errorFields, log } from "@/lib/log";

export type ActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; forbidden?: boolean; message: string };

export function okResult<T>(message: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

export function errorResult(e: unknown): ActionResult<never> {
  if (e instanceof ForbiddenError) return { ok: false, forbidden: true, message: e.message };
  if (e instanceof ZodError || (e && typeof e === "object" && "issues" in e && Array.isArray((e as ZodError).issues))) {
    const issue = (e as ZodError).issues[0];
    // Our schemas carry plain-language messages ("Type a question (at least 3 characters).").
    return { ok: false, message: issue ? issue.message : "Check the form and try again." };
  }
  // HttpError subclasses (NotFound / BadRequest / Conflict), PipelineBusyError, etc. carry a status.
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 600 && e instanceof Error) {
    return { ok: false, message: e.message };
  }
  if ((e as { code?: string })?.code === "P2025") return { ok: false, message: "Not found. Reload the page and retry." };
  log("error", "unhandled action error", errorFields(e));
  return { ok: false, message: "Something went wrong. Please retry." };
}
